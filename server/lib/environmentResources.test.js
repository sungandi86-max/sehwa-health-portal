import test from "node:test";
import assert from "node:assert/strict";
import { gasResource, resourceSecret, sheetResource, assertSheetResource, driveFolderResource, trainingDriveConfig,
  PRODUCTION_SHEETS, PRODUCTION_DRIVE_FOLDERS, resourceEnvironment } from "./environmentResources.js";
import submit from "../../api/submit.js";
import portal from "../../api/portal.js";
import healthRoom from "../../api/health-room-status.js";
import { readGoogleSheetValues } from "./staffDirectory.js";
import { GoogleDriveOAuthSignatureStorage } from "./trainingSignatureStorage.js";
import { productionOnlyExternalLink } from "../../src/lib/externalResourceLinks.js";

const url = (id) => `https://script.google.com/macros/s/${id}/exec`;
const qa = { APP_ENV: "qa", QA_SUBMISSION_GAS_URL: url("dedicated-qa"), QA_PORTAL_GAS_URL: url("portal-qa"),
  QA_STUDENT_CARE_GAS_URL: url("care-qa"), QA_STAFF_ROSTER_SOURCE_SPREADSHEET_ID: "QA_STAFF_FIXTURE",
  QA_RESEARCH_TRAINING_SPREADSHEET_ID: "QA_RESEARCH_FIXTURE", QA_CPR_DRIVE_FOLDER_ID: "qa-cpr-folder",
  QA_TB_CERTIFICATE_DRIVE_FOLDER_ID: "qa-tb-folder", QA_STUDENT_REPLY_DRIVE_FOLDER_ID: "qa-student-folder",
  QA_SUBMISSION_PROXY_SECRET: "mock-qa-submission-secret-sentinel", QA_STUDENT_CARE_PROXY_SECRET: "mock-qa-care-sentinel",
  QA_TRAINING_DRIVE_OAUTH_CLIENT_ID: "mock-client", QA_TRAINING_DRIVE_OAUTH_CLIENT_SECRET: "mock-oauth-sentinel",
  QA_TRAINING_DRIVE_OAUTH_REFRESH_TOKEN: "mock-refresh-sentinel" };
const prod = { VERCEL_ENV: "production", GAS_URL: url("operating"), SUBMISSION_PROXY_SECRET: "mock-production-sentinel" };
const res = () => ({ statusCode: 200, setHeader() {}, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; }, end() {} });
const request = { method: "POST", headers: { "content-type": "application/json" }, async *[Symbol.asyncIterator]() {
  yield Buffer.from(JSON.stringify({ type: "cpr", fields: { name: "synthetic", completionDate: "2026-10-01" },
    fileBase64: "iVBORw0KGgo=", fileName: "fixture.png", fileMimeType: "image/png" }));
} };
function rejects(action, code) {
  assert.throws(action, (error) => {
    assert.equal(error.code, code);
    assert.equal(error.status, 503);
    assert.doesNotMatch(error.message, /sentinel|google|QA_STAFF|folder|operating/);
    return true;
  });
}

