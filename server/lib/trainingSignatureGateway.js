import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_SIGNATURE_BYTES = 300_000;
const MAX_GATEWAY_CLOCK_SKEW_MS = 5 * 60 * 1000;
const SAFE_CODES = new Set([
  "AUTH_FAILED", "CONFIG_REQUIRED", "DUPLICATE_SIGNATURE", "INVALID_REQUEST", "NOT_FOUND",
  "PAYLOAD_TOO_LARGE", "PDF_RENDER_FAILED", "REPLAY_REJECTED", "STORAGE_NOT_READY",
]);

export class SignatureGatewayError extends Error {
  constructor(stage, { status = 0, code = "", message = "" } = {}) {
    super(message || "전자서명 저장소 요청에 실패했습니다.");
    this.name = "SignatureGatewayError";
    this.stage = stage;
    this.status = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 0;
    this.code = SAFE_CODES.has(code) ? code : "";
  }
}

export function gatewayBodyDigest(payloadJson) {
  return createHash("sha256").update(payloadJson, "utf8").digest("hex");
}

export function gatewayCanonicalMessage({ timestamp, requestId, action, bodyDigest }) {
  return `${timestamp}\n${requestId}\n${action}\n${bodyDigest}`;
}

export function signGatewayRequest(secret, fields) {
  return createHmac("sha256", secret).update(gatewayCanonicalMessage(fields), "utf8").digest("hex");
}

export function verifyGatewaySignature(secret, fields, signature) {
  if (!/^[a-f0-9]{64}$/i.test(signature || "")) return false;
  const expected = Buffer.from(signGatewayRequest(secret, fields), "hex");
  const actual = Buffer.from(signature, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function assertRequestId(requestId) {
  if (!/^[0-9a-f-]{36}$/i.test(requestId || "")) throw new RangeError("출석 요청 ID가 올바르지 않습니다.");
}

function assertPng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_SIGNATURE_BYTES || !bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new RangeError("서명 파일 형식이 올바르지 않습니다.");
  }
}

export class AppsScriptGatewayClient {
  constructor({ url = process.env.TRAINING_SIGNATURE_GATEWAY_URL || "", secret = process.env.TRAINING_SIGNATURE_GATEWAY_SECRET || "",
    fetchImpl = fetch, now = () => Date.now() } = {}) {
    this.url = url;
    this.secret = secret;
    this.fetchImpl = fetchImpl;
    this.now = now;
  }

  get configured() {
    return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(this.url) && Buffer.byteLength(this.secret, "utf8") >= 32;
  }

  async request(action, payload, { requestId = randomUUID(), stage = "SIGNATURE_GATEWAY_AUTH" } = {}) {
    if (!this.configured) throw new SignatureGatewayError("SIGNATURE_GATEWAY_CONFIG", { code: "CONFIG_REQUIRED" });
    assertRequestId(requestId);
    const payloadJson = JSON.stringify(payload || {});
    const timestamp = this.now();
    const bodyDigest = gatewayBodyDigest(payloadJson);
    const fields = { timestamp, requestId, action, bodyDigest };
    const response = await this.fetchImpl(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...fields, signature: signGatewayRequest(this.secret, fields), payloadJson }),
      redirect: "follow",
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true) {
      throw new SignatureGatewayError(stage, { status: response.status, code: result?.code });
    }
    return result;
  }
}

export class SignatureStorage {
  async healthCheck() { throw new Error("SignatureStorage.healthCheck must be implemented."); }
  async saveSignature() { throw new Error("SignatureStorage.saveSignature must be implemented."); }
  async readSignature() { throw new Error("SignatureStorage.readSignature must be implemented."); }
  async findByRequestId() { throw new Error("SignatureStorage.findByRequestId must be implemented."); }
}

export class AppsScriptSignatureStorage extends SignatureStorage {
  constructor(options = {}) {
    super();
    this.gateway = options.gateway || new AppsScriptGatewayClient(options);
  }

  get configured() { return this.gateway.configured; }

  async healthCheck() {
    const result = await this.gateway.request("healthCheck", {}, { stage: "SIGNATURE_GATEWAY_AUTH" });
    return { reachable: true, authenticated: true, storageReady: result.storageReady === true, readReady: result.readReady === true };
  }

  async saveSignature({ bytes, eventId, year, requestId }) {
    assertPng(bytes);
    if (!/^[A-Za-z0-9_-]{3,120}$/.test(eventId || "") || !/^20\d{2}$/.test(String(year || ""))) {
      throw new RangeError("서명 저장 경로가 올바르지 않습니다.");
    }
    const result = await this.gateway.request("saveSignature", {
      eventId, year: String(year), pngBase64: bytes.toString("base64"),
    }, { requestId, stage: "SIGNATURE_GATEWAY_SAVE" });
    if (!/^[0-9]{4}\/[A-Za-z0-9_-]{3,120}\/[0-9a-f-]{36}\.png$/i.test(result.storageKey || "")) {
      throw new SignatureGatewayError("SIGNATURE_GATEWAY_SAVE", { code: "INVALID_REQUEST" });
    }
    return result.storageKey;
  }

  async readSignature(storageKey) {
    const result = await this.gateway.request("readSignature", { storageKey }, { stage: "SIGNATURE_GATEWAY_READ" });
    const bytes = Buffer.from(result.pngBase64 || "", "base64");
    assertPng(bytes);
    return bytes;
  }

  async findByRequestId(requestId, { eventId = "", year = "" } = {}) {
    assertRequestId(requestId);
    const result = await this.gateway.request("findSignatureByRequestId", { eventId, year: String(year || "") }, {
      requestId, stage: "SIGNATURE_GATEWAY_READ",
    });
    return result.found && result.storageKey ? [{ id: result.storageKey, private: true }] : [];
  }
}

export class AppsScriptTrainingRosterPdfRenderer {
  constructor(options = {}) {
    this.gateway = options.gateway || new AppsScriptGatewayClient(options);
  }

  async render({ xlsx, filename }) {
    const result = await this.gateway.request("renderRosterPdf", {
      filename, xlsxBase64: Buffer.from(xlsx).toString("base64"),
    }, { stage: "ROSTER_PDF_GENERATE" });
    const bytes = Buffer.from(result.pdfBase64 || "", "base64");
    if (bytes.length < 5 || bytes.length > 10_000_000 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new SignatureGatewayError("ROSTER_PDF_GENERATE", { code: "PDF_RENDER_FAILED" });
    }
    return bytes;
  }
}

export const signatureStorage = new AppsScriptSignatureStorage();
export const trainingRosterPdfRenderer = new AppsScriptTrainingRosterPdfRenderer({ gateway: signatureStorage.gateway });
export { MAX_GATEWAY_CLOCK_SKEW_MS, MAX_SIGNATURE_BYTES, PNG_MAGIC };
