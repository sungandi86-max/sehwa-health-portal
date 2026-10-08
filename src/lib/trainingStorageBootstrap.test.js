import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getTrainingStorageBootstrapUiState,
  performTrainingStorageBootstrap,
  TRAINING_STORAGE_BOOTSTRAP_CONFIRM_MESSAGE,
} from "./trainingRuntimePreflight.js";

function summary({ needsBootstrap = false, rootReady = false } = {}) {
  return {
    needsBootstrap,
    checks: [{ key: "signatureDriveRootReady", passed: rootReady }],
  };
}

test("bootstrap control is active only when runtime preflight requests bootstrap", () => {
  assert.deepEqual(getTrainingStorageBootstrapUiState(summary()), {
    visible: false, enabled: false, completed: false, label: "서명 저장소 초기화",
  });
  assert.deepEqual(getTrainingStorageBootstrapUiState(summary({ needsBootstrap: true })), {
    visible: true, enabled: true, completed: false, label: "서명 저장소 초기화",
  });
  assert.deepEqual(getTrainingStorageBootstrapUiState(summary({ rootReady: true })), {
    visible: true, enabled: false, completed: true, label: "서명 저장소 초기화 완료",
  });
});

test("bootstrap requires confirmation and refreshes preflight after success", async () => {
  const calls = [];
  const outcome = await performTrainingStorageBootstrap({
    confirmAction(message) { calls.push(["confirm", message]); return true; },
    async bootstrapStorage() { calls.push(["bootstrap"]); },
    async refresh() { calls.push(["refresh"]); return summary({ rootReady: true }); },
  });
  assert.equal(TRAINING_STORAGE_BOOTSTRAP_CONFIRM_MESSAGE.includes("최초 1회"), true);
  assert.deepEqual(calls.map(([name]) => name), ["confirm", "bootstrap", "refresh"]);
  assert.equal(outcome.status, "success");
  assert.equal(getTrainingStorageBootstrapUiState(outcome.result).completed, true);
});

test("cancelled and failed bootstrap stay retryable without exposing raw errors", async () => {
  let bootstrapCalls = 0;
  const cancelled = await performTrainingStorageBootstrap({
    confirmAction: () => false,
    bootstrapStorage: async () => { bootstrapCalls += 1; },
    refresh: async () => summary(),
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(bootstrapCalls, 0);

  const failed = await performTrainingStorageBootstrap({
    confirmAction: () => true,
    bootstrapStorage: async () => { throw new Error("SECRET_TOKEN_FOLDER_ID"); },
    refresh: async () => summary(),
  });
  assert.deepEqual(failed, { status: "error" });
  assert.equal(JSON.stringify(failed).includes("SECRET_TOKEN_FOLDER_ID"), false);
});

test("admin page and bootstrap client retain role and Firebase token gates", async () => {
  const [page, client] = await Promise.all([
    readFile(new URL("../pages/FirebaseTrainingAdminPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("./trainingCenterPhase2.js", import.meta.url), "utf8"),
  ]);
  assert.match(page, /FirebaseAdminRoleAccessGate/);
  assert.match(page, /bootstrapTrainingSignatureStorage/);
  assert.match(client, /auth\.currentUser\.getIdToken\(\)/);
  assert.match(client, /Authorization: `Bearer \$\{token\}`/);
  assert.match(client, /request\("training-signature-storage-bootstrap", \{ method: "POST" \}\)/);
  for (const sensitive of ["client_secret", "refresh_token", "folderId", "fileId"]) {
    assert.equal(page.includes(sensitive), false);
  }
});
