import test from "node:test";
import assert from "node:assert/strict";
import { healthScreeningTypeCollection, healthScreeningTypeDocumentId,
  HEALTH_SCREENING_TYPES, readHealthScreeningType, saveHealthScreeningType, validHealthScreeningTypeRecord } from "./healthScreeningTypeStore.js";

test("stored route enum supports school group screening", () => {
  assert.deepEqual([...HEALTH_SCREENING_TYPES], ["nhis", "employment", "individual", "group", "none", "other"]);
  const migrated = { staffId: "fixture", schoolYear: 2026, environment: "qa", schemaVersion: 1, revision: 1,
    screeningType: "group", screeningTypeConfirmed: true, source: "legacy_firestore_backfill",
    selfChoice: null, confirmedBy: null, confirmedAt: null,
    migration: { id: "migration", sourceCollection: "staff_submission_status",
      sourceDocumentId: "fixture_tb-screening-2026", importedAt: "2026-10-15T00:00:00.000Z", manifestHash: "hash" } };
  assert.equal(validHealthScreeningTypeRecord(migrated, "fixture", 2026), true);
});

test("collection and deterministic document helpers reject unsafe input", () => {
  assert.equal(healthScreeningTypeCollection({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }), "staff_health_screening_types_qa");
  assert.equal(healthScreeningTypeCollection({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }), "staff_health_screening_types");
  assert.throws(() => healthScreeningTypeCollection({}));
  assert.equal(healthScreeningTypeDocumentId("fixture", 2026), "fixture_2026");
  assert.throws(() => healthScreeningTypeDocumentId("bad/id", 2026));
});

test("read ignores wrong identity, year, environment and schema metadata", async () => {
  const base = { staffId: "fixture", schoolYear: 2026, environment: "qa", schemaVersion: 1,
    revision: 1, screeningType: "none", screeningTypeConfirmed: true, source: "self" };
  assert.equal(validHealthScreeningTypeRecord(base, "fixture", 2026), true);
  for (const override of [{ staffId: "other" }, { schoolYear: 2025 }, { environment: "production" }, { schemaVersion: 2 }, { revision: 0 }, { screeningType: "invalid" }]) {
    const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ ...base, ...override }) }) }) }) };
    assert.equal((await readHealthScreeningType(db, "fixture", 2026, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" })).screeningTypeConfirmed, false);
  }
});

test("store independently rejects absent, negative and noninteger revision before database access", async () => {
  const db = { collection() { assert.fail("invalid revision must not access database"); } };
  for (const expectedRevision of [undefined, -1, 0.5, "0", null]) {
    await assert.rejects(saveHealthScreeningType(db, { staffId: "fixture", schoolYear: 2026,
      screeningType: "nhis", source: "self", confirmedBy: "fixture", expectedRevision }), { status: 400 });
  }
});

test("production store fails closed for synthetic staff and unknown deployment before database access", async () => {
  const db = { collection() { assert.fail("denied request must not access database"); } };
  await assert.rejects(readHealthScreeningType(db, "QA-CPR-TEST-001", 2026, { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }), { status: 403 });
  await assert.rejects(readHealthScreeningType(db, "fixture", 2026, {}), { status: 503 });
});

test("production provenance permits only audited migration reads and normal self/admin writes", async () => {
  const item = { staffId: "fixture", schoolYear: 2026, environment: "production", schemaVersion: 1, revision: 1,
    screeningType: "nhis", screeningTypeConfirmed: true, source: "legacy_firestore_backfill", selfChoice: null,
    confirmedBy: null, confirmedAt: null, migration: { id: "migration", sourceCollection: "staff_submission_status",
      sourceDocumentId: "fixture_tb-screening-2026", importedAt: "2026-10-15T00:00:00.000Z", manifestHash: "hash" } };
  assert.equal(validHealthScreeningTypeRecord(item, "fixture", 2026, "production"), true);
  for (const override of [{ source: "untrusted" }, { selfChoice: { screeningType: "nhis" } }, { confirmedBy: "someone" }, { confirmedAt: "today" }, { migration: null }]) {
    assert.equal(validHealthScreeningTypeRecord({ ...item, ...override }, "fixture", 2026, "production"), false);
  }
  const db = { collection() { assert.fail("forged provenance must not access database"); } };
  await assert.rejects(saveHealthScreeningType(db, { staffId: "fixture", schoolYear: 2026, screeningType: "nhis", source: "legacy_firestore_backfill", expectedRevision: 0 }, { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }), { status: 400 });
});
