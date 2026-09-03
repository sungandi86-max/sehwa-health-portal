import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "../lib/firebaseAdmin.js";
import { getAccessRequestPosition, normalizeAccessRequestApplicant } from "../../src/lib/accessRequestApplicant.js";

const CURRENT_SCHOOL_YEAR = 2026;
const CURRENT_SEMESTER = 2;
const GOOGLE_PROVIDER_ID = "google.com";
const ACCESS_REQUEST_LIMIT = 200;

function getAssignmentId(uid, schoolYear = CURRENT_SCHOOL_YEAR, semester = CURRENT_SEMESTER) {
  return `${uid}_${schoolYear}_${semester}`;
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

async function hasHealthTeacherAccess(db, uid) {
  const assignmentSnapshot = await db.collection("user_assignments").doc(getAssignmentId(uid)).get();
  if (!assignmentSnapshot.exists) return false;

  const assignment = assignmentSnapshot.data();
  return assignment.active === true && Array.isArray(assignment.roles) && assignment.roles.includes("health_teacher");
}

async function getCurrentRequest(req, res, decodedToken) {
  const db = getFirebaseAdminDb();
  const requestSnapshot = await db.collection("access_requests").doc(getAssignmentId(decodedToken.uid)).get();

  return res.status(200).json({
    ok: true,
    request: requestSnapshot.exists ? serializeAccessRequest(requestSnapshot) : null,
  });
}

async function listRequests(req, res, decodedToken) {
  const db = getFirebaseAdminDb();
  const hasAccess = await hasHealthTeacherAccess(db, decodedToken.uid);
  if (!hasAccess) return res.status(403).json({ ok: false, message: "관리자 권한을 확인해 주세요." });

  const url = new URL(req.url, "http://localhost");
  const status = url.searchParams.get("status") || "pending";
  const mode = url.searchParams.get("mode") || "list";
  const collectionRef = db.collection("access_requests");
  const baseQuery = status === "all" ? collectionRef : collectionRef.where("status", "==", status);

  if (mode === "count") {
    const snapshot = await baseQuery.limit(ACCESS_REQUEST_LIMIT).get();
    return res.status(200).json({ ok: true, count: snapshot.size });
  }

  const snapshot = await baseQuery.limit(ACCESS_REQUEST_LIMIT).get();
  const requests = snapshot.docs.map(serializeAccessRequest).sort((left, right) => {
    const leftTime = Date.parse(left.requestedAt || "") || 0;
    const rightTime = Date.parse(right.requestedAt || "") || 0;
    return rightTime - leftTime;
  });
  return res.status(200).json({ ok: true, requests });
}

async function submitRequest(req, res, decodedToken) {
  if (getProviderId(decodedToken) !== GOOGLE_PROVIDER_ID) {
    return res.status(403).json({ ok: false, message: "Google 계정만 이용 권한을 신청할 수 있습니다." });
  }

  const body = await readJsonBody(req);
  const { applicant, message } = normalizeAccessRequestApplicant(body.applicant);
  if (!applicant) return res.status(400).json({ ok: false, message });

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
        });
        return { status: "resubmitted" };
      }
    }

    transaction.set(requestRef, {
      uid: decodedToken.uid,
      email: decodedToken.email || "",
      displayName: decodedToken.name || "",
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
    });

    return { status: "created" };
  });

  return res.status(200).json({ ok: true, status: result.status });
}

async function reviewRequest(req, res, decodedToken) {
  const db = getFirebaseAdminDb();
  const hasAccess = await hasHealthTeacherAccess(db, decodedToken.uid);
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
    if (action === "approve") {
      const assignmentRef = db
        .collection("user_assignments")
        .doc(getAssignmentId(accessRequest.uid, accessRequest.schoolYear, accessRequest.semester));
      const assignmentSnapshot = await transaction.get(assignmentRef);
      if (!assignmentSnapshot.exists) {
        transaction.set(assignmentRef, {
          uid: accessRequest.uid,
          schoolYear: accessRequest.schoolYear,
          semester: accessRequest.semester,
          roles: ["staff"],
          grade: null,
          classNo: null,
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
