import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_HEALTH_SPREADSHEET_ID, requireTrainingEnvironment, trainingEnvironment,
  trainingCenterSpreadsheetId, trainingLockCollection, trainingSpreadsheetId } from "./trainingDeployment.js";
const qa = { APP_ENV: "qa", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa", QA_STAFF_ROSTER_SOURCE_SPREADSHEET_ID: "QA_WORKBOOK_TEST_ONLY" };
const production = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" };

test("training uses the server-owned environment; branch and preview alone never grant QA", () => {
  assert.equal(trainingEnvironment(qa), "qa");
  assert.equal(trainingEnvironment(production), "production");
  assert.equal(trainingEnvironment({ ...qa, VERCEL_GIT_COMMIT_REF: "feature/test" }), "qa");
  assert.equal(trainingEnvironment({ ...production, VERCEL_GIT_COMMIT_REF: "qa" }), "production");
  for (const context of [{}, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" },
    { APP_ENV: "qa", VERCEL_ENV: "production" }]) {
    assert.equal(trainingEnvironment(context), null);
    assert.throws(() => requireTrainingEnvironment(context), { code: "training-deployment-not-allowed" });
    assert.throws(() => trainingLockCollection(context), { code: "training-deployment-not-allowed" });
    assert.throws(() => trainingSpreadsheetId(context), { code: "ENVIRONMENT_UNRESOLVED" });
  }
});

test("QA and production have disjoint Firestore locks and workbook IDs", () => {
  assert.equal(trainingLockCollection(qa), "training_attendance_locks_qa");
  assert.equal(trainingLockCollection(production), "training_attendance_locks_production");
  assert.equal(trainingSpreadsheetId(qa), "QA_WORKBOOK_TEST_ONLY");
  assert.equal(trainingSpreadsheetId(production), DEFAULT_HEALTH_SPREADSHEET_ID);
  assert.throws(() => trainingSpreadsheetId({ APP_ENV: "qa" }), { code: "QA_SHEET_REQUIRED" });
  assert.throws(() => trainingSpreadsheetId({ ...qa, QA_STAFF_ROSTER_SOURCE_SPREADSHEET_ID: DEFAULT_HEALTH_SPREADSHEET_ID }),
    { code: "RESOURCE_ENV_MISMATCH" });
});

test("training reads preserve production canonical source and fail closed for incomplete QA/unknown", () => {
  assert.equal(trainingCenterSpreadsheetId({ ...production, STAFF_ROSTER_SOURCE_SPREADSHEET_ID: "WRONG_WORKBOOK" }), DEFAULT_HEALTH_SPREADSHEET_ID);
  assert.equal(trainingCenterSpreadsheetId(qa), "QA_WORKBOOK_TEST_ONLY");
  assert.throws(() => trainingCenterSpreadsheetId({ ...qa, QA_STAFF_ROSTER_SOURCE_SPREADSHEET_ID: "" }), { code: "QA_SHEET_REQUIRED" });
  assert.throws(() => trainingCenterSpreadsheetId({ ...qa, QA_STAFF_ROSTER_SOURCE_SPREADSHEET_ID: DEFAULT_HEALTH_SPREADSHEET_ID }), { code: "RESOURCE_ENV_MISMATCH" });
  for (const context of [{}, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/other" }]) {
    assert.throws(() => trainingCenterSpreadsheetId(context), { code: "ENVIRONMENT_UNRESOLVED" });
    assert.throws(() => trainingSpreadsheetId(context), { code: "ENVIRONMENT_UNRESOLVED" });
  }
});
