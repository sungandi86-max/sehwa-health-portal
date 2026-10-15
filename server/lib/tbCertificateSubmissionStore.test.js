import assert from "node:assert/strict";
import test from "node:test";
import { buildLegacyTbCertificateRecord, planLegacyTbCertificateMigration,
  TbCertificateSubmissionStore } from "./tbCertificateSubmissionStore.js";

const qa = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" };
const original = { submittedAt: "2026-03-02 09:00:00", name: "Legacy", department: "QA",
  staffType: "교직원", checkupDate: "2026-03-01", documentType: "검진확인증",
  fileName: "evidence.pdf", fileUrl: "https://drive.google.com/file/d/example/view" };

test("legacy TB certificate preserves original fields and missing evidence as manual review", () => {
  const record = buildLegacyTbCertificateRecord({ environment: "production", sourceRow: 4, original,
    candidateStaffId: "T022", matchStatus: "incomplete",
    evidenceFiles: [{ fileId: "missing", originalUrl: original.fileUrl, fileName: original.fileName,
      mimeType: "", exists: false, lookupStatus: "NOT_FOUND" }], now: new Date("2026-10-12T00:00:00Z") });
  assert.equal(record.staffId, "");
  assert.equal(record.candidateStaffId, "T022");
  assert.equal(record.manualReview, true);
  assert.equal(record.evidenceMissing, true);
  assert.equal(record.status, "manual_review");
  assert.equal(record.evidenceStatus, "missing");
  assert.deepEqual(record.manualReviewReasons, ["identity_unresolved", "evidence_missing"]);
  assert.equal(record.legacyOriginal.checkupDate, original.checkupDate);
});

test("manual identity approval stays reviewable while evidence is missing", () => {
  const record = buildLegacyTbCertificateRecord({ environment: "production", sourceRow: 5, original,
    staffId: "T022", matchStatus: "manually_approved", mappingApproval: { basis: "unique roster identity and matching history" },
    evidenceFiles: [{ fileId: "missing", originalUrl: original.fileUrl, fileName: original.fileName,
      mimeType: "", exists: false, lookupStatus: "NOT_FOUND" }] });
  assert.equal(record.identityConfirmed, true);
  assert.equal(record.matchStatus, "manually_approved");
  assert.equal(record.manualReview, true);
  assert.deepEqual(record.manualReviewReasons, ["evidence_missing"]);
  assert.equal(record.migration.manualMappingApproved, true);
});

test("migration plan separates canonical creates, manual review, skips, and conflicts", () => {
  const canonical = { environment: "production", sourceRow: 2, original, staffId: "T054", matchStatus: "matched",
    evidenceFiles: [{ fileId: "found", fileName: "evidence.pdf", mimeType: "application/pdf", exists: true }] };
  const manual = { ...canonical, sourceRow: 3, staffId: "", candidateStaffId: "T008", matchStatus: "ambiguous" };
  const first = planLegacyTbCertificateMigration({ environment: "production", rows: [canonical, manual] });
  assert.deepEqual({ canonical: first.canonicalCreate, manual: first.manualReview, conflict: first.conflict },
    { canonical: 1, manual: 1, conflict: 0 });
  const repeated = planLegacyTbCertificateMigration({ environment: "production", rows: [canonical, manual],
    existing: first.records });
  assert.equal(repeated.skip, 2);
  assert.equal(repeated.conflict, 0);
});

test("QA portal request writes only the QA ledger and stores no public URL", async () => {
  let collectionName; let saved;
  const store = new TbCertificateSubmissionStore({ context: () => qa, submissionId: () => "qa-request",
    database: () => ({ collection(name) { collectionName = name; return { doc() { return {
      create: async (value) => { saved = value; },
    }; } }; } }) });
  const record = await store.createRequest({ staffId: "QA-TB-CERT-TEST-001", checkupDate: "2026-10-12",
    schoolYear: 2026, submissionId: `QA-STAFF-TB-${"a".repeat(32)}`, requestFingerprint: "a".repeat(64),
    documentType: "QA fixture", evidenceFile: { fileId: "qa-file", fileName: "qa.pdf", mimeType: "application/pdf" } });
  assert.equal(collectionName, "tb_certificate_submissions_qa");
  assert.equal(record.manualReview, false);
  assert.equal(record.evidenceFiles[0].fileId, "qa-file");
  assert.equal("originalUrl" in saved.evidenceFiles[0], true);
  assert.equal(saved.evidenceFiles[0].originalUrl, "");
  assert.equal(saved.schoolYear, 2026);
});

test("QA certificate requires explicit year before accessing the database", async () => {
  const store = new TbCertificateSubmissionStore({ context: () => qa, database: () => { throw new Error("unexpected database"); } });
  await assert.rejects(store.createRequest({ staffId: "QA", checkupDate: "2026-10-14",
    evidenceFile: { fileId: "qa-file", fileName: "qa.pdf", mimeType: "application/pdf" } }), /학년도/);
});
