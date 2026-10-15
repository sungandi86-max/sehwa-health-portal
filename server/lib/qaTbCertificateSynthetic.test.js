import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import submitHandler from "../../api/submit.js";
import { handleQaTbCertificateLogin } from "../../api/firebase/staff-directory.js";
import { verifyCurrentStaffSubmissionIdentity } from "./tbSubmissionGuard.js";
import { isQaTbCertificateAssignment, QA_TB_CERTIFICATE_ROLE,
  QA_TB_CERTIFICATE_EMAIL, QA_TB_CERTIFICATE_STAFF_ID, QA_TB_CERTIFICATE_UID } from "./qaTbCertificateSynthetic.js";

const qa = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" };
const production = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" };
const assignment = { uid: QA_TB_CERTIFICATE_UID, staffId: QA_TB_CERTIFICATE_STAFF_ID, active: false,
  qaOnly: true, environment: "qa", roles: [QA_TB_CERTIFICATE_ROLE], schoolYear: 2026, semester: 2,
  qaExpiresAt: "2099-01-01T00:00:00.000Z" };
const response = () => ({ statusCode: 200, headers: {}, setHeader() {}, status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }, end() { return this; } });
const request = (payload) => ({ method: "POST", headers: { "content-type": "application/json", authorization: "Bearer qa" },
  async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(payload)); } });
const database = () => ({ collection(name) { assert.equal(name, "user_assignments_qa"); return {
  doc() { return { get: async () => ({ exists: true, data: () => assignment }) }; },
}; } });

test("TB certificate synthetic identity is QA-only and workflow-specific", async () => {
  assert.equal(isQaTbCertificateAssignment(QA_TB_CERTIFICATE_UID, assignment, qa), true);
  assert.equal(isQaTbCertificateAssignment(QA_TB_CERTIFICATE_UID, assignment, production), false);
  const options = { allowQaTbCertificateSynthetic: true, context: qa,
    auth: () => ({ verifyIdToken: async () => ({ uid: QA_TB_CERTIFICATE_UID }) }), database };
  const accepted = await verifyCurrentStaffSubmissionIdentity({ headers: { authorization: "Bearer token" } }, options);
  assert.equal(accepted.qaTbCertificateSynthetic, true);
  assert.equal(accepted.staffId, QA_TB_CERTIFICATE_STAFF_ID);
  assert.equal((await verifyCurrentStaffSubmissionIdentity({ headers: { authorization: "Bearer token" } },
    { ...options, allowQaTbCertificateSynthetic: false })).status, 403);
  assert.equal((await verifyCurrentStaffSubmissionIdentity({ headers: { authorization: "Bearer token" } },
    { ...options, context: production })).status, 403);
});

