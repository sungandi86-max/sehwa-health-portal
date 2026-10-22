import assert from "node:assert/strict";
import test from "node:test";
import { isQaTrainingSyntheticAssignment, qaTrainingSyntheticDirectory,
  qaTrainingSyntheticIdentity } from "./qaTrainingAdminSynthetic.js";

const context = { APP_ENV: "qa", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" };

test("training ownership synthetic identities remain isolated to QA", () => {
  const identity = qaTrainingSyntheticIdentity("qa-training-admin-a");
  const assignment = { uid: "qa-training-admin-a", active: false, qaOnly: true, environment: "qa",
    staffId: identity.staffId, schoolYear: 2026, semester: 2, roles: ["training_admin"], qaExpiresAt: "2027-01-01T00:00:00.000Z" };
  assert.equal(isQaTrainingSyntheticAssignment(assignment.uid, assignment, context, Date.parse("2026-10-13T00:00:00Z")), true);
  assert.equal(isQaTrainingSyntheticAssignment(assignment.uid, assignment,
    { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }, Date.parse("2026-10-13T00:00:00Z")), false);
  assert.equal(isQaTrainingSyntheticAssignment(assignment.uid, { ...assignment, roles: ["admin"] }, context,
    Date.parse("2026-10-13T00:00:00Z")), false);
  assert.deepEqual(qaTrainingSyntheticDirectory().map(({ staffId }) => staffId),
    ["QA-TRAINING-A", "QA-TRAINING-B", "QA-TRAINING-C", "QA-TRAINING-HEALTH",
      "QA-TRAINING-TEACHER-1", "QA-TRAINING-TEACHER-2", "QA-TRAINING-OFFICE-1", "QA-TRAINING-HOURLY-1"]);
});
