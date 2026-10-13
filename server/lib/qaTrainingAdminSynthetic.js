import { trainingEnvironment } from "./trainingDeployment.js";

const IDENTITIES = Object.freeze({
  "qa-training-admin-a": Object.freeze({ staffId: "QA-TRAINING-A", name: "QA 교육담당 A", department: "QA 연구부", position: "QA 테스트", roles: ["training_admin"] }),
  "qa-training-admin-b": Object.freeze({ staffId: "QA-TRAINING-B", name: "QA 교육담당 B", department: "QA 교무부", position: "QA 테스트", roles: ["training_admin"] }),
  "qa-training-staff-c": Object.freeze({ staffId: "QA-TRAINING-C", name: "QA 일반교직원 C", department: "QA 부서", position: "QA 테스트", roles: ["staff"] }),
  "qa-training-health-admin": Object.freeze({ staffId: "QA-TRAINING-HEALTH", name: "QA 보건관리자", department: "QA 보건실", position: "QA 테스트", roles: ["health_teacher"] }),
});

export const QA_TRAINING_SYNTHETIC_IDENTITIES = IDENTITIES;

const TARGET_FIXTURES = Object.freeze([
  { staffId: "QA-TRAINING-TEACHER-1", name: "QA 교무부 교원", department: "교무교육과정부", position: "교사" },
  { staffId: "QA-TRAINING-TEACHER-2", name: "QA 연구부 교원", department: "연구정보부", position: "교사" },
  { staffId: "QA-TRAINING-OFFICE-1", name: "QA 행정실 직원", department: "행정실", position: "주무관" },
  { staffId: "QA-TRAINING-HOURLY-1", name: "QA 시간강사", department: "교무교육과정부", position: "시간강사" },
]);

export function qaTrainingSyntheticIdentity(uid) {
  return IDENTITIES[uid] || null;
}

export function qaTrainingSyntheticDirectory() {
  return [...Object.values(IDENTITIES), ...TARGET_FIXTURES].map((identity) => ({ ...identity, employmentStatus: "재직" }));
}

export function isQaTrainingSyntheticAssignment(uid, assignment, context = process.env, now = Date.now()) {
  const identity = qaTrainingSyntheticIdentity(uid);
  return trainingEnvironment(context) === "qa" && Boolean(identity) &&
    assignment?.uid === uid && assignment?.active === false && assignment?.qaOnly === true &&
    assignment?.environment === "qa" && assignment?.staffId === identity.staffId &&
    Number(assignment?.schoolYear) === 2026 && Number(assignment?.semester) === 2 &&
    JSON.stringify(assignment?.roles) === JSON.stringify(identity.roles) &&
    Number.isFinite(Date.parse(assignment?.qaExpiresAt)) && Date.parse(assignment.qaExpiresAt) > now;
}
