import { getFirebaseAdminAuth, getFirebaseAdminDb } from "./firebaseAdmin.js";
import { getAssignmentId, getBearerToken } from "./staffDirectory.js";

export const TB_SCREENING_TASK_ID = "tb-screening-2026";
export const TB_COMPLETED_MESSAGE = "이미 결핵검진 완료가 확인되어 추가 신청할 수 없습니다.";

export function isTbScreeningSubmission(payload) {
  return (
    payload?.type === "tb" ||
    payload?.type === "tb_registration"
  );
}

export function isCompletedTbStatus(statusData, staffId) {
  return (
    statusData?.staffId === staffId &&
    statusData?.taskId === TB_SCREENING_TASK_ID &&
    statusData?.status === "completed"
  );
}

export async function verifyCurrentStaffSubmissionIdentity(req) {
  const idToken = getBearerToken(req);
  if (!idToken) return { ok: false, status: 401, message: "로그인이 필요합니다." };
  let decodedToken;
  try { decodedToken = await getFirebaseAdminAuth().verifyIdToken(idToken); }
  catch { return { ok: false, status: 401, message: "로그인 정보를 확인하지 못했습니다." }; }
  try {
    const db = getFirebaseAdminDb();
    const snapshot = await db.collection("user_assignments").doc(getAssignmentId(decodedToken.uid)).get();
    const assignment = snapshot.exists ? snapshot.data() : null;
    const staffId = String(assignment?.staffId || "").trim();
    const roles = Array.isArray(assignment?.roles) ? assignment.roles : [];
    if (!assignment || assignment.active !== true || (assignment.uid && assignment.uid !== decodedToken.uid) || !staffId || !roles.some((role) => ["staff", "homeroom", "health_teacher", "admin"].includes(role))) {
      return { ok: false, status: 403, message: "현재 학기 교직원 정보 연결이 필요합니다." };
    }
    return { ok: true, db, staffId, roles };
  } catch {
    return { ok: false, status: 503, message: "교직원 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}

export async function verifyTbSubmissionAllowed(req) {
  const identity = await verifyCurrentStaffSubmissionIdentity(req);
  if (!identity.ok) return identity;
  try {
    const { db, staffId, roles } = identity;
    const statusSnapshot = await db
      .collection("staff_submission_status")
      .doc(`${staffId}_${TB_SCREENING_TASK_ID}`)
      .get();
    if (!statusSnapshot.exists) return { ok: true, staffId, roles, statusValue: "unknown" };

    const statusData = statusSnapshot.data();
    const statusMatchesIdentity = statusData?.staffId === staffId && statusData?.taskId === TB_SCREENING_TASK_ID;
    if (isCompletedTbStatus(statusData, staffId)) {
      return { ok: false, status: 409, message: TB_COMPLETED_MESSAGE };
    }

    return { ok: true, staffId, roles, statusValue: statusMatchesIdentity ? statusData?.status || "unknown" : "unknown" };
  } catch {
    return { ok: false, status: 503, message: "결핵검진 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}