test("QA TB certificate submit writes QA audit and QA status without Sheet append", async () => {
  let forwarded; let auditInput; let statusCollection;
  const res = response();
  const payload = { type: "tb", fields: { name: "spoof", dept: "spoof", staffType: "교직원",
    checkupDate: "2026-10-12", docType: "QA fixture" }, fileName: "qa-tb.pdf",
    fileMimeType: "application/pdf", fileBase64: "JVBERi0=" };
  await submitHandler(request(payload), res, {
    destinationUrl: "https://script.google.com/macros/s/qa-endpoint/exec", proxySecret: "x".repeat(48),
    environment: () => "qa", qaTbCertificateFolderId: "qa-tb-folder-id",
    verifyTb: async () => ({ ok: true, staffId: QA_TB_CERTIFICATE_STAFF_ID, roles: [QA_TB_CERTIFICATE_ROLE],
      qaTbCertificateSynthetic: true, identity: { name: "[QA-TB-CERT-TEST]", department: "QA 전용" }, db: {} }),
    postScript: async (_url, init) => { forwarded = JSON.parse(JSON.parse(init.body).payloadJson);
      return { text: async () => JSON.stringify({ status: "success", fileId: "qa-tb-file-id" }) }; },
    tbCertificateStore: { createRequest: async (input) => { auditInput = input; } },
    saveTbStatus: async ({ collectionName }) => { statusCollection = collectionName; },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(forwarded.recordMode, "firestore");
  assert.equal(forwarded.runtimeEnvironment, "qa");
  assert.equal(forwarded.qaEvidenceFolderId, "qa-tb-folder-id");
  assert.equal(forwarded.fields.name, "[QA-TB-CERT-TEST]");
  assert.equal(auditInput.evidenceFile.fileId, "qa-tb-file-id");
  assert.equal(statusCollection, "staff_submission_status_qa");
});

test("Production TB certificate submit stores Drive evidence in the Production ledger without Sheet fallback", async () => {
  let forwarded; let auditInput; let mirrorRecord; let statusCollection = "default";
  const res = response();
  const payload = { type: "tb", fields: { name: "canonical", dept: "보건실", staffType: "교직원",
    checkupDate: "2026-10-12", docType: "확인증" }, fileName: "tb.pdf",
    fileMimeType: "application/pdf", fileBase64: "JVBERi0=" };
  await submitHandler(request(payload), res, {
    destinationUrl: "https://script.google.com/macros/s/production-endpoint/exec", proxySecret: "x".repeat(48),
    environment: () => "production",
    verifyTb: async () => ({ ok: true, staffId: "T054", roles: ["staff"], db: {} }),
    readDirectory: async () => ({ directory: [{ staffId: "T054", name: "canonical", position: "교직원", employmentStatus: "재직" }] }),
    saveProxyRecord: async (_db, record) => { mirrorRecord = record; },
    postScript: async (_url, init) => { forwarded = JSON.parse(JSON.parse(init.body).payloadJson);
      return { text: async () => JSON.stringify({ status: "success", fileId: "production-tb-file-id" }) }; },
    tbCertificateStore: { createRequest: async (input) => { auditInput = input; return { ...input, environment: "production",
      subjectStaffId: input.staffId, evidenceFiles: [{ fileId: input.evidenceFile.fileId, fileName: input.evidenceFile.fileName,
        mimeType: input.evidenceFile.mimeType }] }; } },
    recordTbReceipt: async () => {},
    saveTbStatus: async ({ collectionName }) => { statusCollection = collectionName; },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(forwarded.recordMode, "firestore");
  assert.equal(forwarded.runtimeEnvironment, "production");
  assert.equal(forwarded.qaEvidenceFolderId, "");
  assert.equal(auditInput.staffId, "T054");
  assert.equal(auditInput.evidenceFile.fileId, "production-tb-file-id");
  assert.equal(mirrorRecord.staffId, "T054");
  assert.equal(mirrorRecord.submissionMode, "self");
  assert.equal(mirrorRecord.submissionId, res.body.submissionId);
  assert.equal(statusCollection, "default");
  assert.equal(res.body.status, "success");
  assert.equal(res.body.success, true);
  assert.equal(res.body.staffId, "T054");
  assert.match(res.body.submissionId, /^tb-[a-f0-9]{32}$/);
});

test("Apps Script routes QA TB audit to the QA secret and suppresses Sheet append", () => {
  const source = fs.readFileSync(new URL("../../apps-script/Code.gs", import.meta.url), "utf8");
  assert.match(source, /payload\.type === "cpr" \|\| payload\.type === "tb"/);
  assert.match(source, /const sheet = firestoreAudit \? null/);
  assert.match(source, /if \(!prepared\.firestoreAudit\)/);
});

test("TB certificate synthetic login is admin-gated and unavailable in Production", async () => {
  let authWrites = 0;
  const auth = { getUser: async () => ({ email: QA_TB_CERTIFICATE_EMAIL, disabled: false }),
    createCustomToken: async (uid) => { authWrites += 1; assert.equal(uid, QA_TB_CERTIFICATE_UID); return "qa-token"; } };
  const denied = response();
  await handleQaTbCertificateLogin({ method: "POST" }, denied,
    { context: production, verifyAdmin: async () => { throw new Error("must not run"); }, getAuth: () => auth });
  assert.equal(denied.statusCode, 403);
  assert.equal(authWrites, 0);
  const accepted = response();
  await handleQaTbCertificateLogin({ method: "POST" }, accepted, {
    context: qa, verifyAdmin: async () => ({ ok: true, db: database() }), getAuth: () => auth,
  });
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body.customToken, "qa-token");
  assert.equal(authWrites, 1);
});
