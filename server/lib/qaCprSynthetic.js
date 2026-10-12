import { trainingEnvironment } from "./trainingDeployment.js";

export const QA_CPR_UID = "qa-cpr-test-001";
export const QA_CPR_STAFF_ID = "QA-CPR-TEST-001";
export const QA_CPR_ROLE = "qa_cpr_synthetic_staff";
export const QA_CPR_EMAIL = "qa-cpr-test-001@qa.invalid";

export function isQaCprUid(uid) {
  return uid === QA_CPR_UID;
}

export function isQaCprAssignment(uid, assignment, context = process.env, now = Date.now()) {
  return trainingEnvironment(context) === "qa" &&
    isQaCprUid(uid) &&
    assignment?.uid === uid &&
    assignment?.active === false &&
    assignment?.qaOnly === true &&
    assignment?.environment === "qa" &&
    assignment?.staffId === QA_CPR_STAFF_ID &&
    Number(assignment?.schoolYear) === 2026 &&
    Number(assignment?.semester) === 2 &&
    Array.isArray(assignment?.roles) &&
    assignment.roles.length === 1 &&
    assignment.roles[0] === QA_CPR_ROLE &&
    Number.isFinite(Date.parse(assignment?.qaExpiresAt)) &&
    Date.parse(assignment.qaExpiresAt) > now;
}

export function qaCprIdentity(assignment) {
  if (!assignment || assignment.staffId !== QA_CPR_STAFF_ID) return null;
  return { staffId: QA_CPR_STAFF_ID, name: "[QA-CPR-TEST]", department: "QA 전용", position: "QA 테스트" };
}
