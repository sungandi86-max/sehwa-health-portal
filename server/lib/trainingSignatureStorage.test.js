import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { DRIVE_OAUTH_SCOPE, GoogleDriveOAuthSignatureStorage, MAX_SIGNATURE_BYTES } from "./trainingSignatureStorage.js";

const requestId = "7b377431-4dc3-4bac-acf0-cbe7c8ea3346";
const rootId = "1M8-jP6IMRiyrb1_bQjfCsb9KAxojG7KF";

function png() {
  return PNG.sync.write(new PNG({ width: 8, height: 4, colorType: 6 }));
}

function driveFake({ publicRoot = false } = {}) {
  const files = new Map([[rootId, { id: rootId, name: "QA_교직원교육센터_전자서명", mimeType: "application/vnd.google-apps.folder",
    parents: [], trashed: false, permissions: publicRoot ? [{ type: "domain", role: "reader" }] : [{ type: "user", role: "owner" }] }]]);
  const bytes = new Map();
  let sequence = 0;
  const calls = [];
  const request = async ({ url, method = "GET", params = {}, data }) => {
    calls.push({ url, method, params });
    const pathname = new URL(url).pathname;
    if (pathname.endsWith("/files") && method === "GET") {
      const idMatch = /trainingRequestId'\s*and\s*value='([^']+)'/.exec(params.q || "");
      const parentMatch = /'([^']+)' in parents/.exec(params.q || "");
      const nameMatch = /name='([^']+)'/.exec(params.q || "");
      let items = [...files.values()].filter((file) => !file.trashed);
      if (idMatch) items = items.filter((file) => file.appProperties?.trainingRequestId === idMatch[1]);
      if (parentMatch) items = items.filter((file) => file.parents?.includes(parentMatch[1]));
      if (nameMatch) items = items.filter((file) => file.name === nameMatch[1]);
      return { data: { files: items } };
    }
    if (pathname.includes("/permissions")) {
      const id = pathname.split("/").at(-2);
      return { data: { permissions: files.get(id)?.permissions || [] } };
    }
    if (method === "GET" && params.alt === "media") {
      const id = pathname.split("/").at(-1);
      if (!bytes.has(id)) throw Object.assign(new Error("missing"), { response: { status: 404 } });
      return { data: bytes.get(id) };
    }
    if (method === "GET" && pathname.includes("/files/")) {
      const id = pathname.split("/").at(-1);
      if (!files.has(id)) throw Object.assign(new Error("missing"), { response: { status: 404 } });
      return { data: files.get(id) };
    }
    if (method === "DELETE") {
      const id = pathname.split("/").at(-1);
      if (!files.has(id)) throw Object.assign(new Error("missing"), { response: { status: 404 } });
      files.delete(id); bytes.delete(id);
      return { data: {} };
    }
    if (method === "POST" && params.uploadType === "multipart") {
      const raw = Buffer.from(data);
      const metadataText = raw.toString("utf8", 0, Math.min(raw.length, 3000));
      const metadata = JSON.parse(metadataText.slice(metadataText.indexOf("{"), metadataText.indexOf("}\r\n") + 1));
      const id = `DRIVE_FILE_${++sequence}_123456`;
      files.set(id, { id, ...metadata, trashed: false, size: png().length, permissions: [{ type: "user", role: "owner" }] });
      bytes.set(id, raw.subarray(raw.lastIndexOf(Buffer.from("\r\n\r\n")) + 4, raw.lastIndexOf(Buffer.from("\r\n--"))));
      return { data: files.get(id) };
    }
    if (method === "POST" && pathname.endsWith("/files")) {
      const id = `DRIVE_FOLDER_${++sequence}_123456`;
      files.set(id, { id, ...data, trashed: false, permissions: [{ type: "user", role: "owner" }] });
      return { data: files.get(id) };
    }
    throw new Error(`Unexpected Drive request: ${method} ${url}`);
  };
  return { request, files, bytes, calls };
}

function storage(fake) {
  return new GoogleDriveOAuthSignatureStorage({ request: fake.request, config: {
    clientId: "client-id", clientSecret: "client-secret", refreshToken: "refresh-token", rootFolderId: rootId,
  } });
}

test("Drive OAuth storage uses the required server-side full Drive scope", () => {
  assert.equal(DRIVE_OAUTH_SCOPE, "https://www.googleapis.com/auth/drive");
});

test("Drive OAuth saves one private request file and reuses it idempotently", async () => {
  const fake = driveFake();
  const adapter = storage(fake);
  const input = { bytes: png(), eventId: "EVENT-1", year: 2026, requestId };
  const first = await adapter.saveSignature(input);
  const second = await adapter.saveSignature(input);
  assert.equal(first, second);
  assert.equal([...fake.files.values()].filter((file) => file.mimeType === "image/png").length, 1);
  assert.equal(fake.files.get(first).name, `${requestId}.png`);
  assert.equal(fake.files.get(first).appProperties.trainingRequestId, requestId);
  assert.equal(fake.calls.some((call) => call.params.ignoreDefaultVisibility === true), true);
});

