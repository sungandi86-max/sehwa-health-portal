import assert from "node:assert/strict";
import test from "node:test";
import {
  isSafeInfectionSheetSyncPlan,
  isSuccessfulInfectionSheetSyncApply,
  projectInfectionCaseBestEffort,
  syncInfectionSheetProjection,
} from "./infectionSheetProjection.js";

test("Sheet write failure does not reject the completed Firestore flow", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  context.after(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  });

  globalThis.fetch = async () => {
    throw new Error("sheet unavailable");
  };
  console.warn = () => {};

  const result = await projectInfectionCaseBestEffort(
    { getIdToken: async () => "test-token" },
    "test-doc"
  );
  assert.equal(result, false);
});

test("admin Sheet sync uses the current Firebase ID token without exposing it in the payload", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        mode: "dry-run",
        firestoreCount: 1,
        projectedExisting: 0,
        toInsert: 1,
        toUpdate: 0,
        unmanagedSheetRows: 1,
        duplicates: 0,
        errors: 0,
      }),
    };
  };

  const result = await syncInfectionSheetProjection({ getIdToken: async () => "private-test-token" });

  assert.equal(result.toInsert, 1);
  assert.equal(request.url, "/api/health-room-status");
  assert.equal(request.options.headers.Authorization, "Bearer private-test-token");
  assert.deepEqual(JSON.parse(request.options.body), { action: "syncInfectionSheet", apply: false });
  assert.equal(request.options.body.includes("private-test-token"), false);
});

test("admin Sheet sync safety requires valid aggregate counts without duplicate or error rows", () => {
  const safePlan = {
    success: true,
    mode: "dry-run",
    firestoreCount: 1,
    projectedExisting: 0,
    toInsert: 1,
    toUpdate: 0,
    unmanagedSheetRows: 1,
    duplicates: 0,
    errors: 0,
  };

  assert.equal(isSafeInfectionSheetSyncPlan(safePlan), true);
  assert.equal(isSafeInfectionSheetSyncPlan({ ...safePlan, duplicates: 1 }), false);
  assert.equal(isSafeInfectionSheetSyncPlan({ ...safePlan, errors: 1 }), false);
  assert.equal(isSafeInfectionSheetSyncPlan({ ...safePlan, unmatched: 1 }), false);
  assert.equal(isSafeInfectionSheetSyncPlan({ ...safePlan, unsafe: true }), false);
  assert.equal(isSafeInfectionSheetSyncPlan({ ...safePlan, toInsert: undefined }), false);
});

test("admin Sheet sync apply succeeds only with explicit zero-error write counts", () => {
  const successfulApply = {
    success: true,
    mode: "apply",
    inserted: 1,
    updated: 0,
    duplicates: 0,
    errors: 0,
  };

  assert.equal(isSuccessfulInfectionSheetSyncApply(successfulApply), true);
  assert.equal(isSuccessfulInfectionSheetSyncApply({ ...successfulApply, inserted: undefined }), false);
  assert.equal(isSuccessfulInfectionSheetSyncApply({ ...successfulApply, duplicates: 1 }), false);
  assert.equal(isSuccessfulInfectionSheetSyncApply({ ...successfulApply, errors: 1 }), false);
});
