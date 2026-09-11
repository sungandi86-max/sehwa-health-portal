import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "../../server/lib/firebaseAdmin.js";
import { notifyAdminPushSubscribers } from "../../server/lib/adminPushNotifications.js";
import { getAccessRequestPosition, normalizeAccessRequestApplicant } from "../../src/lib/accessRequestApplicant.js";

const CURRENT_SCHOOL_YEAR = 2026;
const CURRENT_SEMESTER = 2;
const GOOGLE_PROVIDER_ID = "google.com";
const MICROSOFT_PROVIDER_ID = "microsoft.com";
const ACCESS_REQUEST_LIMIT = 200;
const ACCESS_REQUEST_TYPES = {
  BASE_ACCESS: "base_access",
  HOMEROOM_ACCESS: "homeroom_access",
};
const ACCESS_REQUEST_TYPE_VALUES = new Set(Object.values(ACCESS_REQUEST_TYPES));

function getAssignmentId(uid, schoolYear = CURRENT_SCHOOL_YEAR, semester = CURRENT_SEMESTER) {
  return `${uid}_${schoolYear}_${semester}`;
}

function getAccessRequestId(uid, schoolYear = CURRENT_SCHOOL_YEAR, semester = CURRENT_SEMESTER, requestType = ACCESS_REQUEST_TYPES.BASE_ACCESS) {
  return requestType === ACCESS_REQUEST_TYPES.HOMEROOM_ACCESS
    ? `${getAssignmentId(uid, schoolYear, semester)}_homeroom`
    : getAssignmentId(uid, schoolYear, semester);
}