test("QA GAS never falls back to production or uses a configured production alias", () => {
  rejects(() => gasResource("submission", { APP_ENV: "qa", GAS_URL: prod.GAS_URL }), "QA_GAS_REQUIRED");
  rejects(() => gasResource("submission", { ...qa, GAS_URL: qa.QA_SUBMISSION_GAS_URL }), "RESOURCE_ENV_MISMATCH");
  rejects(() => gasResource("submission", { ...prod, QA_SUBMISSION_GAS_URL: prod.GAS_URL }), "RESOURCE_ENV_MISMATCH");
  rejects(() => gasResource("portal", { APP_ENV: "qa", QA_SUBMISSION_GAS_URL: qa.QA_SUBMISSION_GAS_URL }), "QA_GAS_REQUIRED");
});
test("valid dedicated QA and existing production GAS including legacy production alias are allowed", () => {
  assert.equal(gasResource("submission", qa), qa.QA_SUBMISSION_GAS_URL);
  assert.equal(gasResource("portal", qa), qa.QA_PORTAL_GAS_URL);
  assert.equal(gasResource("studentCare", qa), qa.QA_STUDENT_CARE_GAS_URL);
  assert.equal(gasResource("submission", prod), prod.GAS_URL);
  assert.equal(gasResource("portal", { VERCEL_ENV: "production", VITE_GAS_BASE_URL: prod.GAS_URL }), prod.GAS_URL);
});
test("unknown, preview-only and contradictory platform environments fail closed", () => {
  for (const context of [{}, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }, { APP_ENV: "qa", VERCEL_ENV: "production" }]) {
    rejects(() => gasResource("submission", context), "ENVIRONMENT_UNRESOLVED");
    rejects(() => sheetResource("staff", context), "ENVIRONMENT_UNRESOLVED");
    rejects(() => driveFolderResource("cpr", context), "ENVIRONMENT_UNRESOLVED");
  }
  assert.equal(resourceEnvironment({ ...qa, VERCEL_GIT_COMMIT_REF: "feature/test" }), "qa");
});
test("QA folders are mandatory and cannot be known production or opposite-environment resources", () => {
  for (const type of ["cpr", "tb", "student_tb_reply"]) rejects(() => driveFolderResource(type, { APP_ENV: "qa" }), "QA_DRIVE_REQUIRED");
  for (const folder of PRODUCTION_DRIVE_FOLDERS) rejects(() => driveFolderResource("cpr", { ...qa, QA_CPR_DRIVE_FOLDER_ID: folder }), "RESOURCE_ENV_MISMATCH");
  rejects(() => driveFolderResource("cpr", { ...qa, CPR_DRIVE_FOLDER_ID: qa.QA_CPR_DRIVE_FOLDER_ID }), "RESOURCE_ENV_MISMATCH");
  rejects(() => driveFolderResource("cpr", { ...prod, QA_CPR_DRIVE_FOLDER_ID: PRODUCTION_DRIVE_FOLDERS[0] }), "RESOURCE_ENV_MISMATCH");
  assert.equal(driveFolderResource("cpr", qa), qa.QA_CPR_DRIVE_FOLDER_ID);
  assert.equal(driveFolderResource("cpr", prod), "");
});
test("missing QA Sheet and silent canonical source are rejected", () => {
  rejects(() => sheetResource("staff", { APP_ENV: "qa", STAFF_ROSTER_SOURCE_SPREADSHEET_ID: "legacy" }), "QA_SHEET_REQUIRED");
  rejects(() => sheetResource("research", { APP_ENV: "qa" }), "QA_SHEET_REQUIRED");
  rejects(() => assertSheetResource(PRODUCTION_SHEETS.staff, qa), "RESOURCE_ENV_MISMATCH");
  rejects(() => sheetResource("staff", { ...prod, QA_STAFF_ROSTER_SOURCE_SPREADSHEET_ID: PRODUCTION_SHEETS.staff }), "RESOURCE_ENV_MISMATCH");
  assert.equal(sheetResource("staff", qa), qa.QA_STAFF_ROSTER_SOURCE_SPREADSHEET_ID);
  assert.equal(sheetResource("staff", prod), PRODUCTION_SHEETS.staff);
});
test("explicitly approved shared Sheet is read-only even when configured as selected source", () => {
  const context = { ...qa, QA_STAFF_ROSTER_SOURCE_SPREADSHEET_ID: PRODUCTION_SHEETS.staff, QA_SHARED_READONLY_SHEET_IDS: PRODUCTION_SHEETS.staff };
  assert.equal(sheetResource("staff", context), PRODUCTION_SHEETS.staff);
  assert.equal(sheetResource("staff", { ...context, APP_ENV: "production" }), PRODUCTION_SHEETS.staff, "explicit QA read-only sharing must not disable the production source");
  assert.deepEqual(assertSheetResource(PRODUCTION_SHEETS.staff, context), { policy: "sharedReadOnly" });
  rejects(() => sheetResource("staff", context, "write"), "SHARED_RESOURCE_READ_ONLY");
});
test("local uses only explicit local resources, never production/QA fallback", () => {
  const context = { APP_ENV: "local", LOCAL_SUBMISSION_GAS_URL: url("local-fixture"), LOCAL_STAFF_ROSTER_SOURCE_SPREADSHEET_ID: "local-sheet",
    LOCAL_CPR_DRIVE_FOLDER_ID: "local-folder", LOCAL_SUBMISSION_PROXY_SECRET: "mock-local-sentinel" };
  assert.equal(gasResource("submission", context), context.LOCAL_SUBMISSION_GAS_URL);
  assert.equal(sheetResource("staff", context), "local-sheet");
  assert.equal(driveFolderResource("cpr", context), "local-folder");
  assert.equal(resourceSecret("submission", context), context.LOCAL_SUBMISSION_PROXY_SECRET);
  rejects(() => gasResource("submission", { APP_ENV: "local", ...qa, APP_ENV: "local" }), "RESOURCE_MISSING");
});
test("secret sources and Drive OAuth binding names are selected by environment without value comparison", () => {
  assert.equal(resourceSecret("submission", { ...prod, ...qa, APP_ENV: "production" }), prod.SUBMISSION_PROXY_SECRET);
  assert.equal(resourceSecret("submission", { ...prod, ...qa, VERCEL_ENV: "preview" }), qa.QA_SUBMISSION_PROXY_SECRET);
  rejects(() => resourceSecret("submission", { APP_ENV: "qa", SUBMISSION_PROXY_SECRET: "mock" }), "QA_RESOURCE_MISSING");
  assert.equal(trainingDriveConfig(qa).refreshToken, qa.QA_TRAINING_DRIVE_OAUTH_REFRESH_TOKEN);
  rejects(() => trainingDriveConfig({ APP_ENV: "qa", TRAINING_DRIVE_OAUTH_REFRESH_TOKEN: "mock" }), "QA_DRIVE_REQUIRED");
});
test("submission preflight blocks missing or wrong QA resources before auth, storage or GAS", async () => {
  for (const [context, code] of [[{}, "ENVIRONMENT_UNRESOLVED"], [{ APP_ENV: "qa" }, "QA_GAS_REQUIRED"],
    [{ ...qa, QA_CPR_DRIVE_FOLDER_ID: "" }, "QA_DRIVE_REQUIRED"],
    [{ ...qa, GAS_URL: qa.QA_SUBMISSION_GAS_URL }, "RESOURCE_ENV_MISMATCH"],
    [{ ...qa, QA_SUBMISSION_PROXY_SECRET: "" }, "QA_RESOURCE_MISSING"]]) {
    let calls = 0; const result = res(); const forbidden = async () => { calls++; throw new Error("unexpected I/O"); };
    await submit(request, result, { context, verifyStaff: forbidden, postScript: forbidden, loadSubmissionConfig: forbidden });
    assert.equal(result.statusCode, 503); assert.equal(result.body.code, code); assert.equal(calls, 0);
    assert.doesNotMatch(JSON.stringify(result.body), /sentinel|google|folder|dedicated/);
  }
});
test("portal and student-care missing GAS fail before Firebase, authorization or upstream requests", async () => {
  let calls = 0;
  const p = res(); await portal({ method: "GET", query: { scope: "fallback", type: "unhandled" } }, p, { context: { APP_ENV: "qa" } });
  assert.equal(p.statusCode, 503); assert.equal(p.body.code, "QA_GAS_REQUIRED");
  const h = res(); await healthRoom({ method: "GET", query: {}, headers: {} }, h, { context: { APP_ENV: "qa" }, verifyAccess: async () => { calls++; } });
  assert.equal(h.statusCode, 503); assert.equal(h.body.code, "QA_GAS_REQUIRED"); assert.equal(calls, 0);
});
test("low-level Sheet and OAuth initialization block before real SDK/credential access", async () => {
  const prior = process.env.APP_ENV; process.env.APP_ENV = "unknown";
  try {
    await assert.rejects(readGoogleSheetValues({ spreadsheetId: "anything", range: "A1" }), { code: "ENVIRONMENT_UNRESOLVED" });
    rejects(() => new GoogleDriveOAuthSignatureStorage().requester(), "ENVIRONMENT_UNRESOLVED");
  } finally { if (prior === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = prior; }
});
test("production-only browser tool links are unavailable to QA, local and unknown", () => {
  for (const environment of ["qa", "local", "unknown"]) assert.equal(productionOnlyExternalLink(url("tool"), { environment }), undefined);
  assert.equal(productionOnlyExternalLink(url("tool"), { environment: "production" }), url("tool"));
});

test("staff-directory source preflight rejects a missing QA Sheet before the admin SDK", async () => {
  const { staffDirectoryHandler } = await import("../../api/firebase/staff-directory.js");
  const result = res();
  await staffDirectoryHandler({ method: "GET", headers: { authorization: "Bearer mock-never-verify" }, query: { resource: "health-mandatory-training-sync" } },
    result, { context: { APP_ENV: "qa" } });
  assert.equal(result.statusCode, 503); assert.equal(result.body.code, "QA_SHEET_REQUIRED");
});

test("real training resource preflight rejects missing QA OAuth and QR bindings before auth", async () => {
  const { createTrainingPhase2Handler } = await import("./trainingCenterPhase2Api.js");
  const keys = ["APP_ENV", "VERCEL_ENV", "QA_STAFF_ROSTER_SOURCE_SPREADSHEET_ID", "QA_TRAINING_QR_SECRET",
    "QA_TRAINING_DRIVE_OAUTH_CLIENT_ID", "QA_TRAINING_DRIVE_OAUTH_CLIENT_SECRET", "QA_TRAINING_DRIVE_OAUTH_REFRESH_TOKEN"];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    process.env.APP_ENV = "qa";
    process.env.QA_STAFF_ROSTER_SOURCE_SPREADSHEET_ID = "QA_STAFF_FIXTURE";
    let calls = 0;
    const handler = createTrainingPhase2Handler({ auth: () => { calls++; throw new Error("must not initialize SDK"); } });
    for (const [resource, code] of [["training-signature-storage-bootstrap", "QA_DRIVE_REQUIRED"], ["training-qr", "QA_RESOURCE_MISSING"]]) {
      const result = res();
      await handler({ method: "POST", query: { resource }, headers: {} }, result);
      assert.equal(result.statusCode, 503); assert.equal(result.body.code, code);
    }
    assert.equal(calls, 0);
  } finally {
    for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
  }
});
