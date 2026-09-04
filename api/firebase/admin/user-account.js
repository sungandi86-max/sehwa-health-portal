import { Timestamp } from "firebase-admin/firestore";
import { getAssignmentId, readJsonBody, sendCors, verifyDirectoryAdmin } from "../../lib/staffDirectory.js";

const CURRENT_SCHOOL_YEAR = 2026;
const CURRENT_SEMESTER = 2;
const SCAN_LIMIT = 500;
const DELETE_CONFIRM_TEXT = "삭제";

function normalizeUid(value) {
  return String(value || "").trim();
}

function isValidTerm(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

async function countQuery(queryRef) {
  const snapshot = await queryRef.count().get();
  return Number(snapshot.data().count || 0);
}

async function listIdentityDocs(db, targetUid) {
  const [assignmentsSnapshot, accessRequestsSnapshot] = await Promise.all([
    db.collection("user_assignments").where("uid", "==", targetUid).limit(SCAN_LIMIT).get(),
    db.collection("access_requests").where("uid", "==", targetUid).limit(SCAN_LIMIT).get(),
  ]);

  return {
    assignments: assignmentsSnapshot.docs,
    accessRequests: accessRequestsSnapshot.docs,
  };
}

async function authUserExists(auth, targetUid) {
  try {
    await auth.getUser(targetUid);
    return true;
  } catch (error) {
    if (error?.code === "auth/user-not-found") return false;
    throw error;
  }
}

async function scanUserDependencies(db, targetUid) {
  const [
    identityDocs,
    staffSubmissions,
    healthSubmissions,
    infectionReviewed,
    infectionCaseUpdated,
    accessRequestReviewed,
  ] = await Promise.all([
    listIdentityDocs(db, targetUid),
    countQuery(db.collection("staff_submissions").where("submitter.uid", "==", targetUid)),
    countQuery(db.collection("student_health_submissions").where("submittedBy.uid", "==", targetUid)),
    countQuery(db.collection("student_health_submissions").where("report.reviewedBy", "==", targetUid)),
    countQuery(db.collection("student_health_submissions").where("report.caseUpdatedBy", "==", targetUid)),
    countQuery(db.collection("access_requests").where("reviewedBy.uid", "==", targetUid)),
  ]);

  const activeAssignments = identityDocs.assignments.filter((documentSnapshot) => {
    return documentSnapshot.data()?.active === true;
  }).length;
  const auditRefs = infectionReviewed + infectionCaseUpdated + accessRequestReviewed;
  const businessRefs = staffSubmissions + healthSubmissions + auditRefs;

  return {
    canDelete: businessRefs === 0,
    references: {
      assignments: identityDocs.assignments.length,
      activeAssignments,
      accessRequests: identityDocs.accessRequests.length,
      staffSubmissions,
      healthSubmissions,
      auditRefs,
    },
    identityDocs,
  };
}

async function checkDeletion(req, res, db) {
  const url = new URL(req.url, "http://localhost");
  const targetUid = normalizeUid(url.searchParams.get("uid"));
  if (!targetUid) return res.status(400).json({ ok: false, message: "확인할 계정을 선택해 주세요." });

  const scan = await scanUserDependencies(db, targetUid);
  return res.status(200).json({
    ok: true,
    canDelete: scan.canDelete,
    references: scan.references,
    message: scan.canDelete
      ? "연결된 업무 기록이 없습니다. 완전 삭제 가능"
      : "업무 기록에 연결된 계정입니다. 비활성화만 가능합니다.",
  });
}

async function deactivateUser(req, res, access) {
  const body = await readJsonBody(req);
  const targetUid = normalizeUid(body.uid);
  const schoolYear = Number(body.schoolYear || CURRENT_SCHOOL_YEAR);
  const semester = Number(body.semester || CURRENT_SEMESTER);
  if (!targetUid || !isValidTerm(schoolYear) || !isValidTerm(semester)) {
    return res.status(400).json({ ok: false, message: "비활성화할 계정을 확인해 주세요." });
  }
  if (targetUid === access.decodedToken.uid) {
    return res.status(409).json({ ok: false, message: "현재 로그인한 계정은 비활성화할 수 없습니다." });
  }

  const now = Timestamp.now();
  const db = access.db;
  const batch = db.batch();
  const userRef = db.collection("users").doc(targetUid);
  const assignmentRef = db.collection("user_assignments").doc(getAssignmentId(targetUid, schoolYear, semester));
  const assignmentSnapshot = await assignmentRef.get();

  batch.set(userRef, {
    active: false,
    disabledAt: now,
    disabledBy: access.decodedToken.uid,
    updatedAt: now,
  }, { merge: true });
  if (assignmentSnapshot.exists) {
    batch.set(assignmentRef, {
      active: false,
      disabledAt: now,
      disabledBy: access.decodedToken.uid,
      updatedAt: now,
    }, { merge: true });
  }
  await batch.commit();

  return res.status(200).json({ ok: true, message: "계정 접근을 비활성화했습니다." });
}

async function deleteUser(req, res, access) {
  const body = await readJsonBody(req);
  const targetUid = normalizeUid(body.uid);
  const confirmText = String(body.confirmText || "").trim();
  if (!targetUid) return res.status(400).json({ ok: false, message: "삭제할 계정을 선택해 주세요." });
  if (targetUid === access.decodedToken.uid) {
    return res.status(409).json({ ok: false, message: "현재 로그인한 계정은 완전 삭제할 수 없습니다." });
  }
  if (confirmText !== DELETE_CONFIRM_TEXT) {
    return res.status(400).json({ ok: false, message: "완전 삭제 확인 문구를 입력해 주세요." });
  }

  const db = access.db;
  const existsInAuth = await authUserExists(access.auth, targetUid);
  if (!existsInAuth) {
    return res.status(404).json({ ok: false, message: "Firebase Auth 계정을 찾지 못했습니다." });
  }

  const scan = await scanUserDependencies(db, targetUid);
  if (!scan.canDelete) {
    return res.status(409).json({
      ok: false,
      message: "업무 기록에 연결된 계정입니다. 비활성화만 가능합니다.",
      references: scan.references,
    });
  }

  const batch = db.batch();
  batch.delete(db.collection("users").doc(targetUid));
  scan.identityDocs.assignments.forEach((documentSnapshot) => batch.delete(documentSnapshot.ref));
  scan.identityDocs.accessRequests.forEach((documentSnapshot) => batch.delete(documentSnapshot.ref));
  await batch.commit();
  await access.auth.deleteUser(targetUid);

  return res.status(200).json({
    ok: true,
    message: "테스트 계정을 완전히 삭제했습니다.",
    deleted: {
      assignments: scan.identityDocs.assignments.length,
      accessRequests: scan.identityDocs.accessRequests.length,
    },
  });
}

export default async function handler(req, res) {
  sendCors(res, "GET, PATCH, DELETE, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const access = await verifyDirectoryAdmin(req);
    if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });

    if (req.method === "GET") return checkDeletion(req, res, access.db);
    if (req.method === "PATCH") return deactivateUser(req, res, access);
    if (req.method === "DELETE") return deleteUser(req, res, access);

    return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });
  } catch {
    return res.status(500).json({ ok: false, message: "계정 관리 작업을 완료하지 못했습니다." });
  }
}
