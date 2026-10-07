import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_HEALTH_SPREADSHEET_ID, requireTrainingEnvironment, trainingEnvironment,
  trainingCenterSpreadsheetId, trainingLockCollection, trainingSpreadsheetId } from "./trainingDeployment.js";

const qa = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa", STAFF_ROSTER_SOURCE_SPREADSHEET_ID: "QA_WORKBOOK_TEST_ONLY" };
const production = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" };

test("only fixed QA and main production deployment contexts can write", () => {
  assert.equal(trainingEnvironment(qa), "qa");
  assert.equal(trainingEnvironment(production), "production");
  for (const context of [{}, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/training-center-phase2" },
    { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "qa" }]) {
    assert.equal(trainingEnvironment(context), null);
    assert.throws(() => requireTrainingEnvironment(context), { code: "training-deployment-not-allowed" });
    assert.throws(() => trainingLockCollection(context), { code: "training-deployment-not-allowed" });
  }
});

test("QA and production have disjoint Firestore collections and workbook IDs", () => {
  assert.equal(trainingLockCollection(qa), "training_attendance_locks_qa");
  assert.equal(trainingLockCollection(production), "training_attendance_locks_production");
  assert.equal(trainingSpreadsheetId(qa), "QA_WORKBOOK_TEST_ONLY");
  assert.equal(trainingSpreadsheetId(production), DEFAULT_HEALTH_SPREADSHEET_ID);
  assert.throws(() => trainingSpreadsheetId({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }),
    { code: "training-qa-workbook-required" });
  assert.throws(() => trainingSpreadsheetId({ ...qa, STAFF_ROSTER_SOURCE_SPREADSHEET_ID: DEFAULT_HEALTH_SPREADSHEET_ID }),
    { code: "training-qa-workbook-required" });
});

test("training center reads fail closed outside production, QA, and configured feature Preview", () => {
  const feature = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/training-center-phase2" };
  assert.equal(trainingCenterSpreadsheetId({ ...production, STAFF_ROSTER_SOURCE_SPREADSHEET_ID: "WRONG_WORKBOOK" }), DEFAULT_HEALTH_SPREADSHEET_ID);
  assert.equal(trainingCenterSpreadsheetId(qa), "QA_WORKBOOK_TEST_ONLY");
  assert.equal(trainingCenterSpreadsheetId({ ...feature, STAFF_ROSTER_SOURCE_SPREADSHEET_ID: "QA_WORKBOOK_TEST_ONLY" }), "QA_WORKBOOK_TEST_ONLY");
  for (const context of [qa, feature]) {
    assert.throws(() => trainingCenterSpreadsheetId({ ...context, STAFF_ROSTER_SOURCE_SPREADSHEET_ID: "" }),
      { code: "training-workbook-not-configured" });
    assert.throws(() => trainingCenterSpreadsheetId({ ...context, STAFF_ROSTER_SOURCE_SPREADSHEET_ID: DEFAULT_HEALTH_SPREADSHEET_ID }),
      { code: "training-workbook-not-configured" });
  }
  for (const context of [{}, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/other", STAFF_ROSTER_SOURCE_SPREADSHEET_ID: "QA_WORKBOOK_TEST_ONLY" },
    { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "qa" }]) {
    assert.throws(() => trainingCenterSpreadsheetId(context), { code: "training-environment-not-allowed" });
  }
  assert.equal(trainingSpreadsheetId(feature), DEFAULT_HEALTH_SPREADSHEET_ID, "general staff-directory behavior remains unchanged");
});