function normalizeRequestType(value) {
  const requestType = String(value || ACCESS_REQUEST_TYPES.BASE_ACCESS);
  return ACCESS_REQUEST_TYPE_VALUES.has(requestType) ? requestType : "";
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

function getProviderId(decodedToken) {
  return decodedToken.firebase?.sign_in_provider || "";
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const bodyText = Buffer.concat(chunks).toString("utf8");
  return bodyText ? JSON.parse(bodyText) : {};
}

function serializeTimestamp(value) {
  if (!value?.toDate) return null;
  return value.toDate().toISOString();
}

function serializeAccessRequest(documentSnapshot) {
  const data = documentSnapshot.data();
  return {
    id: documentSnapshot.id,
    requestType: data.requestType || ACCESS_REQUEST_TYPES.BASE_ACCESS,
    ...data,
    requestedAt: serializeTimestamp(data.requestedAt),
    updatedAt: serializeTimestamp(data.updatedAt),
    reviewedAt: serializeTimestamp(data.reviewedAt),
  };
}

async function verifyRequestUser(req) {
  const idToken = getBearerToken(req);
  if (!idToken) return null;

  return getFirebaseAdminAuth().verifyIdToken(idToken);
}

function hasReviewerRole(assignment) {
  return assignment.active === true && Array.isArray(assignment.roles) && assignment.roles.some((role) => ["health_teacher", "admin"].includes(role));
}

function hasRole(assignment, role) {
  return Array.isArray(assignment?.roles) && assignment.roles.includes(role);
}

function getProfileDisplayName(profile, fallback = "") {
  return profile?.displayNameOverride || profile?.displayName || fallback || "";
}

async function hasReviewerAccess(db, uid) {
  const assignmentSnapshot = await db.collection("user_assignments").doc(getAssignmentId(uid)).get();
  if (!assignmentSnapshot.exists) return false;

  return hasReviewerRole(assignmentSnapshot.data());
}

function normalizeHomeroomInput(input) {
  const grade = Number(input?.grade);
  const classNo = Number(input?.classNo);
  if (!Number.isInteger(grade) || grade < 1 || grade > 3) {
    return { homeroom: null, message: "학년을 선택해 주세요." };
  }
  if (!Number.isInteger(classNo) || classNo < 1 || classNo > 12) {
    return { homeroom: null, message: "반을 선택해 주세요." };
  }
  return { homeroom: { grade, classNo }, message: "" };
}

function normalizeBaseAccessHomeroomRequest(input) {
  const isHomeroomRequested = input?.isHomeroomRequested === true;
  if (!isHomeroomRequested) {
    return {
      request: {
        isHomeroomRequested: false,
        requestedGrade: null,
        requestedClassNo: null,
      },
      message: "",
    };
  }

  const { homeroom, message } = normalizeHomeroomInput({
    grade: input.requestedGrade,
    classNo: input.requestedClassNo,
  });
  if (!homeroom) return { request: null, message };

  return {
    request: {
      isHomeroomRequested: true,
      requestedGrade: homeroom.grade,
      requestedClassNo: homeroom.classNo,
    },
    message: "",
  };
}

function getBaseAccessAssignmentScope(accessRequest) {
  const { request } = normalizeBaseAccessHomeroomRequest(accessRequest);
  if (!request) return null;

  return {
    roles: request.isHomeroomRequested ? ["staff", "homeroom"] : ["staff"],
    grade: request.isHomeroomRequested ? request.requestedGrade : null,
    classNo: request.isHomeroomRequested ? request.requestedClassNo : null,
  };
}

function shouldNotifyRequestStatus(status) {
  return status === "created" || status === "resubmitted";
}

async function getCurrentRequest(req, res, decodedToken) {
  const db = getFirebaseAdminDb();
  const url = new URL(req.url, "http://localhost");
  const requestType = normalizeRequestType(url.searchParams.get("requestType"));
  if (!requestType) return res.status(400).json({ ok: false, message: "권한 신청 유형이 올바르지 않습니다." });

  const requestSnapshot = await db.collection("access_requests").doc(getAccessRequestId(decodedToken.uid, CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER, requestType)).get();

  return res.status(200).json({
    ok: true,
    request: requestSnapshot.exists ? serializeAccessRequest(requestSnapshot) : null,
  });
}

async function listRequests(req, res, decodedToken) {
  const db = getFirebaseAdminDb();
  const hasAccess = await hasReviewerAccess(db, decodedToken.uid);
  if (!hasAccess) return res.status(403).json({ ok: false, message: "관리자 권한을 확인해 주세요." });

  const url = new URL(req.url, "http://localhost");
  const status = url.searchParams.get("status") || "pending";
  const mode = url.searchParams.get("mode") || "list";
  const requestType = normalizeRequestType(url.searchParams.get("requestType"));
  const collectionRef = db.collection("access_requests");
  const baseQuery = status === "all" ? collectionRef : collectionRef.where("status", "==", status);
  if (url.searchParams.has("requestType") && !requestType) {
    return res.status(400).json({ ok: false, message: "권한 신청 유형이 올바르지 않습니다." });
  }

  const snapshot = await baseQuery.limit(ACCESS_REQUEST_LIMIT).get();
  const requests = snapshot.docs.map(serializeAccessRequest).filter((request) => !requestType || request.requestType === requestType).sort((left, right) => {
    const leftTime = Date.parse(left.requestedAt || "") || 0;
    const rightTime = Date.parse(right.requestedAt || "") || 0;
    return rightTime - leftTime;
  });
  if (mode === "count") return res.status(200).json({ ok: true, count: requests.length });

  return res.status(200).json({ ok: true, requests });
}

async function submitBaseAccessRequest(res, decodedToken, body) {
  if (getProviderId(decodedToken) !== GOOGLE_PROVIDER_ID) {
    return res.status(403).json({ ok: false, message: "Google 계정만 이용 권한을 신청할 수 있습니다." });
  }

  const { applicant, message } = normalizeAccessRequestApplicant(body.applicant);
  if (!applicant) return res.status(400).json({ ok: false, message });
  const { request: homeroomRequest, message: homeroomMessage } = normalizeBaseAccessHomeroomRequest(body);
  if (!homeroomRequest) return res.status(400).json({ ok: false, message: homeroomMessage });

  const db = getFirebaseAdminDb();
  const assignmentRef = db.collection("user_assignments").doc(getAssignmentId(decodedToken.uid));
  const requestRef = db.collection("access_requests").doc(getAssignmentId(decodedToken.uid));
  const now = Timestamp.now();

  const result = await db.runTransaction(async (transaction) => {
    const assignmentSnapshot = await transaction.get(assignmentRef);
    if (assignmentSnapshot.exists) return { status: "has-assignment" };

    const requestSnapshot = await transaction.get(requestRef);
    if (requestSnapshot.exists) {
      const requestData = requestSnapshot.data();
      if (requestData.status === "pending") return { status: "already-pending" };
      if (requestData.status === "approved") return { status: "already-approved" };
      if (requestData.status === "rejected") {
        transaction.update(requestRef, {
          status: "pending",
          requestedAt: now,
          updatedAt: now,
          reviewedBy: null,
          reviewedAt: null,
          reviewNote: null,
          applicant,
          ...homeroomRequest,
        });
        return { status: "resubmitted" };
      }
    }

    transaction.set(requestRef, {
      uid: decodedToken.uid,
      email: decodedToken.email || "",
      displayName: decodedToken.name || "",
      requestType: ACCESS_REQUEST_TYPES.BASE_ACCESS,
      schoolYear: CURRENT_SCHOOL_YEAR,
      semester: CURRENT_SEMESTER,
      requestedRole: "staff",
      status: "pending",
      requestedAt: now,
      updatedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      applicant,
      ...homeroomRequest,
    });

    return { status: "created" };
  });

  if (shouldNotifyRequestStatus(result.status)) {
    const homeroomText = homeroomRequest.isHomeroomRequested
      ? ` 담임 권한 포함 · ${homeroomRequest.requestedGrade}학년 ${homeroomRequest.requestedClassNo}반`
      : "";
    await notifyAdminPushSubscribers({
      dedupeKey: `base_access:${requestRef.id}`,
      type: ACCESS_REQUEST_TYPES.BASE_ACCESS,
      title: "이용 권한 신청",
      body: `${applicant.realName} · ${getAccessRequestPosition(applicant)}님이 이용 권한을 신청했습니다.${homeroomText}`,
      destination: "/firebase-admin/access-requests",
    });
  }

  return res.status(200).json({ ok: true, status: result.status });
}

async function submitHomeroomAccessRequest(res, decodedToken, body) {
  const { homeroom, message } = normalizeHomeroomInput(body.homeroom);
  if (!homeroom) return res.status(400).json({ ok: false, message });

  const db = getFirebaseAdminDb();
  const assignmentRef = db.collection("user_assignments").doc(getAssignmentId(decodedToken.uid));
  const requestRef = db.collection("access_requests").doc(getAccessRequestId(decodedToken.uid, CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER, ACCESS_REQUEST_TYPES.HOMEROOM_ACCESS));
  const userRef = db.collection("users").doc(decodedToken.uid);
  const now = Timestamp.now();

  const result = await db.runTransaction(async (transaction) => {
    const assignmentSnapshot = await transaction.get(assignmentRef);
    const requestSnapshot = await transaction.get(requestRef);
    const userSnapshot = await transaction.get(userRef);

    if (!assignmentSnapshot.exists) return { status: "missing-assignment" };

    const assignment = assignmentSnapshot.data();
    if (assignment.active !== true) return { status: "inactive-assignment" };
    if (hasRole(assignment, "homeroom")) return { status: "already-homeroom" };
    if (hasReviewerRole(assignment)) return { status: "not-needed" };

    if (requestSnapshot.exists) {
      const requestData = requestSnapshot.data();
      if (requestData.status === "pending") return { status: "already-pending" };
      if (requestData.status === "approved") return { status: "already-approved" };
      if (requestData.status === "rejected") {
        const requester = {
          displayName: getProfileDisplayName(userSnapshot.data(), decodedToken.name),
          department: assignment.department || "",
          position: assignment.position || "",
          staffId: assignment.staffId || "",
        };
        transaction.update(requestRef, {
          status: "pending",
          requestedAt: now,
          updatedAt: now,
          reviewedBy: null,
          reviewedAt: null,
          reviewNote: null,
          homeroom,
          requester,
        });
        transaction.update(assignmentRef, {
          homeroomStatusConfirmed: true,
          homeroomStatusChoice: "homeroom_teacher",
          homeroomStatusConfirmedAt: now,
          updatedAt: now,
        });
        return { status: "resubmitted", requester, homeroom };
      }
    }

    const requester = {
      displayName: getProfileDisplayName(userSnapshot.data(), decodedToken.name),
      department: assignment.department || "",
      position: assignment.position || "",
      staffId: assignment.staffId || "",
    };
    transaction.set(requestRef, {
      uid: decodedToken.uid,
      requestType: ACCESS_REQUEST_TYPES.HOMEROOM_ACCESS,
      schoolYear: CURRENT_SCHOOL_YEAR,
      semester: CURRENT_SEMESTER,
      requestedRole: "homeroom",
      status: "pending",
      requestedAt: now,
      updatedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      homeroom,
      requester,
    });
    transaction.update(assignmentRef, {
      homeroomStatusConfirmed: true,
      homeroomStatusChoice: "homeroom_teacher",
      homeroomStatusConfirmedAt: now,
      updatedAt: now,
    });

    return { status: "created", requester, homeroom };
  });

  if (result.status === "missing-assignment") {
    return res.status(409).json({ ok: false, message: "기본 이용 권한 확인 후 담임 권한을 신청할 수 있습니다." });
  }
  if (result.status === "inactive-assignment") {
    return res.status(409).json({ ok: false, message: "현재 학기 이용 권한이 활성화되어 있지 않습니다." });
  }
  if (result.status === "already-homeroom") {
    return res.status(200).json({ ok: true, status: result.status, message: "이미 담임 권한이 등록되어 있습니다." });
  }
  if (result.status === "not-needed") {
    return res.status(200).json({ ok: true, status: result.status, message: "관리자 권한 계정은 담임 권한 신청이 필요하지 않습니다." });
  }

  if (shouldNotifyRequestStatus(result.status)) {
    await notifyAdminPushSubscribers({
      dedupeKey: `homeroom_access:${requestRef.id}`,
      type: ACCESS_REQUEST_TYPES.HOMEROOM_ACCESS,
      title: "담임 권한 신청",
      body: `${result.requester?.displayName || "교직원"} · ${result.requester?.position || "교사"}님이 ${result.homeroom.grade}학년 ${result.homeroom.classNo}반 담임 권한을 신청했습니다.`,
      destination: "/firebase-admin/access-requests",
    });
  }

  return res.status(200).json({ ok: true, status: result.status });
}

async function confirmHomeroomStatus(res, decodedToken, body) {
  if (getProviderId(decodedToken) !== MICROSOFT_PROVIDER_ID) {
    return res.status(403).json({ ok: false, message: "학교 Teams 계정만 담임 여부를 확인할 수 있습니다." });
  }

  const choice = body.isHomeroomTeacher === true ? "homeroom_teacher" : "not_homeroom_teacher";
  const db = getFirebaseAdminDb();
  const assignmentRef = db.collection("user_assignments").doc(getAssignmentId(decodedToken.uid));
  const now = Timestamp.now();

  const result = await db.runTransaction(async (transaction) => {
    const assignmentSnapshot = await transaction.get(assignmentRef);
    if (!assignmentSnapshot.exists) return { status: "missing-assignment" };

    const assignment = assignmentSnapshot.data();
    if (assignment.active !== true) return { status: "inactive-assignment" };
    if (!hasRole(assignment, "staff")) return { status: "not-staff" };
    if (hasRole(assignment, "homeroom")) return { status: "already-homeroom" };
    if (hasReviewerRole(assignment)) return { status: "not-needed" };

    transaction.update(assignmentRef, {
      homeroomStatusConfirmed: true,
      homeroomStatusChoice: choice,
      homeroomStatusConfirmedAt: now,
      updatedAt: now,
    });
    return { status: "confirmed" };
  });

  if (result.status === "missing-assignment") {
    return res.status(409).json({ ok: false, message: "기본 이용 권한 확인 후 담임 여부를 선택할 수 있습니다." });
  }
  if (result.status === "inactive-assignment") {
    return res.status(409).json({ ok: false, message: "현재 학기 이용 권한이 활성화되어 있지 않습니다." });
  }
  if (result.status === "not-staff") {
    return res.status(403).json({ ok: false, message: "담임 여부 확인 대상이 아닙니다." });
  }
  if (result.status === "already-homeroom") {
    return res.status(200).json({ ok: true, status: result.status, message: "이미 담임 권한이 등록되어 있습니다." });
  }
  if (result.status === "not-needed") {
    return res.status(200).json({ ok: true, status: result.status, message: "관리자 권한 계정은 담임 여부 확인이 필요하지 않습니다." });
  }

  return res.status(200).json({ ok: true, status: result.status });
}

async function submitRequest(req, res, decodedToken) {
  const body = await readJsonBody(req);
  if (body.action === "confirmHomeroomStatus") {
    return confirmHomeroomStatus(res, decodedToken, body);
  }

  const requestType = normalizeRequestType(body.requestType);
  if (!requestType) return res.status(400).json({ ok: false, message: "권한 신청 유형이 올바르지 않습니다." });

  if (requestType === ACCESS_REQUEST_TYPES.HOMEROOM_ACCESS) {
    return submitHomeroomAccessRequest(res, decodedToken, body);
  }

  return submitBaseAccessRequest(res, decodedToken, body);
}

async function reviewRequest(req, res, decodedToken) {
  const db = getFirebaseAdminDb();
  const hasAccess = await hasReviewerAccess(db, decodedToken.uid);
  if (!hasAccess) return res.status(403).json({ ok: false, message: "관리자 권한을 확인해 주세요." });

  const body = await readJsonBody(req);
  const requestId = String(body.requestId || "");
  const action = String(body.action || "");
  if (!requestId || !["approve", "reject"].includes(action)) {
    return res.status(400).json({ ok: false, message: "요청 정보가 올바르지 않습니다." });
  }

  const requestRef = db.collection("access_requests").doc(requestId);
  const now = Timestamp.now();
  const reviewer = {
    uid: decodedToken.uid,
    email: decodedToken.email || "",
    displayName: decodedToken.name || "",
  };

  const result = await db.runTransaction(async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists) return { status: "missing-request" };

    const accessRequest = requestSnapshot.data();
    const requestType = accessRequest.requestType || ACCESS_REQUEST_TYPES.BASE_ACCESS;
    if (action === "approve") {
      const assignmentRef = db
        .collection("user_assignments")
        .doc(getAssignmentId(accessRequest.uid, accessRequest.schoolYear, accessRequest.semester));
      const assignmentSnapshot = await transaction.get(assignmentRef);
      if (requestType === ACCESS_REQUEST_TYPES.HOMEROOM_ACCESS) {
        const { homeroom } = normalizeHomeroomInput(accessRequest.homeroom);
        if (!homeroom) return { status: "invalid-homeroom-request" };
        if (!assignmentSnapshot.exists) return { status: "missing-assignment" };

        const assignment = assignmentSnapshot.data();
        if (assignment.active !== true) return { status: "inactive-assignment" };

        const roles = Array.isArray(assignment.roles) ? assignment.roles : [];
        const nextRoles = roles.includes("homeroom") ? roles : [...roles, "homeroom"];
        transaction.update(assignmentRef, {
          roles: nextRoles,
          grade: homeroom.grade,
          classNo: homeroom.classNo,
          updatedAt: now,
        });

        transaction.update(requestRef, {
          status: "approved",
          reviewedBy: reviewer,
          reviewedAt: now,
          updatedAt: now,
          reviewNote: null,
        });
        return { status: "approved" };
      }

      if (!assignmentSnapshot.exists) {
        const assignmentScope = getBaseAccessAssignmentScope(accessRequest);
        if (!assignmentScope) return { status: "invalid-homeroom-request" };

        transaction.set(assignmentRef, {
          uid: accessRequest.uid,
          schoolYear: accessRequest.schoolYear,
          semester: accessRequest.semester,
          roles: assignmentScope.roles,
          grade: assignmentScope.grade,
          classNo: assignmentScope.classNo,
          position: getAccessRequestPosition(accessRequest.applicant),
          active: true,
          createdAt: now,
          updatedAt: now,
        });
      }

      transaction.update(requestRef, {
        status: "approved",
        reviewedBy: reviewer,
        reviewedAt: now,
        updatedAt: now,
        reviewNote: null,
      });
      return { status: "approved" };
    }

    transaction.update(requestRef, {
      status: "rejected",
      reviewedBy: reviewer,
      reviewedAt: now,
      updatedAt: now,
      reviewNote: String(body.reviewNote || "").trim() || null,
    });
    return { status: "rejected" };
  });

  if (result.status === "missing-request") {
    return res.status(404).json({ ok: false, message: "권한 신청을 찾을 수 없습니다." });
  }
  if (result.status === "missing-assignment") {
    return res.status(409).json({ ok: false, message: "기본 이용 권한이 없어 담임 권한을 승인할 수 없습니다." });
  }
  if (result.status === "inactive-assignment") {
    return res.status(409).json({ ok: false, message: "현재 학기 이용 권한이 비활성 상태입니다." });
  }
  if (result.status === "invalid-homeroom-request") {
    return res.status(400).json({ ok: false, message: "담임 권한 신청 정보가 올바르지 않습니다." });
  }

  return res.status(200).json({ ok: true, status: result.status });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const decodedToken = await verifyRequestUser(req);
    if (!decodedToken) return res.status(401).json({ ok: false, message: "로그인이 필요합니다." });

    if (req.method === "GET") {
      const url = new URL(req.url, "http://localhost");
      return url.searchParams.get("mode") === "current"
        ? getCurrentRequest(req, res, decodedToken)
        : listRequests(req, res, decodedToken);
    }
    if (req.method === "POST") return submitRequest(req, res, decodedToken);
    if (req.method === "PATCH") return reviewRequest(req, res, decodedToken);

    return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });
  } catch {
    return res.status(500).json({ ok: false, message: "권한 신청 처리 중 문제가 발생했습니다." });
  }
}
