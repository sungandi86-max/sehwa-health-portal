import assert from "node:assert/strict";
import test from "node:test";
import { buildLegacyTbRegistrationAuditRecord, planLegacyTbRegistrationMigration,
  TbRegistrationRequestStore } from "./tbRegistrationRequestStore.js";

function databaseFixture() {
  const documents = new Map();
  const createDocument = (name, id, value) => {
    const key = `${name}/${id}`;
    if (documents.has(key)) throw new Error("already exists");
    documents.set(key, value);
  };
  return {
    documents,
    database: () => ({
      batch: () => {
        const creates = [];
        return {
          create: (reference, value) => creates.push({ reference, value }),
          commit: async () => creates.forEach(({ reference, value }) => createDocument(reference.name, reference.id, value)),
        };
      },
      collection: (name) => ({
        doc: (id) => ({
          name,
          id,
          create: async (value) => createDocument(name, id, value),
          get: async () => {
            const value = documents.get(`${name}/${id}`);
            return { exists: Boolean(value), id, data: () => value };
          },
        }),
        get: async () => ({
          docs: [...documents.entries()]
            .filter(([key]) => key.startsWith(`${name}/`))
            .map(([key, value]) => ({ id: key.slice(name.length + 1), data: () => value })),
        }),
      }),
    }),
  };
}

test("QA TB registration ledger stores canonical audit fields without personal profile data", async () => {
  const fixture = databaseFixture();
  const store = new TbRegistrationRequestStore({
    database: fixture.database,
    context: () => ({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }),
    requestId: () => "qa-request-1",
  });
  const saved = await store.createRequest({
    staffId: "T022",
    selectedType: "단체검진 신청",
    now: new Date("2026-10-12T01:02:03.000Z"),
  });

  assert.equal(store.collectionName, "tb_registration_requests_qa");
  assert.equal(saved.requestId, "qa-request-1");
  assert.equal(saved.environment, "qa");
  assert.equal(saved.status, "received");
  assert.equal(saved.originalRowFingerprint.length, 64);
  assert.deepEqual(saved.migration, { imported: false });
  assert.equal("name" in saved, false);
  assert.equal("department" in saved, false);
  assert.deepEqual(await store.getRequest(saved.requestId), saved);
  assert.deepEqual(await store.listRequests(), [saved]);
});

test("TB registration ledger keeps QA and Production collections isolated", async () => {
  const fixture = databaseFixture();
  const production = new TbRegistrationRequestStore({
    database: fixture.database,
    context: () => ({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }),
  });
  assert.equal(production.collectionName, "tb_registration_requests_production");
  assert.throws(() => new TbRegistrationRequestStore({
    context: () => ({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/example" }),
  }).collectionName, /승인된 배포 환경/);
});

test("legacy migration keeps matched requests canonical and row 9 manual-review only", () => {
  const now = new Date("2026-10-12T02:00:00.000Z");
  const plan = planLegacyTbRegistrationMigration({
    environment: "production",
    now,
    rows: [
      { sourceRow: 2, matchStatus: "matched", staffId: "T095",
        original: { timestamp: "2026-09-11 10:11:50", name: "legacy-1", department: "dept", selectedType: "단체검진 신청", note: "" } },
      { sourceRow: 9, matchStatus: "manual_review", candidateStaffId: "T043",
        original: { timestamp: "", name: "legacy-2", department: "", selectedType: "", note: "" } },
    ],
  });
  assert.equal(plan.create, 1);
  assert.equal(plan.manualReview, 1);
  assert.equal(plan.conflict, 0);
  assert.equal(plan.records.length, 2);
  const manual = plan.records.find((item) => item.manualReview);
  assert.equal("staffId" in manual, false);
  assert.equal(manual.candidateStaffId, "T043");
  assert.equal(manual.status, "manual_review");
  assert.equal(manual.selectedType, "");
  assert.equal(manual.submittedAt, "");
  assert.equal(manual.migration.sourceRow, 9);
});

test("legacy dry-run skips the same fingerprint and reports conflicting existing records", () => {
  const input = { environment: "production", now: new Date("2026-10-12T02:00:00.000Z"), sourceRow: 2,
    matchStatus: "matched", staffId: "T095",
    original: { timestamp: "2026-09-11", name: "legacy", department: "dept", selectedType: "단체검진 신청", note: "" } };
  const record = buildLegacyTbRegistrationAuditRecord(input);
  const skipped = planLegacyTbRegistrationMigration({ environment: "production", now: input.now,
    rows: [input], existing: [record] });
  assert.equal(skipped.skip, 1);
  assert.equal(skipped.canonicalSkip, 1);
  assert.equal(skipped.manualReviewSkip, 0);
  assert.equal(skipped.create, 0);
  const conflict = planLegacyTbRegistrationMigration({ environment: "production", now: input.now,
    rows: [input], existing: [{ ...record, originalRowFingerprint: "different" }] });
  assert.equal(conflict.conflict, 1);
  assert.equal(conflict.create, 0);
});

test("legacy apply creates canonical and manual-review records without overwriting", async () => {
  const fixture = databaseFixture();
  const store = new TbRegistrationRequestStore({
    database: fixture.database,
    context: () => ({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }),
  });
  const now = new Date("2026-10-12T02:00:00.000Z");
  const rows = [
    { sourceRow: 2, matchStatus: "matched", staffId: "T095",
      original: { timestamp: "2026-09-11", name: "legacy", department: "dept", selectedType: "단체검진 신청", note: "" } },
    { sourceRow: 9, matchStatus: "manual_review", candidateStaffId: "T043",
      original: { timestamp: "", name: "legacy-2", department: "", selectedType: "", note: "" } },
  ];
  const plan = planLegacyTbRegistrationMigration({ environment: "production", rows, now });
  assert.deepEqual(await store.applyLegacyMigration(plan), { created: 2 });
  const saved = await store.listRequests();
  assert.equal(saved.length, 2);
  assert.equal(saved.filter((item) => item.manualReview).length, 1);
  const rerun = planLegacyTbRegistrationMigration({ environment: "production", rows, existing: saved, now });
  assert.equal(rerun.canonicalSkip, 1);
  assert.equal(rerun.manualReviewSkip, 1);
  assert.equal(rerun.conflict, 0);
  await assert.rejects(() => store.applyLegacyMigration({ ...plan, conflict: 1 }), /충돌 없는/);
  await assert.rejects(() => store.applyLegacyMigration(plan), /already exists/);
});
