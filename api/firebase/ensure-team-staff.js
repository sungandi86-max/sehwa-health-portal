import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "../lib/firebaseAdmin.js";

const CURRENT_SCHOOL_YEAR = 2026;
const CURRENT_SEMESTER = 2;
const MICROSOFT_PROVIDER_ID = "microsoft.com";
const SCHOOL_DOMAIN = "@sehwa-gs.hs.kr";

function getAssignmentId(uid, schoolYear = CURRENT_SCHOOL_YEAR, semester = CURRENT_SEMESTER) {
  return `${uid}_${schoolYear}_${semester}`;
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

function isMicrosoftSchoolUser(decodedToken) {
  const provider = decodedToken.firebase?.sign_in_provider || "";
  const email = String(decodedToken.email || "").toLowerCase();
  return provider === MICROSOFT_PROVIDER_ID && email.endsWith(SCHOOL_DOMAIN);
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
    if (!isMicrosoftSchoolUser(decodedToken)) {
      return res.status(403).json({ ok: false, message: "학교 Teams 계정만 기본 권한을 설정할 수 있습니다." });
    }

    const db = getFirebaseAdminDb();
    const userRef = db.collection("users").doc(decodedToken.uid);
    const assignmentRef = db.collection("user_assignments").doc(getAssignmentId(decodedToken.uid));
    const now = Timestamp.now();

    const result = await db.runTransaction(async (transaction) => {
      const userSnapshot = await transaction.get(userRef);
      if (!userSnapshot.exists) {
        return { status: "missing-user" };
      }

      const userData = userSnapshot.data();
      if (userData.active === false) {
        return { status: "inactive-user" };
      }

      const assignmentSnapshot = await transaction.get(assignmentRef);
      if (assignmentSnapshot.exists) {
        return { status: "existing" };
      }

      transaction.set(assignmentRef, {
        uid: decodedToken.uid,
        schoolYear: CURRENT_SCHOOL_YEAR,
        semester: CURRENT_SEMESTER,
        roles: ["staff"],
        grade: null,
        classNo: null,
        position: "교사",
        active: true,
        createdAt: now,
        updatedAt: now,
      });

      return { status: "created" };
    });

    if (result.status === "missing-user") {
      return res.status(409).json({ ok: false, message: "사용자 기본 정보가 먼저 필요합니다." });
    }
    if (result.status === "inactive-user") {
      return res.status(403).json({ ok: false, message: "비활성 계정은 기본 권한을 설정할 수 없습니다." });
    }

    return res.status(200).json({ ok: true, status: result.status });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "기본 이용 권한을 설정하지 못했습니다." });
  }
}
