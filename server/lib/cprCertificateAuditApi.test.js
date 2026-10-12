import assert from "node:assert/strict";
import test from "node:test";
import { handleCprCertificateAuditResource } from "./cprCertificateAuditApi.js";

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("CPR certificate audit admin resource separates canonical and manual-review evidence", async () => {
  const res = response();
  await handleCprCertificateAuditResource({ method: "GET" }, res, { verifyAdmin: async () => ({ ok: true }), store: {
    environment: "qa", listRequests: async () => [
      { submissionId: "one", staffId: "T057", submittedAt: "2026-05-20", source: "legacy_sheet_migration",
        status: "received", manualReview: false, evidenceMissing: false,
        evidenceFiles: [{ fileId: "file-1", fileName: "one.png", mimeType: "image/png", exists: true }], migration: { imported: false } },
      { submissionId: "two", staffId: "T022", submittedAt: "2026-09-02", source: "legacy_sheet_migration",
        status: "manual_review", manualReview: true, evidenceMissing: true,
        evidenceFiles: [{ fileId: "missing", fileName: "two.pdf", mimeType: "application/pdf", exists: false,
          lookupStatus: "NOT_FOUND" }], migration: { imported: false } },
    ],
  } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.summary, { total: 2, canonical: 1, manualReview: 1, evidenceMissing: 1 });
  assert.equal(res.body.items[0].evidenceFiles[0].fileId, "file-1");
  assert.equal(res.body.items[1].evidenceFiles[0].lookupStatus, "NOT_FOUND");
});

test("CPR certificate audit resource is administrator-only and read-only", async () => {
  const denied = response();
  await handleCprCertificateAuditResource({ method: "GET" }, denied,
    { verifyAdmin: async () => ({ ok: false, status: 403, message: "관리자 권한이 없습니다." }) });
  assert.equal(denied.statusCode, 403);
  const write = response();
  await handleCprCertificateAuditResource({ method: "POST" }, write);
  assert.equal(write.statusCode, 405);
});
