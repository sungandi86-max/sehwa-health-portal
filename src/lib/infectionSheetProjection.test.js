import assert from "node:assert/strict";
import test from "node:test";
import { projectInfectionCaseBestEffort } from "./infectionSheetProjection.js";

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
