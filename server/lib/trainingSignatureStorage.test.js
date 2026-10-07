import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import {
  FirebaseStorageSignatureStorage,
  MAX_SIGNATURE_BYTES,
  SignatureStorageError,
  signatureStorageKey,
  signatureStorageYear,
} from "./trainingSignatureStorage.js";

const requestId = "7b377431-4dc3-4bac-acf0-cbe7c8ea3346";

function png() {
  return PNG.sync.write(new PNG({ width: 8, height: 4, colorType: 6 }));
}

function fakeBucket() {
  const objects = new Map();
  const saves = [];
  return {
    objects,
    saves,
    async getMetadata() { return [{ name: "test-bucket" }]; },
    async getFiles() { return [[...objects.keys()]]; },
    file(name) {
      return {
        async exists() { return [objects.has(name)]; },
        async getMetadata() {
          if (!objects.has(name)) throw Object.assign(new Error("missing"), { code: 404 });
          const object = objects.get(name);
          return [{ contentType: object.contentType, size: String(object.bytes.length), cacheControl: object.cacheControl,
            metadata: object.metadata || {} }];
        },
        async save(bytes, options) {
          if (objects.has(name) && options.preconditionOpts?.ifGenerationMatch === 0) throw Object.assign(new Error("exists"), { code: 412 });
          saves.push({ name, options });
          objects.set(name, { bytes: Buffer.from(bytes), contentType: options.metadata.contentType,
            cacheControl: options.metadata.cacheControl });
        },
        async download() {
          if (!objects.has(name)) throw Object.assign(new Error("missing"), { code: 404 });
          return [objects.get(name).bytes];
        },
      };
    },
  };
}

test("Firebase Storage saves one private request object and reuses it idempotently", async () => {
  const bucket = fakeBucket();
  const storage = new FirebaseStorageSignatureStorage({ bucket });
  const input = { bytes: png(), eventId: "EVENT-1", year: 2026, requestId };
  const first = await storage.saveSignature(input);
  const second = await storage.saveSignature(input);
  assert.equal(first, `training-signatures/2026/requests/${requestId}.png`);
  assert.equal(second, first);
  assert.equal(bucket.saves.length, 1);
  assert.equal(bucket.saves[0].options.metadata.contentType, "image/png");
  assert.match(bucket.saves[0].options.metadata.cacheControl, /private/);
  assert.equal(JSON.stringify(bucket.saves[0]).includes("staffId"), false);
  assert.equal(JSON.stringify(bucket.saves[0]).includes("downloadToken"), false);
});

test("group events share the same request object without event identity in the path", async () => {
  const bucket = fakeBucket();
  const storage = new FirebaseStorageSignatureStorage({ bucket });
  const first = await storage.saveSignature({ bytes: png(), eventId: "EVENT-1", year: 2026, requestId });
  const second = await storage.saveSignature({ bytes: png(), eventId: "EVENT-2", year: 2026, requestId });
  assert.equal(first, second);
  assert.equal(bucket.saves.length, 1);
});

test("Firebase Storage reads only validated signature paths and finds exact request objects", async () => {
  const bucket = fakeBucket();
  const storage = new FirebaseStorageSignatureStorage({ bucket });
  const key = await storage.saveSignature({ bytes: png(), eventId: "EVENT-1", year: 2026, requestId });
  assert.deepEqual(await storage.readSignature(key), png());
  assert.deepEqual(await storage.findByRequestId(requestId, { year: 2026 }), [{ id: key, private: true }]);
  await assert.rejects(storage.readSignature("other/private.png"), /경로/);
  await assert.rejects(storage.readSignature(`training-signatures/2026/requests/${requestId}.jpg`), /경로/);
  const missingId = "9a377431-4dc3-4bac-acf0-cbe7c8ea3346";
  await assert.rejects(storage.readSignature(signatureStorageKey({ year: 2026, requestId: missingId })),
    (error) => error instanceof SignatureStorageError && error.code === "NOT_FOUND");
});

test("Firebase Storage rejects malformed IDs, MIME spoofing, oversized data, and invalid existing objects", async () => {
  const bucket = fakeBucket();
  const storage = new FirebaseStorageSignatureStorage({ bucket });
  await assert.rejects(storage.saveSignature({ bytes: Buffer.from("not png"), eventId: "EVENT-1", year: 2026, requestId }), /형식/);
  await assert.rejects(storage.saveSignature({ bytes: Buffer.concat([png(), Buffer.alloc(MAX_SIGNATURE_BYTES)]), eventId: "EVENT-1", year: 2026, requestId }), /형식/);
  await assert.rejects(storage.saveSignature({ bytes: png(), eventId: "../outside", year: 2026, requestId }), /교육 ID/);
  await assert.rejects(storage.saveSignature({ bytes: png(), eventId: "EVENT-1", year: 2026, requestId: "../outside" }), /요청 ID/);
  const key = signatureStorageKey({ year: 2026, requestId });
  bucket.objects.set(key, { bytes: png(), contentType: "text/html", cacheControl: "public" });
  await assert.rejects(storage.readSignature(key), (error) => error instanceof SignatureStorageError && error.code === "INVALID_OBJECT");
  bucket.objects.set(key, { bytes: png(), contentType: "image/png", cacheControl: "private",
    metadata: { firebaseStorageDownloadTokens: "should-not-exist" } });
  await assert.rejects(storage.readSignature(key), (error) => error instanceof SignatureStorageError && error.code === "PUBLIC_TOKEN_PRESENT");
});

test("storage health check is read-only and reports write readiness as QA-only", async () => {
  const bucket = fakeBucket();
  const storage = new FirebaseStorageSignatureStorage({ bucket });
  assert.deepEqual(await storage.healthCheck(), { bucketReady: true, readReady: true, writeReady: null });
  assert.equal(bucket.saves.length, 0);
});

test("storage year follows Asia Seoul at the UTC year boundary", () => {
  assert.equal(signatureStorageYear("2025-12-31T15:30:00.000Z"), "2026");
  assert.equal(signatureStorageYear("2026-12-31T14:59:59.000Z"), "2026");
});
