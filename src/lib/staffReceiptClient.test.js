import test from "node:test";
import assert from "node:assert/strict";
import { receiptRequest, staffReceiptMessage } from "./staffReceiptClient.js";
const payload = { type: "cpr", fields: { completionDate: "2026-10-01" }, fileMimeType: "application/pdf", fileBase64: "fixture" };
test("client retains intent and scoped recovery across pending/failure/reload and clears only a confirmed sync", async () => {
  const storage = new Map();
  globalThis.sessionStorage = { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
  try {
    const first = await receiptRequest(payload, "staff-a");
    first.observe({ recoveryToken: "mock-scoped-proof" });
    const retry = await receiptRequest(payload, "staff-a"); assert.equal(retry.requestId, first.requestId); assert.equal(retry.recoveryToken, "mock-scoped-proof");
    retry.observe({ receiptSaved: true, statusSynced: false });
    assert.equal((await receiptRequest(payload, "staff-a")).requestId, first.requestId);
    const reloaded = await import(`./staffReceiptClient.js?reload=${Date.now()}`);
    const restored = await reloaded.receiptRequest(payload, "staff-a"); assert.equal(restored.requestId, first.requestId);
    assert.notEqual((await receiptRequest(payload, "staff-b")).requestId, first.requestId);
    retry.observe({ receiptSaved: true, statusSynced: true });
    assert.notEqual((await receiptRequest(payload, "staff-a")).requestId, first.requestId);
  } finally { delete globalThis.sessionStorage; }
});
test("user messages require server confirmation and distinguish pending, reviewed, rejected and invalid states", () => {
  assert.match(staffReceiptMessage({}), /확인되지/);
  assert.match(staffReceiptMessage({ receiptSaved: true, syncPending: true }), /현황 반영 대기/);
  assert.match(staffReceiptMessage({ receiptSaved: true, receiptState: "completed" }), /관리자 확인/);
  for (const receiptState of ["rejected", "invalidated"]) assert.match(staffReceiptMessage({ receiptSaved: true, receiptState }), /반려 또는 무효/);
});

test("proxy recovery scopes by subject/action and preserves an explicit existing requestId", async () => {
  const one = await receiptRequest({ ...payload, action: "admin_proxy", subjectStaffId: "S-A", requestId: "existing-request-001" }, "admin");
  assert.equal(one.requestId, "existing-request-001");
  const auto = await receiptRequest({ ...payload, action: "admin_proxy", subjectStaffId: "S-A" }, "admin");
  const retry = await receiptRequest({ ...payload, action: "admin_proxy", subjectStaffId: "S-A" }, "admin");
  const other = await receiptRequest({ ...payload, action: "admin_proxy", subjectStaffId: "S-B" }, "admin");
  assert.equal(auto.requestId, retry.requestId); assert.notEqual(other.requestId, auto.requestId);
});
