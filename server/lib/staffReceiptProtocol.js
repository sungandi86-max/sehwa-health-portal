import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { serverFirestoreResource } from "./firestoreResources.js";
import { firebaseRuntimePolicy } from "../../common/firebaseEnvironment.js";
import { productionTbSubmissionIdentity } from "./tbSubmissionIdentity.js";
import { CURRENT_SCHOOL_YEAR } from "../../src/config/school.js";
import { validatedSchoolYear } from "../../src/lib/tbScreeningWorkflowModel.js";

export class ReceiptError extends Error {
  constructor(code, status = 409) { super("제출 접수 상태를 확인해 주세요."); this.code = code; this.status = status; }
}
const hash = (value) => createHash("sha256").update(value).digest("hex");
export function staffReceiptIdentity({ payload, staffId, actorUid, environment, proxy = false, actorStaffId = "" }) {
  if (!["qa", "production"].includes(environment) || !staffId || !actorUid) throw new ReceiptError("RECEIPT_IDENTITY_REQUIRED", 403);
  if (payload.staffId !== undefined && payload.staffId !== staffId) throw new ReceiptError("SUBJECT_MISMATCH", 403);
  const schoolYear = validatedSchoolYear(payload.schoolYear ?? CURRENT_SCHOOL_YEAR);
  const fileDigest = hash(Buffer.from(payload.fileBase64, "base64"));
  const requestId = payload.requestId || "";
  if (requestId && (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(requestId))) throw new ReceiptError("REQUEST_ID_INVALID", 400);
  if (payload.type === "tb" && environment === "production") {
    return { ...productionTbSubmissionIdentity({ staffId, schoolYear, checkupDate: payload.fields.checkupDate,
      documentType: payload.fields.docType, fileBase64: payload.fileBase64, fileMimeType: payload.fileMimeType,
      submissionMode: proxy ? "admin_proxy" : "self", actorStaffId, requestId: proxy ? requestId : "" }), environment, staffId, actorUid, type: "tb" };
  }
  if (payload.type === "cpr" && schoolYear !== CURRENT_SCHOOL_YEAR) throw new ReceiptError("CPR_YEAR_UNSUPPORTED", 400);
  const fingerprint = hash(JSON.stringify([environment, payload.type, staffId, actorUid, schoolYear,
    payload.type === "cpr" ? [payload.fields.completionDate, payload.fields.institution || ""] : [payload.fields.checkupDate, payload.fields.docType || ""],
    payload.fileMimeType, fileDigest, requestId]));
  return { submissionId: `${payload.type}-${fingerprint.slice(0, 32)}`, requestFingerprint: fingerprint, schoolYear,
    environment, staffId, actorUid, type: payload.type };
}
function matches(record, identity) {
  return record && ["submissionId", "requestFingerprint", "environment", "staffId", "actorUid", "type"]
    .every((key) => record[key] === identity[key]);
}
function proof(secret, identity, file, uploadToken) {
  const body = Buffer.from(JSON.stringify({ ...identity, file, uploadToken, expires: Date.now() + 86400000 })).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
function verifyProof(secret, token, identity) {
  try {
    if (typeof token !== "string" || token.length > 6000) throw 0;
    const [body, signature, extra] = token.split(".");
    const actual = Buffer.from(signature || "", "base64url"), expected = createHmac("sha256", secret).update(body).digest();
    if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw 0;
    const value = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!matches(value, identity) || value.expires < Date.now() || !value.file?.fileId) throw 0;
    return value;
  } catch { throw new ReceiptError("RECOVERY_PROOF_INVALID", 403); }
}
export function receiptResponse(identity, { saved = false, pending = false, code, retryable = false, recoveryToken,
  originalStatus = "submitted", duplicate = false, file } = {}) {
  return { status: saved ? "success" : "error", success: saved, submissionId: identity.submissionId,
    staffId: identity.staffId, receiptSaved: saved, statusSynced: saved && !pending, syncPending: pending,
    receiptState: saved ? pending ? "status_pending" : originalStatus : "retryable",
    duplicate, retryable, message: saved ? pending ? "접수는 완료됐으나 현황 반영 대기 중입니다. 같은 제출로 다시 확인해 주세요." : "제출이 접수되었습니다."
      : code === "UPLOAD_OUTCOME_UNKNOWN" ? "업로드 결과가 불명확합니다. 중복 방지를 위해 다시 업로드하지 않습니다. 보건실에 접수번호를 알려 주세요."
      : "접수 처리가 완료되지 않았습니다. 같은 제출로 다시 시도해 주세요.", ...(code ? { code } : {}), ...(recoveryToken ? { recoveryToken } : {}),
    ...(file?.fileId && identity.type === "tb" && identity.environment === "production" ? { fileId: file.fileId } : {}) };
}

