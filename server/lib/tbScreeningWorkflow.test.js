import test from "node:test";
import assert from "node:assert/strict";
import { buildProxySubmissionRecord, buildSelfSubmissionRecord, resolveProxySubject } from "./adminProxySubmission.js";
import { productionTbSubmissionIdentity } from "./tbSubmissionIdentity.js";
import { recordProductionTbReceipt, reviewProductionTbEvidence } from "./tbScreeningWorkflowStore.js";
import { joinTbScreeningWorkflow, tbWorkflowTaskId } from "../../src/lib/tbScreeningWorkflowModel.js";
import { handleTbScreeningWorkflowRequest } from "./tbScreeningWorkflowApi.js";

function response() {
  return { statusCode: 200, body: null, setHeader() {}, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }, end() { return this; } };
}

function fakeDb(seed = {}) {
  const data = new Map(Object.entries(seed));
  const ref = (path) => ({ path, collection(name) { return ref(`${path}/${name}`); }, doc(id) { return ref(`${path}/${id}`); },
    async get() { return { exists: data.has(path), data: () => data.get(path) }; } });
  return {
    data,
    collection(name) { return { doc(id) { return ref(`${name}/${id}`); } }; },
    async runTransaction(fn) {
      const writes = [];
      const tx = { get: (item) => item.get(), set: (item, value, options) => writes.push(["set", item.path, value, options]),
        create: (item, value) => writes.push(["create", item.path, value]) };
      const result = await fn(tx);
      for (const [kind, path, value, options] of writes) {
        if (kind === "create" && data.has(path)) throw new Error("already exists");
        data.set(path, options?.merge ? { ...(data.get(path) || {}), ...value } : value);
      }
      return result;
    },
  };
}

function receipt(overrides = {}) {
  return { submissionId: "tb-receipt-1", staffId: "T049", subjectStaffId: "T049", schoolYear: 2026,
    environment: "production", checkupDate: "2026-10-10", documentType: "결핵검진 확인증",
    evidenceFiles: [{ fileId: "drive-file-1" }], submittedAt: "2026-10-11T00:00:00.000Z", ...overrides };
}

test("self receipt remains pending until administrator approval and approval is audited", async () => {
  const item = receipt();
  const db = fakeDb({ [`tb_certificate_submissions_production/${item.submissionId}`]: item });
  await recordProductionTbReceipt(db, item);
  const statusPath = `staff_submission_status/T049_${tbWorkflowTaskId(2026)}`;
  assert.equal(db.data.get(statusPath).status, "pending");
  const confirmed = await reviewProductionTbEvidence(db, { action: "confirm", submissionId: item.submissionId,
    schoolYear: 2026, actor: "T001", expectedRevision: 0 }, { now: () => "2026-10-12T00:00:00.000Z" });
  assert.equal(confirmed.status, "completed");
  assert.equal(confirmed.confirmedBy, "T001");
  assert.equal(confirmed.evidenceSubmissionId, item.submissionId);
  assert.equal(db.data.get(`${statusPath}/confirmationHistory/1`).action, "confirm");
});

test("invalidating approved evidence preserves completion and records discrepancy", async () => {
  const item = receipt();
  const statusPath = `staff_submission_status/T049_${tbWorkflowTaskId(2026)}`;
  const db = fakeDb({ [`tb_certificate_submissions_production/${item.submissionId}`]: { ...item, status: "completed", reviewState: "confirmed", revision: 2 },
    [statusPath]: { staffId: "T049", schoolYear: 2026, taskId: tbWorkflowTaskId(2026), status: "completed", revision: 1,
      evidenceSubmissionId: item.submissionId, screening: { completed: true } } });
  const result = await reviewProductionTbEvidence(db, { action: "invalidate", submissionId: item.submissionId,
    schoolYear: 2026, actor: "T001", expectedRevision: 1 }, { now: () => "2026-10-13T00:00:00.000Z" });
  assert.equal(result.status, "completed");
  assert.equal(result.discrepancy, true);
  assert.equal(db.data.get(statusPath).screening.completed, true);
});

