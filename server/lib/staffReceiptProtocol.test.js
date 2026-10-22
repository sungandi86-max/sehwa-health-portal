import test from "node:test";
import assert from "node:assert/strict";
import handler from "../../api/submit.js";
import { staffReceiptIdentity } from "./staffReceiptProtocol.js";
import { staffReceiptDb } from "../../tests/fixtures/staffReceiptDb.js";
const secret = "fixture-only-submission-secret-32bytes-minimum";
const context = { APP_ENV: "qa", QA_FIREBASE_PROJECT_ID: "isolated-health-qa", QA_SUBMISSION_GAS_URL: "https://script.google.com/macros/s/fixture/exec",
  QA_SUBMISSION_PROXY_SECRET: secret, QA_CPR_DRIVE_FOLDER_ID: "fixture-qa-cpr-folder", QA_TB_CERTIFICATE_DRIVE_FOLDER_ID: "fixture-qa-tb-folder" };
const input = { type: "cpr", requestId: "fixture-intent-001", fields: { name: "synthetic", completionDate: "2026-10-01", institution: "fixture" },
  fileName: "fixture.pdf", fileMimeType: "application/pdf", fileBase64: Buffer.from("%PDF-fixture").toString("base64") };
const canonical = { staffId: "S-A", roles: ["staff"], submitter: { uid: "staff-a", email: "staff-a@example.invalid", displayName: "synthetic" } };
const idFor = (payload = input, env = "qa", actor = canonical) => staffReceiptIdentity({ payload, staffId: actor.staffId, actorUid: actor.submitter.uid, environment: env });
function fixture() {
  const db = staffReceiptDb(); let uploads = 0, gate;
  const opts = { context, verifyStaff: async () => ({ ok: true, ...canonical, db }), verifyTb: async () => ({ ok: true, ...canonical, db }),
    postScript: async () => { uploads++; if (gate) await gate; return { text: async () => JSON.stringify({ success: true, fileId: "mock-drive-file" }) }; } };
  async function request(payload = input, overrides = {}) {
    const req = { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer mock" },
      async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(payload)); } };
    const res = { code: 0, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() {} };
    await handler(req, res, { ...opts, ...overrides }); return res;
  }
  return { db, request, opts, uploads: () => uploads, setGate(value) { gate = value; } };
}
test("stable IDs bind canonical subject, type, year, content and actual intent rather than file name", () => {
  assert.deepEqual(idFor(), idFor({ ...input, fileName: "renamed.pdf" }));
  for (const patch of [{ requestId: "different-intent" }, { fileBase64: Buffer.from("%PDF-other").toString("base64") },
    { fields: { ...input.fields, completionDate: "2026-10-02" } }]) assert.notEqual(idFor().submissionId, idFor({ ...input, ...patch }).submissionId);
  assert.notEqual(idFor().submissionId, idFor(input, "production").submissionId);
  assert.notEqual(idFor().submissionId, idFor(input, "qa", { ...canonical, staffId: "S-B" }).submissionId);
  assert.throws(() => idFor({ ...input, staffId: "S-B" }), /제출/);
});
test("actual API stores original and QA status server-side; retry and response loss create/upload nothing twice", async () => {
  const f = fixture(), first = await f.request();
  assert.equal(first.code, 200); assert.equal(first.body.receiptSaved, true); assert.equal(first.body.statusSynced, true);
  assert.ok(f.db.records.has(`staff_submissions/${first.body.submissionId}`));
  assert.equal(f.db.records.get("staff_submission_status_qa/S-A_cpr-training-2026").status, "pending");
  const before = f.db.calls.filter(([op]) => ["create", "update", "set"].includes(op)).length;
  const retry = await f.request();
  assert.equal(retry.body.submissionId, first.body.submissionId); assert.equal(retry.body.duplicate, true);
  assert.equal(f.uploads(), 1);
  assert.equal(f.db.calls.filter(([op]) => ["create", "update", "set"].includes(op)).length, before);
});
test("concurrent duplicate requests reserve a single upload", async () => {
  const f = fixture(); let release;
  const gate = new Promise((done) => { release = done; }); f.setGate(gate);
  const first = f.request();
  while (f.uploads() === 0) await new Promise((done) => setImmediate(done));
  const second = await f.request(); assert.equal(second.code, 409); assert.equal(f.uploads(), 1);
  release(); assert.equal((await first).body.receiptSaved, true);
  assert.equal((await f.request()).body.receiptSaved, true); assert.equal(f.uploads(), 1);
});
test("uploaded file survives failed audit create and is reused on retry", async () => {
  const f = fixture(), id = idFor().submissionId;
  f.db.failures.set(`create:cpr_certificate_submissions_qa/${id}`, 1);
  const first = await f.request(); assert.equal(first.code, 503); assert.equal(first.body.receiptSaved, false);
  assert.equal(first.body.code, "RECEIPT_SAVE_PENDING");
  const second = await f.request(); assert.equal(second.body.receiptSaved, true); assert.equal(f.uploads(), 1);
});
test("signed scoped recovery resumes after uploaded-file checkpoint failure, without another upload", async () => {
  const f = fixture(), id = idFor().submissionId;
  // Fail the durable file checkpoint after a confirmed upload.
  const originalPost = f.opts.postScript;
  f.opts.postScript = async (...args) => { const result = await originalPost(...args); f.db.failures.set(`update:staff_submission_receipts_qa/${id}`, 1); return result; };
  const first = await f.request(); assert.equal(first.body.code, "UPLOAD_CHECKPOINT_PENDING"); assert.ok(first.body.recoveryToken);
  const forged = await f.request({ ...input, recoveryToken: first.body.recoveryToken + "bad" }); assert.equal(forged.code, 403);
  const second = await f.request({ ...input, recoveryToken: first.body.recoveryToken }); assert.equal(second.body.receiptSaved, true); assert.equal(f.uploads(), 1);
});
test("original success and status failure return accepted/pending, then sync once without replacing original", async () => {
  const f = fixture(), id = idFor().submissionId;
  f.db.failures.set("set:staff_submission_status_qa/S-A_cpr-training-2026", 1);
  const first = await f.request(); assert.equal(first.code, 200); assert.equal(first.body.receiptSaved, true); assert.equal(first.body.syncPending, true);
  const original = f.db.records.get(`staff_submissions/${id}`);
  const second = await f.request(); assert.equal(second.body.statusSynced, true); assert.deepEqual(f.db.records.get(`staff_submissions/${id}`), original); assert.equal(f.uploads(), 1);
});
for (const state of ["completed", "rejected", "invalidated", "reviewing"]) test(`stale retries preserve administrator ${state}`, async () => {
  const f = fixture(), id = idFor().submissionId;
  f.db.failures.set("set:staff_submission_status_qa/S-A_cpr-training-2026", 1);
  await f.request();
  const original = f.db.records.get(`staff_submissions/${id}`); f.db.records.set(`staff_submissions/${id}`, { ...original, status: state });
  const current = { status: state, sourceType: "portal_certificate_review", training: { evidenceStatus: state } };
  f.db.records.set("staff_submission_status_qa/S-A_cpr-training-2026", current);
  const retry = await f.request(); assert.equal(retry.body.receiptState, state); assert.deepEqual(f.db.records.get("staff_submission_status_qa/S-A_cpr-training-2026"), current); assert.equal(f.uploads(), 1);
});
test("unknown upload outcome is never retried as another GAS upload", async () => {
  const f = fixture(); let calls = 0;
  const options = { postScript: async () => { calls++; throw new Error("response lost after upload"); } };
  assert.equal((await f.request(input, options)).body.code, "UPLOAD_OUTCOME_UNKNOWN");
  assert.equal((await f.request(input, options)).body.code, "UPLOAD_OUTCOME_UNKNOWN"); assert.equal(calls, 1);
});
test("QA DB mismatch, unknown environment and missing GAS are rejected before external upload", async () => {
  for (const variant of ["project", "unknown", "missing"]) {
    const f = fixture();
    if (variant === "project") f.db.app.options.projectId = "sehwa-health-portal-v2";
    const overrides = variant === "unknown" ? { context: { ...context, APP_ENV: "unknown" } }
      : variant === "missing" ? { context: { ...context, QA_SUBMISSION_GAS_URL: "" } } : {};
    assert.notEqual((await f.request(input, overrides)).code, 200); assert.equal(f.uploads(), 0);
  }
});
test("independent intents create independent originals", async () => {
  const f = fixture(), first = await f.request(), second = await f.request({ ...input, requestId: "another-real-intent" });
  assert.notEqual(first.body.submissionId, second.body.submissionId); assert.equal(f.uploads(), 2);
});
test("production TB reuses existing stable identity and receipt workflow; QA never writes production collections", async () => {
  const f = fixture(); f.db.app.options.projectId = "sehwa-health-portal-v2";
  const payload = { ...input, type: "tb", schoolYear: 2026, fields: { name: "synthetic", checkupDate: "2026-10-01", docType: "검진 확인서" } };
  const overrides = { context: { APP_ENV: "production", GAS_URL: "https://script.google.com/macros/s/fixture/exec", SUBMISSION_PROXY_SECRET: secret },
    readDirectory: async () => ({ directory: [{ staffId: "S-A", name: "synthetic", position: "교사" }] }) };
  const first = await f.request(payload, overrides); assert.equal(first.body.receiptSaved, true); assert.equal(first.body.statusSynced, true);
  const second = await f.request(payload, overrides); assert.equal(second.body.submissionId, first.body.submissionId); assert.equal(f.uploads(), 1);
  assert.ok([...f.db.records.keys()].every((key) => !key.includes("_qa")));
});

