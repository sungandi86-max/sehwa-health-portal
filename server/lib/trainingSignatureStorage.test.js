import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import {
  APP_OWNER, DRIVE_OAUTH_SCOPE, GoogleDriveOAuthSignatureStorage, MAX_SIGNATURE_BYTES,
  REQUESTS_PURPOSE, ROOT_PURPOSE, SIGNATURE_PURPOSE, YEAR_PURPOSE,
} from "./trainingSignatureStorage.js";

const requestId = "7b377431-4dc3-4bac-acf0-cbe7c8ea3346";
const config = { clientId: "client-id", clientSecret: "client-secret", refreshToken: "refresh-token" };

function png() {
  return PNG.sync.write(new PNG({ width: 8, height: 4, colorType: 6 }));
}

function marker(purpose, year = "") {
  return { appOwner: APP_OWNER, purpose, environment: "qa", ...(year ? { year } : {}) };
}

function driveFake({ rootCount = 0, publicRoot = false } = {}) {
  const files = new Map();
  const bytes = new Map();
  const calls = [];
  let sequence = 0;

  function addFile(file, content = null) {
    files.set(file.id, { trashed: false, permissions: [{ type: "user", role: "owner" }], ...file });
    if (content) bytes.set(file.id, content);
    return files.get(file.id);
  }

  for (let index = 0; index < rootCount; index += 1) {
    addFile({ id: `ROOT_FOLDER_${index}_123456`, name: "온라인보건실_연수서명_qa",
      mimeType: "application/vnd.google-apps.folder", appProperties: marker(ROOT_PURPOSE),
      permissions: publicRoot ? [{ type: "domain", role: "reader" }] : [{ type: "user", role: "owner" }] });
  }

  function queryFiles(query = "") {
    let items = [...files.values()].filter((file) => !file.trashed);
    const parent = /'([^']+)' in parents/.exec(query)?.[1];
    const mime = /mimeType='([^']+)'/.exec(query)?.[1];
    const properties = [...query.matchAll(/appProperties has \{ key='([^']+)' and value='([^']+)' \}/g)];
    if (parent) items = items.filter((file) => file.parents?.includes(parent));
    if (mime) items = items.filter((file) => file.mimeType === mime);
    for (const [, key, value] of properties) items = items.filter((file) => file.appProperties?.[key] === value);
    return items;
  }

  const request = async ({ url, method = "GET", params = {}, data }) => {
    calls.push({ url, method, params, data });
    const pathname = new URL(url).pathname;
    if (pathname.endsWith("/files") && method === "GET") return { data: { files: queryFiles(params.q) } };
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
      files.delete(id);
      bytes.delete(id);
      return { data: {} };
    }
    if (method === "POST" && params.uploadType === "multipart") {
      const raw = Buffer.from(data);
      const metadataText = raw.toString("utf8", 0, Math.min(raw.length, 4000));
      const metadata = JSON.parse(metadataText.slice(metadataText.indexOf("{"), metadataText.indexOf("}\r\n") + 1));
      const id = `DRIVE_FILE_${++sequence}_123456`;
      const content = raw.subarray(raw.lastIndexOf(Buffer.from("\r\n\r\n")) + 4, raw.lastIndexOf(Buffer.from("\r\n--")));
      return { data: addFile({ id, ...metadata, size: content.length }, content) };
    }
    if (method === "POST" && pathname.endsWith("/files")) {
      const id = `DRIVE_FOLDER_${++sequence}_123456`;
      return { data: addFile({ id, ...data }) };
    }
    throw new Error(`Unexpected Drive request: ${method} ${url}`);
  };
  return { request, files, bytes, calls, addFile, queryFiles };
}

function storage(fake, environment = "qa") {
  return new GoogleDriveOAuthSignatureStorage({ request: fake.request, config, environment: () => environment });
}

async function bootstrapped() {
  const fake = driveFake();
  const adapter = storage(fake);
  await adapter.bootstrap();
  return { fake, adapter };
}

test("Drive OAuth storage uses only the drive.file scope", () => {
  assert.equal(DRIVE_OAUTH_SCOPE, "https://www.googleapis.com/auth/drive.file");
});

test("read-only preflight reports needsBootstrap without writing", async () => {
  const fake = driveFake();
  assert.deepEqual(await storage(fake).healthCheck(), {
    authReady: true, rootReady: false, rootPrivate: false, readReady: false, needsBootstrap: true, writeReady: null,
  });
  assert.equal(fake.calls.some(({ method }) => method === "POST" || method === "DELETE"), false);
});

test("root bootstrap creates once and reuses the app-marked private root", async () => {
  const fake = driveFake();
  const adapter = storage(fake);
  const first = await adapter.bootstrap();
  const second = await adapter.bootstrap();
  assert.equal(first.created, true);
  assert.deepEqual(second, { rootFolderId: first.rootFolderId, created: false });
  const roots = fake.queryFiles(`trashed=false and appProperties has { key='appOwner' and value='${APP_OWNER}' } and appProperties has { key='purpose' and value='${ROOT_PURPOSE}' }`);
  assert.equal(roots.length, 1);
  assert.equal(roots[0].name, "온라인보건실_연수서명_qa");
});

test("root bootstrap rejects duplicate or public roots", async () => {
  await assert.rejects(storage(driveFake({ rootCount: 2 })).bootstrap(), (error) => error.code === "DUPLICATE_ROOT");
  await assert.rejects(storage(driveFake({ rootCount: 1, publicRoot: true })).healthCheck(), (error) => error.code === "PUBLIC_PERMISSION");
});

