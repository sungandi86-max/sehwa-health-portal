import test from "node:test";
import assert from "node:assert/strict";
import { recordQaTbReceipt, reviewQaTbEvidence, listQaTbWorkflowData } from "./tbScreeningWorkflowStore.js";
import { handleTbScreeningWorkflowRequest, verifyQaTbEvidenceFile } from "./tbScreeningWorkflowApi.js";
import { verifyQaTbScriptEvidence } from "./qaTbEvidenceMetadata.js";

const context = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" };
const receipt = { submissionId: "receipt-1", staffId: "staff-1", subjectStaffId: "staff-1", schoolYear: 2026,
  environment: "qa", type: "tb", fileId: "file-1", evidenceRoute: "individual", submittedAt: "2026-10-15", requestFingerprint: "hash" };
function fixture() {
  const records = new Map();
  const operations = [];
  let queue = Promise.resolve();
  let failCreate = false;
  const snapshot = (path) => ({ id: path.split("/").at(-1), exists: records.has(path), data: () => records.get(path) });
  function collection(path, filters = [], after = "", limit = 100) {
    return {
      doc(id) { return { path: `${path}/${id}`, id, get: async () => snapshot(`${path}/${id}`), collection: (name) => collection(`${path}/${id}/${name}`) }; },
      where: (field, op, value) => collection(path, [...filters, [field, value]], after, limit),
      orderBy: () => collection(path, filters, after, limit),
      startAfter: (id) => collection(path, filters, id, limit),
      limit: (count) => collection(path, filters, after, count),
      async get() {
        operations.push({ path, filters, limit });
        return { docs: [...records.keys()].filter((key) => key.startsWith(`${path}/`) && key.split("/").length === path.split("/").length + 1)
          .sort().map(snapshot).filter((doc) => doc.id > after && filters.every(([field, value]) => doc.data()[field] === value)).slice(0, limit) };
      },
    };
  }
  const db = { collection: (name) => { operations.push(name); return collection(name); }, runTransaction(callback) {
    const run = queue.then(async () => {
      const writes = [];
      const result = await callback({ get: async (ref) => snapshot(ref.path), set: (ref, value) => writes.push([ref.path, value]),
        create(ref, value) { if (failCreate) throw new Error("create denied"); assert.equal(records.has(ref.path), false); writes.push([ref.path, value]); } });
      writes.forEach(([path, value]) => records.set(path, value));
      return result;
    });
    queue = run.catch(() => {}); return run;
  } };
  const options = { context, verifyEvidenceFile: async () => true, now: () => "2026-10-15T00:00:00Z" };
  const review = (input = {}) => reviewQaTbEvidence(db, { action: "confirm", submissionId: receipt.submissionId, actor: "manager", schoolYear: 2026, expectedRevision: 0, ...input }, options);
  return { db, records, operations, options, review, fail: () => { failCreate = true; } };
}