test("audit original success with canonical projection failure is accepted/pending and repaired without upload", async () => {
  const f = fixture(), id = idFor().submissionId;
  f.db.failures.set(`create:staff_submissions/${id}`, 1);
  const first = await f.request(); assert.equal(first.body.receiptSaved, true); assert.equal(first.body.syncPending, true);
  assert.ok(f.db.records.has(`cpr_certificate_submissions_qa/${id}`)); assert.equal(f.db.records.has(`staff_submissions/${id}`), false);
  const second = await f.request(); assert.equal(second.body.statusSynced, true); assert.equal(f.uploads(), 1);
});
test("lost audit create acknowledgement is reconciled by reading the stable receipt", async () => {
  const f = fixture(); const original = f.db.collection;
  f.db.collection = (name) => {
    const collection = original(name);
    if (name !== "cpr_certificate_submissions_qa") return collection;
    return { doc: (id) => { const ref = collection.doc(id); return { ...ref, create: async (value) => { await ref.create(value); throw new Error("ack lost"); } }; } };
  };
  const response = await f.request(); assert.equal(response.body.receiptSaved, true); assert.equal(response.body.statusSynced, true); assert.equal(f.uploads(), 1);
});
test("older retry cannot overwrite a newer pending submission's status", async () => {
  const f = fixture(), older = new Date("2026-10-01T00:00:00Z"), newer = new Date("2026-10-02T00:00:00Z");
  f.db.failures.set("set:staff_submission_status_qa/S-A_cpr-training-2026", 1);
  await f.request(input, { now: older });
  const next = await f.request({ ...input, requestId: "newer-real-intent" }, { now: newer });
  const current = f.db.records.get("staff_submission_status_qa/S-A_cpr-training-2026");
  assert.equal(current.latestSubmissionId, next.body.submissionId);
  await f.request(input, { now: new Date("2026-10-03T00:00:00Z") });
  assert.deepEqual(f.db.records.get("staff_submission_status_qa/S-A_cpr-training-2026"), current);
});
test("production TB confirmed and invalidated audits remain unchanged on retry", async () => {
  for (const reviewState of ["confirmed", "invalid"]) {
    const f = fixture(); f.db.app.options.projectId = "sehwa-health-portal-v2";
    const payload = { ...input, type: "tb", schoolYear: 2026, fields: { name: "synthetic", checkupDate: "2026-10-01", docType: "검진 확인서" } };
    const options = { context: { APP_ENV: "production", GAS_URL: "https://script.google.com/macros/s/fixture/exec", SUBMISSION_PROXY_SECRET: secret },
      readDirectory: async () => ({ directory: [{ staffId: "S-A", name: "synthetic", position: "교사" }] }) };
    const initial = await f.request(payload, options), path = `tb_certificate_submissions_production/${initial.body.submissionId}`;
    const audit = { ...f.db.records.get(path), reviewState, status: reviewState === "confirmed" ? "completed" : "invalid" };
    f.db.records.set(path, audit);
    const currentStatus = { status: "completed", screening: { completed: true }, evidenceSubmissionId: audit.submissionId };
    f.db.records.set("staff_submission_status/S-A_tb-screening-2026", currentStatus);
    const retry = await f.request(payload, options);
    assert.equal(retry.body.receiptSaved, true); assert.equal(retry.body.receiptState, reviewState === "confirmed" ? "completed" : "invalidated"); assert.deepEqual(f.db.records.get(path), audit);
    assert.deepEqual(f.db.records.get("staff_submission_status/S-A_tb-screening-2026"), currentStatus); assert.equal(f.uploads(), 1);
  }
});