test("save bootstraps marked year and requests folders then reuses one request file", async () => {
  const { fake, adapter } = await bootstrapped();
  const input = { bytes: png(), eventId: "EVENT-1", year: 2026, requestId };
  const first = await adapter.saveSignature(input);
  const second = await adapter.saveSignature(input);
  assert.equal(first, second);
  const stored = fake.files.get(first);
  assert.deepEqual(stored.appProperties, { ...marker(SIGNATURE_PURPOSE, "2026"), trainingRequestId: requestId });
  assert.equal([...fake.files.values()].filter((file) => file.appProperties?.purpose === YEAR_PURPOSE).length, 1);
  assert.equal([...fake.files.values()].filter((file) => file.appProperties?.purpose === REQUESTS_PURPOSE).length, 1);
  assert.equal([...fake.files.values()].filter((file) => file.mimeType === "image/png").length, 1);
  assert.equal(fake.calls.some(({ params }) => params.ignoreDefaultVisibility === true), true);
});

test("group events share one file for the same request", async () => {
  const { adapter } = await bootstrapped();
  const first = await adapter.saveSignature({ bytes: png(), eventId: "EVENT-1", year: 2026, requestId });
  const second = await adapter.saveSignature({ bytes: png(), eventId: "EVENT-2", year: 2026, requestId });
  assert.equal(first, second);
});

test("request lookup rejects duplicate objects and requires the expected year", async () => {
  const { fake, adapter } = await bootstrapped();
  const fileId = await adapter.saveSignature({ bytes: png(), eventId: "EVENT-1", year: 2026, requestId });
  fake.addFile({ ...fake.files.get(fileId), id: "DUPLICATE_FILE_123456" }, png());
  await assert.rejects(adapter.findByRequestId(requestId, { year: 2026 }), (error) => error.code === "DUPLICATE_OBJECT");
  await assert.rejects(adapter.findByRequestId(requestId), /연도/);
});

test("read accepts only private app-created signatures inside the marked hierarchy", async () => {
  const { fake, adapter } = await bootstrapped();
  const fileId = await adapter.saveSignature({ bytes: png(), eventId: "EVENT-1", year: 2026, requestId });
  assert.deepEqual(await adapter.readSignature(fileId), png());
  const legitimate = fake.files.get(fileId);
  fake.addFile({ ...legitimate, id: "UNMARKED_FILE_123456", appProperties: {}, name: "outside.png" }, png());
  await assert.rejects(adapter.readSignature("UNMARKED_FILE_123456"), (error) => error.code === "INVALID_OBJECT");
  legitimate.permissions = [{ type: "anyone", role: "reader" }];
  await assert.rejects(adapter.readSignature(fileId), (error) => error.code === "PUBLIC_PERMISSION");
});

test("save and read reject malformed or oversized PNG payloads", async () => {
  const { adapter } = await bootstrapped();
  await assert.rejects(adapter.saveSignature({ bytes: Buffer.from("not png"), eventId: "EVENT-1", year: 2026, requestId }), /형식/);
  await assert.rejects(adapter.saveSignature({ bytes: Buffer.concat([png(), Buffer.alloc(MAX_SIGNATURE_BYTES)]), eventId: "EVENT-1", year: 2026, requestId }), /형식/);
});

test("delete removes only a validated app-created private signature", async () => {
  const { fake, adapter } = await bootstrapped();
  const fileId = await adapter.saveSignature({ bytes: png(), eventId: "EVENT-1", year: 2026, requestId });
  assert.equal(await adapter.deleteSignature(fileId), true);
  assert.equal(fake.files.has(fileId), false);
  fake.addFile({ id: "OUTSIDE_FILE_123456", name: "outside.png", mimeType: "image/png", parents: [],
    size: png().length, appProperties: marker(SIGNATURE_PURPOSE, "2026") }, png());
  await assert.rejects(adapter.deleteSignature("OUTSIDE_FILE_123456"), (error) => error.code === "OUTSIDE_ROOT");
});

test("QA and production keep identical request IDs in distinct private roots", async () => {
  const fake = driveFake();
  const qa = storage(fake, "qa");
  const production = storage(fake, "production");
  await qa.bootstrap();
  const qaFile = await qa.saveSignature({ bytes: png(), eventId: "EVENT-1", year: 2026, requestId });
  await assert.rejects(production.readSignature(qaFile), (error) => error.code === "INVALID_OBJECT");
  await assert.rejects(production.deleteSignature(qaFile), (error) => error.code === "INVALID_OBJECT");
  await production.bootstrap();
  const productionFile = await production.saveSignature({ bytes: png(), eventId: "EVENT-1", year: 2026, requestId });
  assert.notEqual(qaFile, productionFile);
  assert.deepEqual((await qa.findByRequestId(requestId, { year: 2026 })).map((file) => file.id), [qaFile]);
  assert.deepEqual((await production.findByRequestId(requestId, { year: 2026 })).map((file) => file.id), [productionFile]);
  assert.equal(fake.files.get(qaFile).appProperties.environment, "qa");
  assert.equal(fake.files.get(productionFile).appProperties.environment, "production");
});

test("unrecognized runtime refuses Drive bootstrap before any write", async () => {
  const fake = driveFake();
  const adapter = new GoogleDriveOAuthSignatureStorage({ request: fake.request, config });
  await assert.rejects(adapter.bootstrap(), { code: "training-deployment-not-allowed" });
  assert.equal(fake.calls.length, 0);
});