test("group events share one Drive file for the same request", async () => {
  const fake = driveFake();
  const adapter = storage(fake);
  const first = await adapter.saveSignature({ bytes: png(), eventId: "EVENT-1", year: 2026, requestId });
  const second = await adapter.saveSignature({ bytes: png(), eventId: "EVENT-2", year: 2026, requestId });
  assert.equal(first, second);
});

test("Drive OAuth reads and finds only private PNG files below the configured root", async () => {
  const fake = driveFake();
  const adapter = storage(fake);
  const fileId = await adapter.saveSignature({ bytes: png(), eventId: "EVENT-1", year: 2026, requestId });
  assert.deepEqual(await adapter.readSignature(fileId), png());
  assert.deepEqual(await adapter.findByRequestId(requestId), [{ id: fileId, private: true }]);
  fake.files.set("OUTSIDE_FILE_123456", { id: "OUTSIDE_FILE_123456", name: "outside.png", mimeType: "image/png",
    parents: [], trashed: false, size: png().length, permissions: [{ type: "user", role: "owner" }] });
  fake.bytes.set("OUTSIDE_FILE_123456", png());
  await assert.rejects(adapter.readSignature("OUTSIDE_FILE_123456"), (error) => error.code === "OUTSIDE_ROOT");
});

test("Drive OAuth rejects public roots, duplicate request objects, malformed PNG, and oversized payloads", async () => {
  await assert.rejects(storage(driveFake({ publicRoot: true })).healthCheck(), (error) => error.code === "PUBLIC_PERMISSION");
  const fake = driveFake();
  const adapter = storage(fake);
  const fileId = await adapter.saveSignature({ bytes: png(), eventId: "EVENT-1", year: 2026, requestId });
  fake.files.set("DUPLICATE_FILE_ID_123", { ...fake.files.get(fileId), id: "DUPLICATE_FILE_ID_123" });
  await assert.rejects(adapter.findByRequestId(requestId), (error) => error.code === "DUPLICATE_OBJECT");
  await assert.rejects(storage(driveFake()).saveSignature({ bytes: Buffer.from("not png"), eventId: "EVENT-1", year: 2026, requestId }), /형식/);
  await assert.rejects(storage(driveFake()).saveSignature({ bytes: Buffer.concat([png(), Buffer.alloc(MAX_SIGNATURE_BYTES)]), eventId: "EVENT-1", year: 2026, requestId }), /형식/);
});

test("Drive OAuth fails closed on invalid credentials, inaccessible roots, MIME spoofing, and public files", async () => {
  const invalidAuth = new GoogleDriveOAuthSignatureStorage({ request: async () => {
    throw Object.assign(new Error("unauthorized"), { response: { status: 401 } });
  }, config: { clientId: "id", clientSecret: "secret", refreshToken: "token", rootFolderId: rootId } });
  await assert.rejects(invalidAuth.healthCheck(), (error) => error.code === "DRIVE_NOT_READY");

  const missingRoot = driveFake();
  missingRoot.files.delete(rootId);
  await assert.rejects(storage(missingRoot).healthCheck(), (error) => error.code === "DRIVE_NOT_READY");

  const fake = driveFake();
  const adapter = storage(fake);
  const fileId = await adapter.saveSignature({ bytes: png(), eventId: "EVENT-1", year: 2026, requestId });
  fake.files.get(fileId).mimeType = "text/plain";
  await assert.rejects(adapter.readSignature(fileId), (error) => error.code === "INVALID_OBJECT");
  fake.files.get(fileId).mimeType = "image/png";
  fake.files.get(fileId).permissions = [{ type: "anyone", role: "reader" }];
  await assert.rejects(adapter.readSignature(fileId), (error) => error.code === "PUBLIC_PERMISSION");
});

test("Drive OAuth validates private root readiness without writing", async () => {
  const fake = driveFake();
  assert.deepEqual(await storage(fake).healthCheck(), {
    authReady: true, folderAccessible: true, folderPrivate: true, readReady: true, writeReady: null,
  });
  assert.equal(fake.calls.some((call) => call.method === "POST" || call.method === "DELETE"), false);
});

test("signature deletion validates root boundary", async () => {
  const fake = driveFake();
  const adapter = storage(fake);
  const fileId = await adapter.saveSignature({ bytes: png(), eventId: "EVENT-1", year: 2026, requestId });
  assert.equal(await adapter.deleteSignature(fileId), true);
  assert.equal(fake.files.has(fileId), false);
  await assert.rejects(adapter.deleteSignature("OUTSIDE_FILE_123456"), (error) => error.code === "NOT_FOUND");
});
