import { getFirebaseAdminAuth, getFirebaseAdminDb } from "./firebaseAdmin.js";
import { getAssignmentId, getBearerToken } from "./staffDirectory.js";

export const TB_SCREENING_TASK_ID = "tb-screening-2026";
export const TB_COMPLETED_MESSAGE = "이미 결핵검진 완료가 확인되어 추가 신청할 수 없습니다.";

export function isTbScreeningSubmission(payload) {
  return (
    payload?.type === "tb" ||
    payload?.type === "tb_registration" ||
    payload?.sheetName === "응답_결핵검진확인증" ||
    payload?.sheetName === "응답_교직원결핵검진유형선택"
  );
}

export function isCompletedTbStatus(statusData, staffId) {
  return (
    statusData?.staffId === staffId &&
    statusData?.taskId === TB_SCREENING_TASK_ID &&
    statusData?.status === "completed"
  );
}

export async function verifyTbSubmissionAllowed(req) {
  const idToken = getBearerToken(req);
  if (!idToken) return { ok: false, status: 401, message: "로그인이 필요합니다." };

  let decodedToken;
  try {
    decodedToken = await getFirebaseAdminAuth().verifyIdToken(idToken);
  } catch {
    return { ok: false, status: 401, message: "로그인 정보를 확인하지 못했습니다." };
  }

  try {
    const db = getFirebaseAdminDb();
    const assignmentSnapshot = await db.collection("user_assignments").doc(getAssignmentId(decodedToken.uid)).get();
    if (!assignmentSnapshot.exists) {
      return { ok: false, status: 403, message: "현재 학기 교직원 정보 연결이 필요합니다." };
    }

    const assignment = assignmentSnapshot.data();
    const staffId = String(assignment?.staffId || "").trim();
    if (assignment?.active !== true || (assignment?.uid && assignment.uid !== decodedToken.uid) || !staffId) {
      return { ok: false, status: 403, message: "현재 학기 교직원 정보 연결이 필요합니다." };
    }

    const statusSnapshot = await db
      .collection("staff_submission_status")
      .doc(`${staffId}_${TB_SCREENING_TASK_ID}`)
      .get();
    if (!statusSnapshot.exists) return { ok: true, staffId, statusValue: "unknown" };

    const statusData = statusSnapshot.data();
    const statusMatchesIdentity = statusData?.staffId === staffId && statusData?.taskId === TB_SCREENING_TASK_ID;
    if (isCompletedTbStatus(statusData, staffId)) {
      return { ok: false, status: 409, message: TB_COMPLETED_MESSAGE };
    }

    return { ok: true, staffId, statusValue: statusMatchesIdentity ? statusData?.status || "unknown" : "unknown" };
  } catch {
    return { ok: false, status: 503, message: "결핵검진 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}