// Firestore journal owns upload reservation; audit/original/status adapters retain
// their existing schemas. An unknown upload outcome is never automatically retried.
export async function runStaffReceipt({ db, context, identity, secret, recoveryToken, upload, findReceipt, saveReceipt,
  saveOriginal, syncStatus, readState, request }) {
  const policy = firebaseRuntimePolicy(context);
  const name = serverFirestoreResource(db, "receipts", context);
  if (policy.environment !== identity.environment) throw new ReceiptError("RESOURCE_ENV_MISMATCH", 503);
  const ref = db.collection(name).doc(identity.submissionId);
  let record = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists) {
      const value = snapshot.data();
      if (!matches(value, identity)) throw new ReceiptError("RECEIPT_CONFLICT");
      return value;
    }
    const value = { ...identity, ...(request ? { request } : {}), state: "reserved", uploadToken: randomUUID(), createdAt: new Date().toISOString() };
    tx.create(ref, value); return value;
  });
  const duplicate = record.state !== "reserved";
  let file = record.file;
  if (!file && recoveryToken) {
    const recovered = verifyProof(secret, recoveryToken, identity);
    if (recovered.uploadToken !== record.uploadToken) throw new ReceiptError("RECOVERY_PROOF_INVALID", 403);
    file = recovered.file;
  }
  let existingReceipt;
  try { existingReceipt = await findReceipt(); }
  catch (error) {
    if (error instanceof ReceiptError) throw error;
    const knownSaved = record.receiptSaved === true || record.synced === true;
    return { status: knownSaved ? 200 : 503, body: receiptResponse(identity, { saved: knownSaved,
      pending: true, retryable: true, code: "RECEIPT_STATE_CHECK_PENDING", duplicate }) };
  }
  if (record.synced) {
    try { return { status: 200, body: receiptResponse(identity, { saved: true, originalStatus: await readState(existingReceipt), duplicate: true, file }) }; }
    catch { return { status: 200, body: receiptResponse(identity, { saved: true, pending: true, retryable: true, code: "RECEIPT_SYNC_PENDING", duplicate: true, file }) }; }
  }
  if (!file && existingReceipt?.evidenceFiles?.[0]?.fileId) {
    file = { fileId: existingReceipt.evidenceFiles[0].fileId };
  }
  if (!file) {
    const owned = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref), value = snapshot.data();
      if (value.state !== "reserved") return value;
      tx.update(ref, { state: "uploading", uploadStartedAt: Date.now() }); return true;
    });
    if (owned !== true) {
      const unknown = owned.uploadOutcomeUnknown || Date.now() - Number(owned.uploadStartedAt || 0) > 120000;
      return { status: unknown ? 503 : 409, body: receiptResponse(identity, { code: unknown ? "UPLOAD_OUTCOME_UNKNOWN" : "UPLOAD_OUTCOME_PENDING", retryable: !unknown }) };
    }
    // No automatic lease takeover: GAS has no durable staff upload lookup.
    try {
      file = await upload(record.uploadToken);
      if (!file?.fileId) throw new Error("file missing");
    } catch {
      try { await ref.update({ uploadOutcomeUnknown: true }); } catch {}
      return { status: 503, body: receiptResponse(identity, { code: "UPLOAD_OUTCOME_UNKNOWN", retryable: false }) };
    }
  }
  const recovery = proof(secret, identity, file, record.uploadToken);
  try {
    if (!record.file) await ref.update({ file, state: "uploaded" });
  } catch {
    return { status: 503, body: receiptResponse(identity, { code: "UPLOAD_CHECKPOINT_PENDING", retryable: true, recoveryToken: recovery }) };
  }
  let saved;
  try { saved = existingReceipt || await saveReceipt(file); }
  catch {
    // A create acknowledgement can be lost after the actual commit.
    try { saved = await findReceipt(); } catch {}
    if (!saved) return { status: 503, body: receiptResponse(identity, { code: "RECEIPT_SAVE_PENDING", retryable: true, recoveryToken: recovery }) };
  }
  try { await ref.update({ receiptSaved: true }); } catch {}
  try {
    await saveOriginal(saved, file);
    if (!record.synced) await syncStatus(saved);
    await ref.update({ state: "recorded", receiptSaved: true, synced: true });
  } catch {
    return { status: 200, body: receiptResponse(identity, { saved: true, pending: true, retryable: true, code: "RECEIPT_SYNC_PENDING", duplicate, file }) };
  }
  let state;
  try { state = await readState(saved); }
  catch { return { status: 200, body: receiptResponse(identity, { saved: true, pending: true, retryable: true, code: "RECEIPT_SYNC_PENDING", duplicate, file }) }; }
  return { status: 200, body: receiptResponse(identity, { saved: true, originalStatus: state, duplicate, file }) };
}
