import test from "node:test";
import assert from "node:assert/strict";
import { healthScreeningTypeCollection, healthScreeningTypeDocumentId,
  HEALTH_SCREENING_TYPES, readHealthScreeningType, saveHealthScreeningType, validHealthScreeningTypeRecord } from "./healthScreeningTypeStore.js";

test("stored route enum retains all historical values and appends individual", () => {
  assert.deepEqual([...HEALTH_SCREENING_TYPES], ["nhis", "employment", "none", "other", "individual"]);
  for (const screeningType of HEALTH_SCREENING_TYPES) {
    assert.equal(validHealthScreeningTypeRecord({ staffId: "fixture", schoolYear: 2026, environment: "qa",
      schemaVersion: 1, revision: 1, screeningTypeConfirmed: true, screeningType }, "fixture", 2026), true);
  }
});

test("collection and deterministic document helpers reject unsafe input", () => {
  assert.equal(healthScreeningTypeCollection({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }), "staff_health_screening_types_qa");
  assert.throws(() => healthScreeningTypeCollection({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }));
  assert.equal(healthScreeningTypeDocumentId("fixture", 2026), "fixture_2026");
  assert.throws(() => healthScreeningTypeDocumentId("bad/id", 2026));
});

test("read ignores wrong identity, year, environment and schema metadata", async () => {
  const base = { staffId: "fixture", schoolYear: 2026, environment: "qa", schemaVersion: 1,
    revision: 1, screeningType: "none", screeningTypeConfirmed: true };
  assert.equal(validHealthScreeningTypeRecord(base, "fixture", 2026), true);
  for (const override of [{ staffId: "other" }, { schoolYear: 2025 }, { environment: "production" }, { schemaVersion: 2 }, { revision: 0 }, { screeningType: "invalid" }]) {
    const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ ...base, ...override }) }) }) }) };
    assert.equal((await readHealthScreeningType(db, "fixture", 2026)).screeningTypeConfirmed, false);
  }
});

test("store independently rejects absent, negative and noninteger revision before database access", async () => {
  const db = { collection() { assert.fail("invalid revision must not access database"); } };
  for (const expectedRevision of [undefined, -1, 0.5, "0", null]) {
    await assert.rejects(saveHealthScreeningType(db, { staffId: "fixture", schoolYear: 2026,
      screeningType: "nhis", source: "self", confirmedBy: "fixture", expectedRevision }), { status: 400 });
  }
});