test("production proxy preserves authorized subject/actor separation and its retry ID", async () => {
  const f = fixture(); f.db.app.options.projectId = "sehwa-health-portal-v2";
  const payload = { ...input, type: "tb", action: "admin_proxy", subjectStaffId: "S-A", schoolYear: 2026,
    fields: { name: "ignored", checkupDate: "2026-10-01", docType: "확인서" } };
  const access = { ok: true, db: f.db, decodedToken: { uid: "admin-a", email: "admin@example.invalid" },
    assignment: { uid: "admin-a", schoolYear: 2026, semester: 2, active: true, staffId: "ADMIN", roles: ["admin"] } };
  const options = { context: { APP_ENV: "production", GAS_URL: "https://script.google.com/macros/s/fixture/exec", SUBMISSION_PROXY_SECRET: secret },
    verifyAdmin: async () => access, findProxyRecords: async () => [],
    readDirectory: async () => ({ directory: [{ staffId: "S-A", name: "synthetic", position: "교사" }] }) };
  const first = await f.request(payload, options); assert.equal(first.body.statusSynced, true);
  const original = f.db.records.get(`staff_submissions/${first.body.submissionId}`);
  assert.equal(original.staffId, "S-A"); assert.equal(original.submittedByStaffId, "ADMIN");
  const repeat = await f.request(payload, options); assert.equal(repeat.body.submissionId, first.body.submissionId); assert.equal(f.uploads(), 1);
  const denied = await f.request(payload, { ...options, verifyAdmin: async () => ({ ...access, assignment: { ...access.assignment, uid: "different" } }) });
  assert.equal(denied.code, 403); assert.equal(f.uploads(), 1);
});
test("weak binding and foreign canonical subject fail without any upload or journal write", async () => {
  for (const payload of [{ ...input, staffId: "S-B" }, input]) {
    const f = fixture(); const options = payload.staffId ? {} : { context: { ...context, QA_SUBMISSION_PROXY_SECRET: "short" } };
    const result = await f.request(payload, options); assert.notEqual(result.code, 200); assert.equal(f.uploads(), 0);
    assert.equal(f.db.records.size, 0);
  }
});

