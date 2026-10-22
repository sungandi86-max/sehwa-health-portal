import assert from "node:assert/strict";
import test from "node:test";
import { handleStudentSubmissionAuditResource } from "./studentSubmissionAuditApi.js";

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; } });

test("QA admin audit read returns only bounded metadata without student identity or Drive URL", async () => {
  const res = response();
  await handleStudentSubmissionAuditResource({ method: "GET" }, res, {
    verifyAdmin: async () => ({ ok: true }),
    store: { environment: "qa", listRequests: async () => [{
      submissionId: "QA-1", submittedAt: "2026-10-12T00:00:00Z", submissionType: "student_tb_reply",
      source: "qa_legacy_fixture", status: "manual_review", matchStatus: "unmatched", manualReview: true,
      originalRowNumber: 2, originalRowFingerprint: "fingerprint-fixture", canonicalStudentKey: null,
      studentIdentity: { name: "SECRET" }, originalFields: { "학생명": "SECRET" },
      evidenceFiles: [{ fileId: "QA-FILE", originalUrl: "https://drive.google.com/secret", mimeType: "application/pdf",
        lookupStatus: "synthetic_metadata_only" }],
    }] },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.summary, { total: 1, manualReview: 1 });
  assert.equal(res.body.items[0].hasOriginalRowFingerprint, true);
  assert.equal(res.body.items[0].hasCanonicalStudentKey, false);
  assert.equal(res.body.items[0].originalRowFingerprint, undefined);
  assert.equal(JSON.stringify(res.body).includes("SECRET"), false);
  assert.equal(JSON.stringify(res.body).includes("drive.google.com"), false);
});

test("staff and unauthenticated requests cannot read either audit ledger", async () => {
  const staff = response();
  await handleStudentSubmissionAuditResource({ method: "GET" }, staff,
    { verifyAdmin: async () => ({ ok: false, status: 403, message: "관리자 권한이 없습니다." }) });
  assert.equal(staff.statusCode, 403);
  const anonymous = response();
  await handleStudentSubmissionAuditResource({ method: "GET" }, anonymous,
    { verifyAdmin: async () => ({ ok: false, status: 401, message: "로그인이 필요합니다." }) });
  assert.equal(anonymous.statusCode, 401);
  const prod = response();
  await handleStudentSubmissionAuditResource({ method: "GET" }, prod,
    { verifyAdmin: async () => ({ ok: true }), store: { environment: "production",
      listRequests: async () => [{ submissionId: "legacy-student-reply-2", environment: "production",
        source: "legacy_sheet_migration", manualReview: true, signedPath: false, legacy: true,
        evidenceFiles: [{ fileId: "PRIVATE-FILE", originalUrl: "https://drive.google.com/private" }] }] } });
  assert.equal(prod.statusCode, 200);
  assert.deepEqual(prod.body.summary, { total: 1, manualReview: 1 });
  assert.equal(prod.body.items[0].signedPath, false);
  assert.equal(prod.body.items[0].legacy, true);
  assert.equal(JSON.stringify(prod.body).includes("drive.google.com"), false);
  const unknown = response();
  await handleStudentSubmissionAuditResource({ method: "GET" }, unknown,
    { verifyAdmin: async () => ({ ok: true }), store: { environment: null } });
  assert.equal(unknown.statusCode, 403);
  const write = response();
  await handleStudentSubmissionAuditResource({ method: "POST" }, write);
  assert.equal(write.statusCode, 405);
});