test("receipt creates pending completion and retry creates one evidence", async () => {
  const f = fixture();
  await recordQaTbReceipt(f.db, receipt, { context });
  await recordQaTbReceipt(f.db, receipt, { context });
  assert.equal(f.records.size, 2);
  assert.equal(f.records.get("staff_submission_status_qa/staff-1_tb-screening-2026").screening.completed, false);
  assert.equal(f.records.get("staff_submissions_qa/receipt-1").reviewState, "pending");
});
test("approval records one immutable history and duplicate is idempotent", async () => {
  const f = fixture();
  await recordQaTbReceipt(f.db, receipt, { context });
  const results = await Promise.all([f.review(), f.review()]);
  assert.equal(results[0].status, "completed");
  assert.equal(results[1].revision, 1);
  assert.equal(f.records.size, 3);
  assert.equal(results[0].confirmedBy, "manager");
  assert.equal(results[0].evidenceSnapshot.fileId, "file-1");
});
test("later receipt and invalidation preserve approved completion and flag discrepancy", async () => {
  const f = fixture();
  await recordQaTbReceipt(f.db, receipt, { context });
  await f.review();
  await recordQaTbReceipt(f.db, { ...receipt, submissionId: "receipt-2" }, { context });
  const result = await f.review({ action: "invalidate", expectedRevision: 1 });
  assert.equal(result.status, "completed");
  assert.equal(result.screening.completed, true);
  assert.equal(result.discrepancy, true);
  assert.equal(result.confirmedBy, "manager");
});
test("year boundaries reject missing year and never inherit previous evidence", async () => {
  const f = fixture();
  await assert.rejects(recordQaTbReceipt(f.db, { ...receipt, schoolYear: undefined }, { context }), { status: 400 });
  await recordQaTbReceipt(f.db, receipt, { context });
  const result = await listQaTbWorkflowData(f.db, { schoolYear: 2027 }, { context });
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.statuses, []);
  assert.ok(f.operations.filter((item) => typeof item === "object").every((item) => item.filters[0][1] === 2027 && item.limit <= 100));
});
test("changed identity fingerprint and stale revision return conflict", async () => {
  const f = fixture();
  await recordQaTbReceipt(f.db, receipt, { context });
  await assert.rejects(recordQaTbReceipt(f.db, { ...receipt, requestFingerprint: "changed" }, { context }), { status: 409 });
  await assert.rejects(f.review({ expectedRevision: 1 }), { status: 409 });
});
test("approval denied on inaccessible file and invalid evidence", async () => {
  const f = fixture();
  await recordQaTbReceipt(f.db, receipt, { context });
  await assert.rejects(reviewQaTbEvidence(f.db, { action: "confirm", submissionId: "receipt-1", actor: "manager", schoolYear: 2026, expectedRevision: 0 }, { ...f.options, verifyEvidenceFile: async () => false }), { status: 503 });
  await f.review({ action: "invalidate" });
  await assert.rejects(f.review({ expectedRevision: 1 }), { status: 409 });
  assert.equal(f.records.get("staff_submission_status_qa/staff-1_tb-screening-2026").status, "pending");
});
test("history failure rolls back evidence and completion atomically", async () => {
  const f = fixture();
  await recordQaTbReceipt(f.db, receipt, { context });
  f.fail();
  await assert.rejects(f.review(), /create denied/);
  assert.equal(f.records.get("staff_submissions_qa/receipt-1").reviewState, "pending");
  assert.equal(f.records.get("staff_submission_status_qa/staff-1_tb-screening-2026").status, "pending");
});
test("bounded pagination exposes partial datasets and valid cursor", async () => {
  const f = fixture();
  await recordQaTbReceipt(f.db, receipt, { context });
  await recordQaTbReceipt(f.db, { ...receipt, submissionId: "receipt-2" }, { context });
  const first = await listQaTbWorkflowData(f.db, { schoolYear: 2026, limit: 1 }, { context });
  const second = await listQaTbWorkflowData(f.db, { schoolYear: 2026, limit: 1, evidenceCursor: first.cursors.evidence }, { context });
  assert.equal(first.completeness.evidence, false);
  assert.equal(second.evidence[0].submissionId, "receipt-2");
});
test("workflow API denies unauthenticated training administrator foreign self and omitted year", async () => {
  const f = fixture();
  async function request(input, access = { ok: true, db: f.db, staffId: "staff-1", roles: ["staff"] }) {
    const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
    await handleTbScreeningWorkflowRequest({ method: "GET", query: input }, response, { context, authAccess: async () => access });
    return response;
  }
  assert.equal((await request({ schoolYear: 2026 }, { ok: false, status: 401, message: "login" })).code, 401);
  assert.equal((await request({ schoolYear: 2026, scope: "admin", staffId: "staff-1" }, { ok: true, roles: ["training_admin"] })).code, 403);
  assert.equal((await request({ schoolYear: 2026, staffId: "foreign" })).code, 403);
  assert.equal((await request({})).code, 400);
});

test("live file metadata gate accepts only private untrashed exact QA folder", async () => {
  const configured = { ...context, QA_TB_CERTIFICATE_DRIVE_FOLDER_ID: "folder-1" };
  const file = { id: "file-1", trashed: false, parents: ["folder-1"] };
  const folder = { id: "folder-1", trashed: false, mimeType: "application/vnd.google-apps.folder" };
  const options = (change = {}, permissions = [{ type: "user" }]) => ({ request: async ({ url, method }) => {
    assert.equal(method, undefined);
    return { data: url.endsWith("/permissions") ? { permissions } : url.endsWith("folder-1") ? folder : { ...file, ...change } };
  } });
  assert.equal(await verifyQaTbEvidenceFile("file-1", configured, options()), true);
  for (const change of [{ trashed: true }, { parents: ["production-folder"] }, { driveId: "shared-drive" }, { id: "wrong" }]) {
    assert.equal(await verifyQaTbEvidenceFile("file-1", configured, options(change)), false);
  }
  assert.equal(await verifyQaTbEvidenceFile("file-1", configured, options({}, [{ type: "anyone" }])), false);
  assert.equal(await verifyQaTbEvidenceFile("file-1", context, options()), false);
});

