import { trainingEnvironment } from "./trainingDeployment.js";

export const QA_TB_CERTIFICATE_UID = "qa-tb-certificate-test-001";
export const QA_TB_CERTIFICATE_STAFF_ID = "QA-TB-CERT-TEST-001";
export const QA_TB_CERTIFICATE_ROLE = "qa_tb_certificate_synthetic_staff";
export const QA_TB_CERTIFICATE_EMAIL = "qa-tb-certificate-test-001@qa.invalid";

export function isQaTbCertificateUid(uid) { return uid === QA_TB_CERTIFICATE_UID; }

export function isQaTbCertificateAssignment(uid, assignment, context = process.env, now = Date.now()) {
  return trainingEnvironment(context) === "qa" && isQaTbCertificateUid(uid) && assignment?.uid === uid &&
    assignment?.active === false && assignment?.qaOnly === true && assignment?.environment === "qa" &&
    assignment?.staffId === QA_TB_CERTIFICATE_STAFF_ID && Number(assignment?.schoolYear) === 2026 &&
    Number(assignment?.semester) === 2 && Array.isArray(assignment?.roles) && assignment.roles.length === 1 &&
    assignment.roles[0] === QA_TB_CERTIFICATE_ROLE && Number.isFinite(Date.parse(assignment?.qaExpiresAt)) &&
    Date.parse(assignment.qaExpiresAt) > now;
}

export function qaTbCertificateIdentity(assignment) {
  if (!assignment || assignment.staffId !== QA_TB_CERTIFICATE_STAFF_ID) return null;
  return { staffId: QA_TB_CERTIFICATE_STAFF_ID, name: "[QA-TB-CERT-TEST]", department: "QA 전용", position: "QA 테스트" };
}
