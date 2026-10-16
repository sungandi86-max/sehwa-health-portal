import assert from "node:assert/strict";
import test from "node:test";
import rawSubmitHandler from "../../api/submit.js";
import { submissionResourceContext } from "../../tests/fixtures/submissionResourceContext.js";

import { handleQaCprLogin } from "../../api/firebase/staff-directory.js";
import { verifyCurrentStaffSubmissionIdentity } from "./tbSubmissionGuard.js";
import { isQaCprAssignment, QA_CPR_EMAIL, QA_CPR_ROLE, QA_CPR_STAFF_ID, QA_CPR_UID } from "./qaCprSynthetic.js";
import fs from "node:fs";

const qa = { APP_ENV: "qa", QA_FIREBASE_PROJECT_ID: "isolated-health-qa", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" };
const production = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" };
const assignment = { uid: QA_CPR_UID, staffId: QA_CPR_STAFF_ID, active: false, qaOnly: true,
  environment: "qa", roles: [QA_CPR_ROLE], schoolYear: 2026, semester: 2,
  qaExpiresAt: "2099-01-01T00:00:00.000Z" };

function response() {
  return { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; },
    end() { return this; } };
}

function request(payload) {
  return { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer qa-cpr" },
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(payload)); } };
}

function database(data = assignment) {
  return { app: { options: { projectId: "isolated-health-qa" } }, collection(name) { assert.equal(name, "user_assignments_qa"); return {
    doc() { return { get: async () => ({ exists: true, data: () => data }) }; },
  }; } };
}

test("CPR synthetic identity is accepted only by fixed QA CPR flow", async () => {
  assert.equal(isQaCprAssignment(QA_CPR_UID, assignment, qa), true);
  assert.equal(isQaCprAssignment(QA_CPR_UID, assignment, production), false);
  const options = { allowQaCprSynthetic: true, context: qa,
    auth: () => ({ verifyIdToken: async () => ({ uid: QA_CPR_UID }) }), database: () => database() };
  const accepted = await verifyCurrentStaffSubmissionIdentity({ headers: { authorization: "Bearer token" } }, options);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.qaCprSynthetic, true);
  assert.equal(accepted.staffId, QA_CPR_STAFF_ID);
  assert.deepEqual(accepted.roles, [QA_CPR_ROLE]);
  assert.equal((await verifyCurrentStaffSubmissionIdentity({ headers: { authorization: "Bearer token" } },
    { ...options, allowQaCprSynthetic: false })).status, 403);
  assert.equal((await verifyCurrentStaffSubmissionIdentity({ headers: { authorization: "Bearer token" } },
    { ...options, context: production })).status, 403);
});

test("QA CPR submit uses signed QA folder contract and QA-only status collection", async () => {
  let forwarded;
  let statusCollection;
  const result = response();
  const payload = { type: "cpr", fields: { name: "spoof", dept: "spoof", staffType: "교직원",
    completionDate: "2026-10-12", institution: "QA fixture" }, fileName: "qa-cpr.png",
    fileMimeType: "image/png", fileBase64: "iVBORw0KGgo=" };
  await submitHandler(request(payload), result, {
    destinationUrl: "https://script.google.com/macros/s/qa-endpoint/exec", proxySecret: "x".repeat(48),
    environment: () => "qa", qaCprFolderId: "qa-folder-id",
    verifyStaff: async () => ({ ok: true, staffId: QA_CPR_STAFF_ID, roles: [QA_CPR_ROLE],
      qaCprSynthetic: true, identity: { name: "[QA-CPR-TEST]", department: "QA 전용" }, db: {} }),
    postScript: async (_url, init) => { forwarded = JSON.parse(JSON.parse(init.body).payloadJson);
      return { text: async () => JSON.stringify({ status: "success", fileId: "qa-file-id" }) }; },
    cprCertificateStore: { environment: "qa", createRequest: async () => ({}) },
    saveCprStatus: async ({ collectionName }) => { statusCollection = collectionName; },
  });
  assert.equal(result.statusCode, 200);
  assert.equal(forwarded.recordMode, "firestore");
  assert.equal(forwarded.runtimeEnvironment, "qa");
  assert.equal(forwarded.qaEvidenceFolderId, "qa-folder-id");
  assert.equal(forwarded.fields.name, "[QA-CPR-TEST]");
  assert.equal(statusCollection, "staff_submission_status_qa");
});

test("CPR synthetic login is admin-gated and unavailable in Production", async () => {
  let authWrites = 0;
  const auth = { getUser: async () => ({ email: QA_CPR_EMAIL, disabled: false }),
    createCustomToken: async (uid) => { authWrites += 1; assert.equal(uid, QA_CPR_UID); return "qa-cpr-token"; } };
  const denied = response();
  await handleQaCprLogin({ method: "POST" }, denied,
    { context: production, verifyAdmin: async () => { throw new Error("must not run"); }, getAuth: () => auth });
  assert.equal(denied.statusCode, 403);
  assert.equal(authWrites, 0);
  const accepted = response();
  await handleQaCprLogin({ method: "POST" }, accepted, {
    context: qa, verifyAdmin: async () => ({ ok: true, db: database() }), getAuth: () => auth,
  });
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body.customToken, "qa-cpr-token");
  assert.equal(authWrites, 1);
});

test("CPR synthetic switch is visible only behind the fixed QA query gate", () => {
  const source = fs.readFileSync(new URL("../../src/components/SubmitModal.jsx", import.meta.url), "utf8");
  assert.match(source, /window\.location\.hostname === QA_INBODY_HOST/);
  assert.match(source, /get\("qa-cpr-test"\) === "1"/);
  assert.match(source, /resource=qa-cpr-login/);
  assert.match(source, /auth\.currentUser\?\.uid !== QA_CPR_UID/);
});

test("Apps Script isolates the QA CPR proxy secret from Production submissions", () => {
  const source = fs.readFileSync(new URL("../../apps-script/Code.gs", import.meta.url), "utf8");
  assert.match(source, /qaAuditRequest \? "QA_SUBMISSION_PROXY_SECRET" : "SUBMISSION_PROXY_SECRET"/);
});

function submitHandler(req, res, options = {}) {
  const environment = options.environment ? options.environment() : (process.env.APP_ENV || "production");
  const context = options.context || submissionResourceContext(environment, options);
  return rawSubmitHandler(req, res, { ...options, context });
}