test("idempotent retry never reopens reviewed evidence", async () => {
  const item = receipt({ status: "completed", reviewState: "confirmed", revision: 2 });
  const db = fakeDb({ [`tb_certificate_submissions_production/${item.submissionId}`]: item,
    [`staff_submission_status/T049_${tbWorkflowTaskId(2026)}`]: { staffId: "T049", schoolYear: 2026,
      taskId: tbWorkflowTaskId(2026), status: "completed", screening: { completed: true } } });
  await recordProductionTbReceipt(db, item);
  assert.equal(db.data.get(`tb_certificate_submissions_production/${item.submissionId}`).reviewState, "confirmed");
  assert.equal(db.data.get(`staff_submission_status/T049_${tbWorkflowTaskId(2026)}`).status, "completed");
});

test("workflow projection never carries evidence or completion across school years", () => {
  const projected = joinTbScreeningWorkflow({ staffId: "T049", schoolYear: 2027, route: null,
    evidence: [receipt()], status: { staffId: "T049", schoolYear: 2026, status: "completed" } });
  assert.equal(projected.evidence.length, 0);
  assert.notEqual(projected.status, "completed");
});

test("submission identity is stable for retries and separates proxy actor/request intent", () => {
  const base = { staffId: "T049", schoolYear: 2026, checkupDate: "2026-10-10", documentType: "결핵검진 확인증",
    fileMimeType: "application/pdf", fileBase64: "JVBERi0=" };
  assert.deepEqual(productionTbSubmissionIdentity(base), productionTbSubmissionIdentity(base));
  assert.notEqual(productionTbSubmissionIdentity(base).submissionId,
    productionTbSubmissionIdentity({ ...base, submissionMode: "admin_proxy", actorStaffId: "T001", requestId: "request-1" }).submissionId);
});

test("proxy record keeps subject and administrator identities separate", () => {
  const subject = resolveProxySubject([{ staffId: "T049", name: "대상자", department: "연구부", position: "교사" }], "T049");
  const record = buildProxySubmissionRecord({ subject, administrator: { staffId: "T001", name: "관리자" },
    submissionId: "tb-proxy-1", checkupDate: "2026-10-10", documentType: "결핵검진 확인증",
    file: { driveFileId: "file-1", fileName: "evidence.pdf", mimeType: "application/pdf" } });
  assert.equal(record.subjectStaffId, "T049");
  assert.equal(record.submittedByStaffId, "T001");
  assert.equal(record.submissionMode, "admin_proxy");
});

test("server-owned self mirror uses canonical subject and workflow fields", () => {
  const subject = { staffId: "T049", name: "대상자", position: "교사" };
  const record = buildSelfSubmissionRecord({ subject, submissionId: "tb-self-1", schoolYear: 2026,
    checkupDate: "2026-10-10", documentType: "결핵검진 확인증",
    file: { driveFileId: "file-1", fileName: "evidence.pdf", mimeType: "application/pdf" } });
  assert.equal(record.subjectStaffId, "T049");
  assert.equal(record.submissionMode, "self");
  assert.equal(record.schoolYear, 2026);
});

test("workflow API rejects unauthenticated, training admin, and foreign self access before data reads", async () => {
  const context = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" };
  for (const access of [
    { ok: false, status: 401, message: "로그인이 필요합니다." },
    { ok: true, staffId: "T001", roles: ["training_admin"], db: {} },
  ]) {
    const res = response();
    await handleTbScreeningWorkflowRequest({ method: "GET", query: { schoolYear: "2026" }, headers: {} }, res,
      { context, authAccess: async () => access, directory: async () => { throw new Error("must not read"); } });
    assert.equal(res.statusCode, access.ok ? 403 : 401);
  }
  const foreign = response();
  await handleTbScreeningWorkflowRequest({ method: "GET", query: { schoolYear: "2026", staffId: "T002" }, headers: {} }, foreign,
    { context, authAccess: async () => ({ ok: true, staffId: "T001", roles: ["staff"], db: {} }) });
  assert.equal(foreign.statusCode, 403);
});

test("TB review refuses a receipt linked to another canonical staff ID before transaction writes", async () => {
  const item = receipt();
  const db = fakeDb({ [`tb_certificate_submissions_production/${item.submissionId}`]: item });
  await assert.rejects(reviewProductionTbEvidence(db, { action: "confirm", staffId: "T999", submissionId: item.submissionId,
    schoolYear: 2026, expectedRevision: 0, actor: "ADMIN" }), /확인 자료를 찾지 못했습니다/);
  assert.equal(db.data.size, 1);
});