test("API surface drives receipt pending administrator approval and completed readback", async () => {
  const f = fixture();
  await recordQaTbReceipt(f.db, receipt, { context });
  async function request(method, input) {
    const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
    await handleTbScreeningWorkflowRequest({ method, query: method === "GET" ? input : {}, body: method === "POST" ? input : undefined }, response, {
      ...f.options, authAccess: async () => ({ ok: true, db: f.db, staffId: "manager", roles: ["health_teacher"] }),
      directory: async () => ({ directory: [{ staffId: "staff-1", employmentStatus: "재직" }] }),
    });
    assert.equal(response.code, 200); return response.value.item;
  }
  const scope = { scope: "admin", staffId: "staff-1", schoolYear: 2026 };
  assert.equal((await request("GET", scope)).completed, false);
  const confirmed = await request("POST", { ...scope, action: "confirm", submissionId: "receipt-1", expectedRevision: 0 });
  assert.equal(confirmed.evidenceSubmissionId, "receipt-1");
  const completed = await request("GET", scope);
  assert.equal(completed.completed, true);
  assert.equal(completed.status.confirmedBy, "manager");
  assert.equal(completed.evidence[0].reviewState, "confirmed");
  await request("POST", { ...scope, action: "invalidate", submissionId: "receipt-1", expectedRevision: 1 });
  const invalidated = await request("GET", scope);
  assert.equal(invalidated.completed, true);
  assert.equal(invalidated.status.discrepancy, true);
  assert.equal(invalidated.evidence[0].reviewState, "invalid");
});

test("signed QA metadata verifier requires exact server folder private live result", async () => {
  const configured = { ...context, QA_TB_CERTIFICATE_DRIVE_FOLDER_ID: "qa-folder", QA_SUBMISSION_GAS_URL: "https://script.google.com/macros/s/qa-metadata-fixture/exec", SUBMISSION_PROXY_SECRET: "synthetic-secret-012345678901234567890" };
  const result = { status: "success", verified: true, fileId: "file-1", folderId: "qa-folder", trashed: false, private: true };
  const post = (value) => async (url, options) => {
    assert.equal(url, configured.QA_SUBMISSION_GAS_URL);
    assert.equal(options.method, "POST");
    assert.match(options.body, /qa-tb-evidence-metadata/);
    return { ok: true, json: async () => value };
  };
  assert.equal(await verifyQaTbScriptEvidence("file-1", { context: configured, postScript: post(result) }), true);
  assert.equal(await verifyQaTbScriptEvidence("file-1", { context: configured, postScript: post({ ...result, folderId: "production" }) }), false);
  assert.equal(await verifyQaTbScriptEvidence("file-1", { context: configured, postScript: post({ ...result, private: false }) }), false);
});

test("workflow GET consumes evidenceCursor across a full 100 record page", async () => {
  const f = fixture();
  for (let index = 0; index < 101; index++) {
    const submissionId = `receipt-${String(index).padStart(3, "0")}`;
    f.records.set(`staff_submissions_qa/${submissionId}`, { ...receipt, submissionId });
  }
  async function read(evidenceCursor = "") {
    const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
    await handleTbScreeningWorkflowRequest({ method: "GET", query: { schoolYear: 2026, evidenceCursor } }, res, {
      context, authAccess: async () => ({ ok: true, db: f.db, staffId: "staff-1", roles: ["staff"] }),
    });
    assert.equal(res.code, 200); return res.value;
  }
  const first = await read();
  const second = await read(first.datasets.cursors.evidence);
  assert.equal(first.item.evidence.length, 100);
  assert.equal(second.item.evidence.length, 1);
  assert.equal(second.item.evidence[0].submissionId, "receipt-100");
  assert.equal(second.datasets.completeness.evidence, true);
});

test("QA receipt and confirmation preserve existing certificate screening semantics", async () => {
  const f = fixture();
  await recordQaTbReceipt(f.db, { ...receipt, checkupDate: "2026-10-01", documentType: "결핵검진 확인증" }, { context });
  const result = await f.review();
  assert.deepEqual(result.screening, { targetStatus: "target", latentStatus: "unknown", screeningType: "individual",
    completed: true, screeningDate: "2026-10-01", note: "결핵검진 확인증", registrationStatus: "submitted" });
  assert.equal(result.sourceType, "admin_confirmation");
});
