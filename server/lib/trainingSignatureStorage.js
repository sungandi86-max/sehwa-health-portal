import { getFirebaseAdminStorageBucket, getFirebaseStorageBucketName } from "./firebaseAdmin.js";

const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_SIGNATURE_BYTES = 300_000;
const STORAGE_PREFIX = "training-signatures";
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{3,120}$/;
const STORAGE_KEY_PATTERN = /^training-signatures\/(20\d{2})\/requests\/([0-9a-f-]{36})\.png$/i;

export class SignatureStorageError extends Error {
  constructor(stage, { code = "", cause } = {}) {
    super("전자서명 저장소 요청에 실패했습니다.", cause ? { cause } : undefined);
    this.name = "SignatureStorageError";
    this.stage = stage;
    this.code = code;
  }
}

export class SignatureStorage {
  async healthCheck() { throw new Error("SignatureStorage.healthCheck must be implemented."); }
  async saveSignature() { throw new Error("SignatureStorage.saveSignature must be implemented."); }
  async readSignature() { throw new Error("SignatureStorage.readSignature must be implemented."); }
  async findByRequestId() { throw new Error("SignatureStorage.findByRequestId must be implemented."); }
}

function assertRequestId(requestId) {
  if (!REQUEST_ID_PATTERN.test(requestId || "")) throw new RangeError("출석 요청 ID가 올바르지 않습니다.");
}

function assertYear(year) {
  const value = String(year || "");
  if (!/^20\d{2}$/.test(value)) throw new RangeError("서명 저장 연도가 올바르지 않습니다.");
  return value;
}

function assertEventId(eventId) {
  if (!EVENT_ID_PATTERN.test(eventId || "")) throw new RangeError("교육 ID가 올바르지 않습니다.");
}

function assertPng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_SIGNATURE_BYTES ||
    !bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new RangeError("서명 파일 형식이 올바르지 않습니다.");
  }
}

export function signatureStorageKey({ requestId, year }) {
  assertRequestId(requestId);
  return `${STORAGE_PREFIX}/${assertYear(year)}/requests/${requestId}.png`;
}

export function signatureStorageYear(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError("서명 저장 시각이 올바르지 않습니다.");
  return new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(date);
}

function assertStorageKey(storageKey) {
  const match = STORAGE_KEY_PATTERN.exec(storageKey || "");
  if (!match || !REQUEST_ID_PATTERN.test(match[2])) throw new RangeError("서명 저장 경로가 올바르지 않습니다.");
  return storageKey;
}

function isNotFound(error) {
  return error?.code === 404 || error?.code === "404";
}

async function existingPrivatePng(file) {
  const [exists] = await file.exists();
  if (!exists) return false;
  const [metadata] = await file.getMetadata();
  const size = Number(metadata?.size);
  if (metadata?.contentType !== "image/png" || !Number.isFinite(size) || size <= 0 || size > MAX_SIGNATURE_BYTES) {
    throw new SignatureStorageError("SIGNATURE_STORAGE_READ", { code: "INVALID_OBJECT" });
  }
  if (metadata?.metadata?.firebaseStorageDownloadTokens) {
    throw new SignatureStorageError("SIGNATURE_STORAGE_READ", { code: "PUBLIC_TOKEN_PRESENT" });
  }
  return true;
}

export class FirebaseStorageSignatureStorage extends SignatureStorage {
  constructor({ bucket = null, bucketName = getFirebaseStorageBucketName, bucketFactory = getFirebaseAdminStorageBucket } = {}) {
    super();
    this.bucket = bucket;
    this.bucketName = bucketName;
    this.bucketFactory = bucketFactory;
  }

  get configured() {
    return Boolean(this.bucket || this.bucketName());
  }

  resolveBucket() {
    if (this.bucket) return this.bucket;
    if (!this.configured) throw new SignatureStorageError("SIGNATURE_STORAGE_CONFIG", { code: "CONFIG_REQUIRED" });
    this.bucket = this.bucketFactory();
    return this.bucket;
  }

  async healthCheck() {
    if (!this.configured) return { bucketReady: false, readReady: false, writeReady: null };
    try {
      const bucket = this.resolveBucket();
      await bucket.getMetadata();
      await bucket.getFiles({ prefix: `${STORAGE_PREFIX}/`, maxResults: 1, autoPaginate: false });
      return { bucketReady: true, readReady: true, writeReady: null };
    } catch (cause) {
      throw new SignatureStorageError("SIGNATURE_STORAGE_CONFIG", { code: "BUCKET_NOT_READY", cause });
    }
  }

  async saveSignature({ bytes, eventId, year, requestId }) {
    assertPng(bytes);
    assertEventId(eventId);
    const storageKey = signatureStorageKey({ requestId, year });
    const file = this.resolveBucket().file(storageKey);
    try {
      if (await existingPrivatePng(file)) return storageKey;
      await file.save(bytes, {
        resumable: false,
        validation: "crc32c",
        metadata: { contentType: "image/png", cacheControl: "private, no-store, max-age=0" },
        preconditionOpts: { ifGenerationMatch: 0 },
      });
      return storageKey;
    } catch (cause) {
      if (cause?.code === 412 && await existingPrivatePng(file)) return storageKey;
      throw new SignatureStorageError("SIGNATURE_STORAGE_SAVE", { code: "SAVE_FAILED", cause });
    }
  }

  async readSignature(storageKey) {
    const file = this.resolveBucket().file(assertStorageKey(storageKey));
    try {
      if (!await existingPrivatePng(file)) throw new SignatureStorageError("SIGNATURE_STORAGE_READ", { code: "NOT_FOUND" });
      const [bytes] = await file.download();
      assertPng(bytes);
      return bytes;
    } catch (cause) {
      if (cause instanceof RangeError || cause instanceof SignatureStorageError) throw cause;
      throw new SignatureStorageError("SIGNATURE_STORAGE_READ", { code: isNotFound(cause) ? "NOT_FOUND" : "READ_FAILED", cause });
    }
  }

  async findByRequestId(requestId, { year = "" } = {}) {
    const storageKey = signatureStorageKey({ requestId, year });
    try {
      return await existingPrivatePng(this.resolveBucket().file(storageKey)) ? [{ id: storageKey, private: true }] : [];
    } catch (cause) {
      if (isNotFound(cause)) return [];
      if (cause instanceof SignatureStorageError) throw cause;
      throw new SignatureStorageError("SIGNATURE_STORAGE_READ", { code: "READ_FAILED", cause });
    }
  }
}

export const signatureStorage = new FirebaseStorageSignatureStorage();
export { MAX_SIGNATURE_BYTES, PNG_MAGIC, STORAGE_PREFIX };
