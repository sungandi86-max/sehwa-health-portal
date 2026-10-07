import test from "node:test";
import assert from "node:assert/strict";
import { summarizeTrainingRuntimePreflight, TRAINING_RUNTIME_CHECKS } from "./trainingRuntimePreflight.js";

test("all Google Drive OAuth runtime checks are shown as ready", () => {
  const checks = Object.fromEntries(TRAINING_RUNTIME_CHECKS.map(({ key }) => [key, true]));
  const result = summarizeTrainingRuntimePreflight({ ok: true, checks });
  assert.equal(result.ready, true);
  assert.equal(result.needsBootstrap, false);
  assert.equal(result.checks.length, 9);
  assert.equal(result.checks.every(({ passed }) => passed), true);
});

test("partial or malformed runtime results show only known failed check names", () => {
  const checks = Object.fromEntries(TRAINING_RUNTIME_CHECKS.map(({ key }) => [key, true]));
  checks.signatureDriveRootReady = false;
  const result = summarizeTrainingRuntimePreflight({ ok: false, needsBootstrap: true, checks,
    secret: "DO_NOT_RENDER", folderId: "DO_NOT_RENDER" });
  assert.equal(result.ready, false);
  assert.equal(result.needsBootstrap, true);
  assert.deepEqual(result.checks.filter(({ passed }) => !passed).map(({ label }) => label), ["서명 저장소 초기화"]);
  assert.equal(JSON.stringify(result).includes("DO_NOT_RENDER"), false);
  assert.equal(summarizeTrainingRuntimePreflight({ ok: true, checks: {} }).ready, false);
  checks.signatureDriveRootReady = true;
  checks.signatureStorageReadReady = false;
  assert.deepEqual(summarizeTrainingRuntimePreflight({ ok: false, checks }).checks.filter(({ passed }) => !passed).map(({ label }) => label), ["서명 읽기 준비"]);
});
