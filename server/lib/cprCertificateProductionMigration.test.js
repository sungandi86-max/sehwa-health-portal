import assert from "node:assert/strict";
import test from "node:test";
import { readLegacyRows, runMigration } from "../../scripts/migrateCprCertificateSubmissions.mjs";

const source = [
  ["제출일시", "성명", "소속/부서", "교직원구분", "이수일자", "이수기관", "파일명", "파일링크"],
  ["2026-01-01", "A", "D", "S", "2026-01-01", "I", "a.pdf", "https://drive.google.com/file/d/123456789012345678901/view"],
  ...Array.from({ length: 5 }, (_, index) => ["2026-01-02", "B", "D", "S", "", "", `m${index}.pdf`, `https://drive.google.com/file/d/22345678901234567890${index}/view`]),
];

test("approved six-row mapping keeps one canonical and five missing-evidence manual reviews", async () => {
  const rows = await readLegacyRows({ readValues: async () => source,
    inspect: async (fileId) => ({ exists: fileId.startsWith("1"), mimeType: fileId.startsWith("1") ? "application/pdf" : "", lookupStatus: fileId.startsWith("1") ? "FOUND" : "NOT_FOUND" }) });
  assert.equal(rows.length, 6);
  assert.equal(rows[0].staffId, "T057");
  assert.equal(rows[0].complete, true);
  assert.equal(rows.slice(1).every((row) => row.staffId === "T022" && row.complete === false), true);
});

test("Production migration is create-only and idempotent without touching CPR status", async () => {
  const writes = [];
  const readRows = async () => (await readLegacyRows({ readValues: async () => source,
    inspect: async (fileId) => ({ exists: fileId.startsWith("1"), mimeType: "application/pdf", lookupStatus: fileId.startsWith("1") ? "FOUND" : "NOT_FOUND" }) }));
  const store = { listRequests: async () => [] };
  const dryRun = await runMigration({ readRows, store, now: new Date("2026-10-12T00:00:00.000Z") });
  assert.deepEqual(dryRun, { sourceRows: 6, existing: 0, create: 1, manualReview: 5, skip: 0, conflict: 0, applied: 0 });
  const applied = await runMigration({ apply: true, readRows, store, now: new Date("2026-10-12T00:00:00.000Z"),
    database: () => ({ collection(name) { assert.equal(name, "cpr_certificate_submissions_production"); return {
      doc(id) { return { create: async (record) => writes.push({ id, record }) }; },
    }; } }) });
  assert.equal(applied.applied, 6);
  assert.equal(writes.filter(({ record }) => record.manualReview).length, 5);
  assert.equal(writes.some(({ record }) => record.status === "completed"), false);
});
