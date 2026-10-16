import { serverFirestoreResource } from "./firestoreResources.js";
import { firebaseRuntimePolicy } from "../../common/firebaseEnvironment.js";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "./firebaseAdmin.js";
import { getAssignmentId, getBearerToken, readStaffDirectory } from "./staffDirectory.js";
import { isQaInbodyAssignment, isQaInbodyUid, qaInbodyDirectoryIdentity, QA_INBODY_ROLE } from "./qaInbodySynthetic.js";
import { isQaCprAssignment, isQaCprUid, qaCprIdentity, QA_CPR_ROLE } from "./qaCprSynthetic.js";
import { isQaTbCertificateAssignment, isQaTbCertificateUid, qaTbCertificateIdentity,
  QA_TB_CERTIFICATE_ROLE } from "./qaTbCertificateSynthetic.js";
import { tbWorkflowTaskId, validatedSchoolYear } from "../../src/lib/tbScreeningWorkflowModel.js";

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

export async function verifyCurrentStaffSubmissionIdentity(req, { allowQaInbodySynthetic = false, allowQaCprSynthetic = false,
  allowQaTbCertificateSynthetic = false,
  auth = getFirebaseAdminAuth, database = getFirebaseAdminDb, directory = readStaffDirectory,
  context = process.env } = {}) {
  const idToken = getBearerToken(req);
  if (!idToken) return { ok: false, status: 401, message: "로그인이 필요합니다." };
  let decodedToken;
  try { decodedToken = await auth().verifyIdToken(idToken); }
  catch { return { ok: false, status: 401, message: "로그인 정보를 확인하지 못했습니다." }; }
  if (isQaInbodyUid(decodedToken.uid) && !allowQaInbodySynthetic) {
    return { ok: false, status: 403, message: "이 제출 유형을 이용할 권한이 없습니다." };
  }
  if (isQaCprUid(decodedToken.uid) && !allowQaCprSynthetic) {
    return { ok: false, status: 403, message: "이 제출 유형을 이용할 권한이 없습니다." };
  }
  if (isQaTbCertificateUid(decodedToken.uid) && !allowQaTbCertificateSynthetic) {
    return { ok: false, status: 403, message: "이 제출 유형을 이용할 권한이 없습니다." };
  }
  try {
    if ((isQaInbodyUid(decodedToken.uid) || isQaCprUid(decodedToken.uid) || isQaTbCertificateUid(decodedToken.uid)) &&
        firebaseRuntimePolicy(context).environment !== "qa") {
      return { ok: false, status: 403, message: "QA 전용 신청 권한이 없습니다." };
    }
    const db = database();
    const assignmentCollection = serverFirestoreResource(db,
      isQaCprUid(decodedToken.uid) || isQaTbCertificateUid(decodedToken.uid) ? "syntheticAssignments" : "assignments", context);
    const snapshot = await db.collection(assignmentCollection).doc(getAssignmentId(decodedToken.uid)).get();
    const assignment = snapshot.exists ? snapshot.data() : null;
    const staffId = String(assignment?.staffId || "").trim();
    const roles = Array.isArray(assignment?.roles) ? assignment.roles : [];
    if (assignment?.qaOnly === true || roles.includes(QA_INBODY_ROLE) || roles.includes(QA_CPR_ROLE)
      || roles.includes(QA_TB_CERTIFICATE_ROLE)) {
      if (!isQaInbodyUid(decodedToken.uid) && !isQaCprUid(decodedToken.uid) && !isQaTbCertificateUid(decodedToken.uid)) {
        return { ok: false, status: 403, message: "QA 전용 신청 권한이 없습니다." };
      }
    }
    if (isQaCprUid(decodedToken.uid)) {
      if (!isQaCprAssignment(decodedToken.uid, assignment, context)) {
        return { ok: false, status: 403, message: "QA 전용 신청 권한이 없습니다." };
      }
      return { ok: true, db, staffId, roles: [QA_CPR_ROLE], qaCprSynthetic: true, identity: qaCprIdentity(assignment) };
    }
    if (isQaTbCertificateUid(decodedToken.uid)) {
      if (!isQaTbCertificateAssignment(decodedToken.uid, assignment, context)) {
        return { ok: false, status: 403, message: "QA 전용 신청 권한이 없습니다." };
      }
      return { ok: true, db, staffId, roles: [QA_TB_CERTIFICATE_ROLE], qaTbCertificateSynthetic: true,
        identity: qaTbCertificateIdentity(assignment) };
    }
    if (isQaInbodyUid(decodedToken.uid)) {
      if (!isQaInbodyAssignment(decodedToken.uid, assignment, context)) {
        return { ok: false, status: 403, message: "QA 전용 신청 권한이 없습니다." };
      }
      const { directory: staff } = await directory({ allowInvalidEmploymentStatus: false });
      const identity = qaInbodyDirectoryIdentity(staff, assignment);
      if (!identity) return { ok: false, status: 403, message: "QA 신청자 정보를 확인할 수 없습니다." };
      return { ok: true, db, staffId, roles: [QA_INBODY_ROLE], qaSynthetic: true, identity };
    }
    if (!assignment || assignment.active !== true || (assignment.uid && assignment.uid !== decodedToken.uid) || !staffId || !roles.some((role) => ["staff", "homeroom", "health_teacher", "admin"].includes(role))) {
      return { ok: false, status: 403, message: "현재 학기 교직원 정보 연결이 필요합니다." };
    }
    return { ok: true, db, staffId, roles };
  } catch {
    return { ok: false, status: 503, message: "교직원 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}

export async function verifyTbSubmissionAllowed(req, options = {}) {
  const identity = await verifyCurrentStaffSubmissionIdentity(req, options);
  if (!identity.ok) return identity;
  try {
    const { db, staffId, roles } = identity;
    const schoolYear = options.schoolYear === undefined ? null : validatedSchoolYear(options.schoolYear);
    const taskId = schoolYear === null ? TB_SCREENING_TASK_ID : tbWorkflowTaskId(schoolYear);
    const statusCollection = serverFirestoreResource(db, "statuses", options.context || process.env);
    const statusSnapshot = await db
      .collection(statusCollection)
      .doc(`${staffId}_${taskId}`)
      .get();
    if (!statusSnapshot.exists) return { ...identity, ok: true, staffId, roles, statusValue: "unknown" };

    const statusData = statusSnapshot.data();
    const statusMatchesIdentity = statusData?.staffId === staffId && statusData?.taskId === taskId &&
      (schoolYear === null || statusData.schoolYear === schoolYear);
    if (statusMatchesIdentity && statusData?.status === "completed") {
      return { ok: false, status: 409, message: TB_COMPLETED_MESSAGE };
    }

    return { ...identity, ok: true, staffId, roles,
      statusValue: statusMatchesIdentity ? statusData?.status || "unknown" : "unknown" };
  } catch {
    return { ok: false, status: 503, message: "결핵검진 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}
