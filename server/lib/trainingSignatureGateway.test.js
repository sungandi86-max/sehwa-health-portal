import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";
import {
  AppsScriptGatewayClient,
  AppsScriptSignatureStorage,
  AppsScriptTrainingRosterPdfRenderer,
  gatewayBodyDigest,
  signGatewayRequest,
  verifyGatewaySignature,
} from "./trainingSignatureGateway.js";

const url = "https://script.google.com/macros/s/test-deployment-id/exec";
const secret = "test-only-gateway-secret-with-32-bytes-minimum";
const requestId = "7b377431-4dc3-4bac-acf0-cbe7c8ea3346";

function png() {
  return PNG.sync.write(new PNG({ width: 8, height: 4, colorType: 6 }));
}

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test("Gateway HMAC covers timestamp, request, action, and exact body digest", () => {
  const payloadJson = JSON.stringify({ eventId: "EVENT-1" });
  const fields = { timestamp: 1700000000000, requestId, action: "saveSignature", bodyDigest: gatewayBodyDigest(payloadJson) };
  const signature = signGatewayRequest(secret, fields);
  assert.equal(verifyGatewaySignature(secret, fields, signature), true);
  assert.equal(verifyGatewaySignature(secret, { ...fields, action: "readSignature" }, signature), false);
  assert.equal(verifyGatewaySignature(secret, { ...fields, bodyDigest: gatewayBodyDigest("{}") }, signature), false);
  assert.equal(verifyGatewaySignature(secret, fields, "not-a-signature"), false);
});

test("Gateway client sends no secret or staff identity and reports safe failures", async () => {
  let envelope;
  const gateway = new AppsScriptGatewayClient({ url, secret, now: () => 1700000000000,
    fetchImpl: async (_url, options) => { envelope = JSON.parse(options.body); return response({ ok: true, storageReady: true }); } });
  await gateway.request("healthCheck", {}, { requestId });
  assert.equal(envelope.timestamp, 1700000000000);
  assert.equal(envelope.requestId, requestId);
  assert.equal(envelope.action, "healthCheck");
  assert.equal(envelope.payloadJson, "{}");
  assert.equal(JSON.stringify(envelope).includes(secret), false);
  assert.equal(JSON.stringify(envelope).includes("staffId"), false);

  const rejected = new AppsScriptGatewayClient({ url, secret,
    fetchImpl: async () => response({ ok: false, code: "AUTH_FAILED", detail: "do not expose" }, 403) });
  await assert.rejects(rejected.request("healthCheck", {}, { requestId }), (error) =>
    error.code === "AUTH_FAILED" && error.status === 403 && !error.message.includes("do not expose"));
});

test("signature storage keeps request-id idempotency and scoped storage keys", async () => {
  const calls = [];
  const gateway = { configured: true, request: async (action, payload, options) => {
    calls.push({ action, payload, options });
    if (action === "saveSignature") return { ok: true, storageKey: "2026/EVENT-1/" + requestId + ".png" };
    if (action === "readSignature") return { ok: true, pngBase64: png().toString("base64") };
    if (action === "findSignatureByRequestId") return { ok: true, found: true, storageKey: "2026/EVENT-1/" + requestId + ".png" };
    return { ok: true, storageReady: true, readReady: true };
  } };
  const storage = new AppsScriptSignatureStorage({ gateway });
  const first = await storage.saveSignature({ bytes: png(), eventId: "EVENT-1", year: 2026, requestId });
  const second = await storage.saveSignature({ bytes: png(), eventId: "EVENT-1", year: 2026, requestId });
  assert.equal(first, second);
  assert.equal(calls[0].payload.pngBase64.length > 0, true);
  assert.deepEqual(Object.keys(calls[0].payload).sort(), ["eventId", "pngBase64", "year"]);
  assert.equal((await storage.readSignature(first)).subarray(0, 8).equals(png().subarray(0, 8)), true);
  assert.deepEqual(await storage.findByRequestId(requestId, { eventId: "EVENT-1", year: 2026 }), [{ id: first, private: true }]);
});

test("signature storage rejects malformed paths, non-PNG, and oversized PNG before network", async () => {
  let calls = 0;
  const storage = new AppsScriptSignatureStorage({ gateway: { configured: true, request: async () => { calls += 1; } } });
  await assert.rejects(storage.saveSignature({ bytes: Buffer.from("not png"), eventId: "EVENT-1", year: 2026, requestId }), /형식/);
  await assert.rejects(storage.saveSignature({ bytes: Buffer.concat([png(), Buffer.alloc(300001)]), eventId: "EVENT-1", year: 2026, requestId }), /형식/);
  await assert.rejects(storage.saveSignature({ bytes: png(), eventId: "../outside", year: 2026, requestId }), /경로/);
  assert.equal(calls, 0);
});

test("PDF renderer accepts only a bounded PDF response", async () => {
  const good = new AppsScriptTrainingRosterPdfRenderer({ gateway: { request: async () => ({ pdfBase64: Buffer.from("%PDF-test").toString("base64") }) } });
  assert.equal((await good.render({ xlsx: Buffer.from("xlsx"), filename: "roster.pdf" })).toString(), "%PDF-test");
  const bad = new AppsScriptTrainingRosterPdfRenderer({ gateway: { request: async () => ({ pdfBase64: Buffer.from("html").toString("base64") }) } });
  await assert.rejects(bad.render({ xlsx: Buffer.from("xlsx"), filename: "roster.pdf" }), /실패/);
});

test("Apps Script Gateway never enables public sharing and scopes reads below the configured root", async () => {
  const source = await readFile(new URL("../../apps-script/signature-storage-gateway/Code.gs", import.meta.url), "utf8");
  assert.equal(/setSharing|ANYONE_WITH_LINK|DriveApp\.Access\.ANYONE/.test(source), false);
  assert.match(source, /SIGNATURE_FOLDER_ID/);
  assert.match(source, /isUnderRoot_/);
  assert.match(source, /fileFromStorageKey_/);
  assert.match(source, /Drive\.Permissions\.list/);
  assert.match(source, /permission\.type === "anyone"/);
  assert.match(source, /REPLAY_REJECTED/);
  assert.match(source, /CacheService\.getScriptCache/);
});