test("a known durable receipt remains accepted if a retry cannot read its audit", async () => {
  const f = fixture(), first = await f.request();
  f.db.failures.set(`get:cpr_certificate_submissions_qa/${first.body.submissionId}`, 1);
  const retry = await f.request(); assert.equal(retry.code, 200); assert.equal(retry.body.receiptSaved, true);
  assert.equal(retry.body.code, "RECEIPT_STATE_CHECK_PENDING"); assert.equal(f.uploads(), 1);
});

test("completed TB permits exact receipt retry but rejects a genuinely new submission before upload", async () => {
  const f = fixture(); f.db.app.options.projectId = "sehwa-health-portal-v2";
  const payload = { ...input, type: "tb", schoolYear: 2026, fields: { name: "synthetic", checkupDate: "2026-10-01", docType: "확인서" } };
  const options = { context: { APP_ENV: "production", GAS_URL: "https://script.google.com/macros/s/fixture/exec", SUBMISSION_PROXY_SECRET: secret },
    readDirectory: async () => ({ directory: [{ staffId: "S-A", name: "synthetic", position: "교사" }] }) };
  const first = await f.request(payload, options);
  const completedOptions = { ...options, verifyTb: async () => ({ ok: true, ...canonical, db: f.db, statusValue: "completed" }) };
  assert.equal((await f.request(payload, completedOptions)).body.submissionId, first.body.submissionId);
  const another = await f.request({ ...payload, fileBase64: Buffer.from("%PDF-changed").toString("base64") }, completedOptions);
  assert.equal(another.code, 409); assert.equal(f.uploads(), 1);
});

test("ID-only resume repairs partial status without file bytes and enforces receipt owner", async () => {
  const f = fixture();
  f.db.failures.set("set:staff_submission_status_qa/S-A_cpr-training-2026", 1);
  const first = await f.request();
  const resume = { type: "cpr", resumeReceiptId: first.body.submissionId };
  const spoof = await f.request(resume, { verifyStaff: async () => ({ ok: true, ...canonical, submitter: { ...canonical.submitter, uid: "another-user" }, db: f.db }) });
  assert.equal(spoof.code, 403);
  const second = await f.request(resume); assert.equal(second.body.statusSynced, true); assert.equal(f.uploads(), 1);
  const cached = await f.request(resume); assert.equal(cached.body.duplicate, true); assert.equal(f.uploads(), 1);
});
