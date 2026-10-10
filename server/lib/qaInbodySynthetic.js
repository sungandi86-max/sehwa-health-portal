import { trainingEnvironment } from "./trainingDeployment.js";

export const QA_INBODY_UID = "qa-inbody-test-001";
export const QA_INBODY_STAFF_ID = "QA-INBODY-TEST-001";
export const QA_INBODY_ROLE = "qa_synthetic_staff";
export const QA_INBODY_EMAIL = "qa-inbody-test-001@qa.invalid";

export function isQaInbodyUid(uid) {
  return uid === QA_INBODY_UID;
}

export function isQaInbodyAssignment(uid, assignment, context = process.env, now = Date.now()) {
  return trainingEnvironment(context) === "qa" &&
    isQaInbodyUid(uid) &&
    assignment?.uid === uid &&
    assignment?.active === false &&
    assignment?.qaOnly === true &&
    assignment?.environment === "qa" &&
    assignment?.staffId === QA_INBODY_STAFF_ID &&
    Number(assignment?.schoolYear) === 2026 &&
    Number(assignment?.semester) === 2 &&
    Array.isArray(assignment?.roles) &&
    assignment.roles.length === 1 &&
    assignment.roles[0] === QA_INBODY_ROLE &&
    Number.isFinite(Date.parse(assignment?.qaExpiresAt)) &&
    Date.parse(assignment.qaExpiresAt) > now;
}

export function qaInbodyDirectoryIdentity(directory, assignment) {
  const matches = directory.filter((row) => row.staffId === QA_INBODY_STAFF_ID);
  if (matches.length !== 1 || matches[0].employmentStatus !== "재직" ||
    !matches[0].name?.startsWith("[QA") || !matches[0].department?.startsWith("QA")) return null;
  return {
    staffId: assignment.staffId,
    name: matches[0].name,
    department: matches[0].department,
    position: matches[0].position || "",
  };
}
