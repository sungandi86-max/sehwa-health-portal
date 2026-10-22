import assert from "node:assert/strict";
import test from "node:test";
import { buildLegacyCprCertificateRecord, CprCertificateSubmissionStore,
  planLegacyCprCertificateMigration } from "./cprCertificateSubmissionStore.js";

function databaseFixture() {
  const documents = new Map();
  return { documents, database: () => ({ collection: (name) => ({
    doc: (id) => ({ create: async (value) => {
      const key = `${name}/${id}`; if (documents.has(key)) throw new Error("already exists"); documents.set(key, value);
    }, get: async () => { const value = documents.get(`${name}/${id}`); return { exists: Boolean(value), id, data: () => value }; } }),
    get: async () => ({ docs: [...documents.entries()].filter(([key]) => key.startsWith(`${name}/`))
      .map(([key, value]) => ({ id: key.slice(name.length + 1), data: () => value })) }),
  }) }) };
}

const legacy = (sourceRow, overrides = {}) => ({ sourceRow, staffId: "T022", complete: true,
  original: { submittedAt: "2026-09-02 15:34:45", name: "fixture", department: "QA", staffType: "교원",
    completionDate: "2026-01-01", institution: "fixture", fileName: "fixture.pdf", fileUrl: "https://drive.google.com/file/d/file/view" },
  evidenceFiles: [{ fileId: "file", originalUrl: "https://drive.google.com/file/d/file/view",
    fileName: "fixture.pdf", mimeType: "application/pdf", exists: true }], ...overrides });

test("QA CPR certificate ledger stores fileId evidence without profile or public URL projection", async () => {
  const fixture = databaseFixture();
  const store = new CprCertificateSubmissionStore({ database: fixture.database,
    context: () => ({ APP_ENV: "qa", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }), submissionId: () => "qa-cpr-1" });
  const saved = await store.createRequest({ staffId: "T022", submittedAt: new Date("2026-10-12T01:02:03Z"),
    completionDate: "2026-01-01", institution: "fixture",
    evidenceFile: { fileId: "drive-file", fileName: "fixture.pdf", mimeType: "application/pdf" } });
  assert.equal(store.collectionName, "cpr_certificate_submissions_qa");
  assert.equal(saved.environment, "qa");
  assert.equal(saved.evidenceFiles[0].fileId, "drive-file");
  assert.equal(saved.evidenceFiles[0].originalUrl, "");
  assert.equal("name" in saved, false);
  assert.deepEqual(await store.getRequest(saved.submissionId), saved);
});

test("legacy CPR plan separates complete evidence from incomplete or missing evidence", () => {
  const now = new Date("2026-10-12T02:00:00Z");
  const rows = [legacy(2), legacy(3, { complete: false }), legacy(4, {
    evidenceFiles: [{ fileId: "missing", originalUrl: "https://drive.google.com/file/d/missing/view",
      fileName: "fixture.pdf", mimeType: "application/pdf", exists: false, lookupStatus: "NOT_FOUND" }],
  })];
  const plan = planLegacyCprCertificateMigration({ environment: "production", rows, now });
  assert.deepEqual({ create: plan.create, manualReview: plan.manualReview, conflict: plan.conflict },
    { create: 1, manualReview: 2, conflict: 0 });
  assert.equal(plan.records.filter((item) => item.evidenceMissing).length, 1);
  const missing = plan.records.find((item) => item.originalRowNumber === 4);
  assert.equal(missing.status, "manual_review");
  assert.equal(missing.manualReview, true);
  assert.equal(missing.evidenceFiles[0].fileId, "missing");
  assert.equal(missing.evidenceFiles[0].originalUrl, "https://drive.google.com/file/d/missing/view");
  assert.equal(missing.evidenceFiles[0].lookupStatus, "NOT_FOUND");
  assert.equal(plan.records.every((item) => item.staffId === "T022"), true);
  const existing = buildLegacyCprCertificateRecord({ environment: "production", now, ...rows[0] });
  const rerun = planLegacyCprCertificateMigration({ environment: "production", rows: [rows[0]], existing: [existing], now });
  assert.equal(rerun.skip, 1);
});

test("CPR certificate collections remain environment isolated", () => {
  const production = new CprCertificateSubmissionStore({ context: () => ({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }) });
  assert.equal(production.collectionName, "cpr_certificate_submissions_production");
  assert.throws(() => new CprCertificateSubmissionStore({ context: () => ({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/x" }) }).collectionName,
    /승인된 배포 환경/);
});
