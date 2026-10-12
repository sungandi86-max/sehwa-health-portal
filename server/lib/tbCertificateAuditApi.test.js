import assert from "node:assert/strict";
import test from "node:test";
import { handleTbCertificateAuditResource } from "./tbCertificateAuditApi.js";

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; } });

test("TB certificate audit read is admin-gated and keeps manual review distinct", async () => {
  const res = response();
  await handleTbCertificateAuditResource({ method: "GET" }, res, {
    verifyAdmin: async () => ({ ok: true }),
    store: { environment: "qa", listRequests: async () => [
      { submissionId: "canonical", staffId: "QA-TB-CERT-TEST-001", submittedAt: "2026-10-12T00:00:00Z",
        source: "portal", status: "received", manualReview: false, evidenceMissing: false, evidenceFiles: [] },
      { submissionId: "legacy", staffId: "", candidateStaffId: "T022", submittedAt: "",
        source: "legacy_sheet_migration", status: "manual_review", matchStatus: "incomplete",
        identityConfirmed: false, evidenceStatus: "missing", manualReviewReasons: ["identity_unresolved", "evidence_missing"],
        manualReview: true, evidenceMissing: true, evidenceFiles: [{ fileId: "missing", lookupStatus: "NOT_FOUND" }],
        migration: { imported: true, legacySource: "staff_tb_certificate_sheet_2026",
          sourceSheetName: "응답_결핵검진확인증", sourceRow: 4 } },
    ] },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.summary, { total: 2, canonical: 1, manualReview: 1, evidenceMissing: 1 });
  assert.equal(res.body.items[1].candidateStaffId, "T022");
  assert.equal(res.body.items[1].evidenceFiles[0].lookupStatus, "NOT_FOUND");
});

test("TB certificate audit rejects non-admin access", async () => {
  const res = response();
  await handleTbCertificateAuditResource({ method: "GET" }, res,
    { verifyAdmin: async () => ({ ok: false, status: 403, message: "denied" }) });
  assert.equal(res.statusCode, 403);
});
