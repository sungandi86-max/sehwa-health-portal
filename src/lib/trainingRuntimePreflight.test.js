import test from "node:test";
import assert from "node:assert/strict";
import { summarizeTrainingRuntimePreflight, TRAINING_RUNTIME_CHECKS } from "./trainingRuntimePreflight.js";

test("all Google Drive OAuth runtime checks are shown as ready", () => {
  const checks = Object.fromEntries(TRAINING_RUNTIME_CHECKS.map(({ key }) => [key, true]));
  const result = summarizeTrainingRuntimePreflight({ ok: true, checks });
  assert.equal(result.ready, true);
  assert.equal(result.checks.length, 9);
  assert.equal(result.checks.every(({ passed }) => passed), true);
});

test("partial or malformed runtime results show only known failed check names", () => {
  const checks = Object.fromEntries(TRAINING_RUNTIME_CHECKS.map(({ key }) => [key, true]));
  checks.signatureDriveFolderAccessible = false;
  const result = summarizeTrainingRuntimePreflight({ ok: false, checks, secret: "DO_NOT_RENDER", folderId: "DO_NOT_RENDER" });
  assert.equal(result.ready, false);
  assert.deepEqual(result.checks.filter(({ passed }) => !passed).map(({ label }) => label), ["서명 폴더 접근"]);
  assert.equal(JSON.stringify(result).includes("DO_NOT_RENDER"), false);
  assert.equal(summarizeTrainingRuntimePreflight({ ok: true, checks: {} }).ready, false);
  checks.signatureDriveFolderAccessible = true;
  checks.signatureStorageReadReady = false;
  assert.deepEqual(summarizeTrainingRuntimePreflight({ ok: false, checks }).checks.filter(({ passed }) => !passed).map(({ label }) => label), ["서명 읽기 준비"]);
});
