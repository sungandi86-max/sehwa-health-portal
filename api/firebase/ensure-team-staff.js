import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "../../server/lib/firebaseAdmin.js";
import { notifyAdminPushSubscribers } from "../../server/lib/adminPushNotifications.js";
import {
  getAssignmentId,
  readStaffDirectory,
} from "../../server/lib/staffDirectory.js";
import {
  buildGoogleSignupPendingAssignment,
  getNewSignupRegistrationMode,
  getStaffIdAutoLinkClaimId,
  GOOGLE_PROVIDER_ID,
  isActiveStaffIdClaim,
  MICROSOFT_PROVIDER_ID,
  resolveNewSignupStaffId,
} from "../../server/lib/newSignupStaffId.js";

const CURRENT_SCHOOL_YEAR = 2026;
const CURRENT_SEMESTER = 2;
const SCHOOL_DOMAIN = "@sehwa-gs.hs.kr";

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

function getProviderId(decodedToken) {
  return decodedToken.firebase?.sign_in_provider || "";
}

function isSupportedSchoolUser(decodedToken) {
  const providerId = getProviderId(decodedToken);
  if (providerId === GOOGLE_PROVIDER_ID) return true;

  const email = String(decodedToken.email || "").toLowerCase();
  return providerId === MICROSOFT_PROVIDER_ID && email.endsWith(SCHOOL_DOMAIN);
}

function userProfileData(decodedToken, now) {
  return {
    uid: decodedToken.uid,
    email: decodedToken.email || "",
    displayName: decodedToken.name || "",
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

function microsoftAssignmentData(decodedToken, now, staffId = "") {
  return {
    uid: decodedToken.uid,
    schoolYear: CURRENT_SCHOOL_YEAR,
    semester: CURRENT_SEMESTER,
    roles: ["staff"],
    grade: null,
    classNo: null,
    position: "교사",
    assignmentSource: "teams_auto_staff",
    homeroomStatusConfirmed: false,
    active: true,
    ...(staffId ? { staffId } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

async function getNewSignupMatch(decodedToken) {
  try {
    const { directory } = await readStaffDirectory();
    const match = resolveNewSignupStaffId({
      providerId: getProviderId(decodedToken),
      providerDisplayName: decodedToken.name,
      directory,
    });
    return match;
  } catch (error) {
    console.error("[new-signup-staff-id] directory lookup failed", error instanceof Error ? error.name : "UnknownError");
    return { status: "directory-unavailable", normalizedStaffName: "", staffId: "" };
  }
}

async function ensureExistingMicrosoftAssignment(db, decodedToken) {
  const userRef = db.collection("users").doc(decodedToken.uid);
  const assignmentRef = db.collection("user_assignments").doc(getAssignmentId(decodedToken.uid));
  const now = Timestamp.now();

  return db.runTransaction(async (transaction) => {
    const [userSnapshot, assignmentSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(assignmentRef),
    ]);
    if (!userSnapshot.exists) return { status: "missing-user" };

    const userData = userSnapshot.data();
    if (userData.active === false) return { status: "inactive-user" };
    if (assignmentSnapshot.exists) return { status: "existing" };

    transaction.set(assignmentRef, microsoftAssignmentData(decodedToken, now));
    return {
      status: "created-existing-user",
      displayName: userData.displayNameOverride || userData.displayName || decodedToken.name || "교직원",
      position: "교사",
    };
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });

  try {
    const idToken = getBearerToken(req);
    if (!idToken) return res.status(401).json({ ok: false, message: "로그인이 필요합니다." });

    const decodedToken = await getFirebaseAdminAuth().verifyIdToken(idToken);
    if (!isSupportedSchoolUser(decodedToken)) {
      return res.status(403).json({ ok: false, message: "지원되는 학교 계정으로 로그인해 주세요." });
    }

    const db = getFirebaseAdminDb();
    const userRef = db.collection("users").doc(decodedToken.uid);
    const assignmentRef = db.collection("user_assignments").doc(getAssignmentId(decodedToken.uid));
    const [existingUserSnapshot, existingAssignmentSnapshot] = await Promise.all([
      userRef.get(),
      assignmentRef.get(),
    ]);
    const registrationMode = getNewSignupRegistrationMode({
      userExists: existingUserSnapshot.exists,
      assignmentExists: existingAssignmentSnapshot.exists,
      providerId: getProviderId(decodedToken),
    });

    if (registrationMode === "existing-user") {
      return res.status(200).json({ ok: true, status: "existing" });
    }

    if (registrationMode === "ensure-existing-microsoft-assignment") {
      const existingResult = await ensureExistingMicrosoftAssignment(db, decodedToken);
      if (existingResult.status === "missing-user") {
        return res.status(409).json({ ok: false, message: "사용자 기본 정보를 확인하지 못했습니다." });
      }
      if (existingResult.status === "inactive-user") {
        return res.status(403).json({ ok: false, message: "비활성 계정은 기본 이용 권한을 설정할 수 없습니다." });
      }
      if (existingResult.status === "created-existing-user") {
        await notifyAdminPushSubscribers({
          dedupeKey: `new_user:${decodedToken.uid}`,
          type: "new_staff_signup",
          title: "새 교직원 가입",
          body: `${existingResult.displayName} · ${existingResult.position}님이 온라인 보건실에 가입했습니다.`,
          destination: "/firebase-admin/users",
        });
      }
      return res.status(200).json({ ok: true, status: existingResult.status });
    }

    if (registrationMode === "register-user-only") {
      const now = Timestamp.now();
      const registrationResult = await db.runTransaction(async (transaction) => {
        const [userSnapshot, assignmentSnapshot] = await Promise.all([
          transaction.get(userRef),
          transaction.get(assignmentRef),
        ]);
        if (userSnapshot.exists) return { status: "existing" };

        transaction.set(userRef, userProfileData(decodedToken, now));
        return {
          status: "registered-existing-assignment",
          staffIdLinkStatus: assignmentSnapshot.exists ? "skipped-existing-assignment" : "skipped-race",
        };
      });
      return res.status(200).json({ ok: true, ...registrationResult });
    }

    const isMicrosoftSignup = getProviderId(decodedToken) === MICROSOFT_PROVIDER_ID;
    const match = isMicrosoftSignup
      ? await getNewSignupMatch(decodedToken)
      : { status: "pending-approval", normalizedStaffName: "", staffId: "" };
    const candidateStaffId = match.status === "matched" ? match.staffId : "";
    const claimRef = candidateStaffId
      ? db.collection("staff_id_auto_link_claims").doc(
          getStaffIdAutoLinkClaimId(candidateStaffId, CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER)
        )
      : null;
    const linkedAssignmentsQuery = candidateStaffId
      ? db.collection("user_assignments").where("staffId", "==", candidateStaffId)
      : null;
    const now = Timestamp.now();
    const result = await db.runTransaction(async (transaction) => {
      const [userSnapshot, assignmentSnapshot] = await Promise.all([
        transaction.get(userRef),
        transaction.get(assignmentRef),
      ]);
      const claimSnapshot = claimRef ? await transaction.get(claimRef) : null;
      const linkedAssignmentsSnapshot = linkedAssignmentsQuery
        ? await transaction.get(linkedAssignmentsQuery)
        : null;
      const claimData = claimSnapshot?.exists ? claimSnapshot.data() : null;
      const claimedAssignmentSnapshot = claimData?.assignmentId
        ? await transaction.get(db.collection("user_assignments").doc(claimData.assignmentId))
        : null;
      if (userSnapshot.exists) return { status: "existing" };

      transaction.set(userRef, userProfileData(decodedToken, now));
      if (assignmentSnapshot.exists) {
        return { status: "registered-existing-assignment", staffIdLinkStatus: "skipped-existing-assignment" };
      }

      const hasActiveDuplicate = linkedAssignmentsSnapshot?.docs.some((documentSnapshot) => {
        const assignment = documentSnapshot.data();
        return (
          assignment.active === true &&
          Number(assignment.schoolYear) === CURRENT_SCHOOL_YEAR &&
          Number(assignment.semester) === CURRENT_SEMESTER &&
          assignment.uid !== decodedToken.uid
        );
      }) === true;
      const hasActiveClaim = isActiveStaffIdClaim({
        claim: claimData,
        assignment: claimedAssignmentSnapshot?.exists ? claimedAssignmentSnapshot.data() : null,
        staffId: candidateStaffId,
        schoolYear: CURRENT_SCHOOL_YEAR,
        semester: CURRENT_SEMESTER,
      });
      const staffId = candidateStaffId && !hasActiveClaim && !hasActiveDuplicate
        ? candidateStaffId
        : "";
      transaction.set(
        assignmentRef,
        isMicrosoftSignup
          ? microsoftAssignmentData(decodedToken, now, staffId)
          : buildGoogleSignupPendingAssignment({
              uid: decodedToken.uid,
              schoolYear: CURRENT_SCHOOL_YEAR,
              semester: CURRENT_SEMESTER,
              createdAt: now,
            })
      );
      if (staffId) {
        transaction.set(claimRef, {
          uid: decodedToken.uid,
          assignmentId: assignmentRef.id,
          createdAt: now,
        });
      }

      return {
        status: "registered",
        staffIdLinkStatus: staffId
          ? "matched"
          : candidateStaffId ? "already-linked" : match.status,
        displayName: decodedToken.name || "교직원",
        position: isMicrosoftSignup ? "교사" : "",
        notifySignup: isMicrosoftSignup,
      };
    });

    if (result.notifySignup) {
      await notifyAdminPushSubscribers({
        dedupeKey: `new_user:${decodedToken.uid}`,
        type: "new_staff_signup",
        title: "새 교직원 가입",
        body: `${result.displayName} · ${result.position}님이 온라인 보건실에 가입했습니다.`,
        destination: "/firebase-admin/users",
      });
    }

    return res.status(200).json({
      ok: true,
      status: result.status,
      staffIdLinkStatus: result.staffIdLinkStatus || "skipped-existing-user",
    });
  } catch (error) {
    console.error("[new-user-registration] failed", error instanceof Error ? error.name : "UnknownError");
    return res.status(500).json({ ok: false, message: "사용자 등록 정보를 설정하지 못했습니다." });
  }
}
