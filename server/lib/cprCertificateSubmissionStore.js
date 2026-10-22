import { createHash, randomUUID } from "node:crypto";
import { getFirebaseAdminDb } from "./firebaseAdmin.js";
import { submissionEnvironment } from "./submissionConfig.js";

const COLLECTIONS = Object.freeze({ qa: "cpr_certificate_submissions_qa", production: "cpr_certificate_submissions_production" });
const text = (value) => String(value ?? "").normalize("NFKC").trim();
const fingerprint = (parts) => createHash("sha256").update(parts.map(text).join("\u001f"), "utf8").digest("hex");
const legacySubmissionId = (sourceRow, rowFingerprint) => `legacy-cpr-certificate-${sourceRow}-${rowFingerprint.slice(0, 16)}`;

function normalizeEvidenceFile(file) {
  return { fileId: text(file?.fileId), originalUrl: text(file?.originalUrl), fileName: text(file?.fileName),
    mimeType: text(file?.mimeType), exists: file?.exists === true,
    lookupStatus: text(file?.lookupStatus) || (file?.exists === true ? "FOUND" : "NOT_FOUND") };
}

export function buildLegacyCprCertificateRecord({ environment, sourceRow, original, staffId,
  evidenceFiles = [], complete = true, now = new Date() }) {
  if (!Number.isInteger(sourceRow) || sourceRow < 2) throw new Error("legacy source row가 올바르지 않습니다.");
  const canonicalStaffId = text(staffId);
  if (!canonicalStaffId) throw new Error("legacy CPR 제출에는 canonical staffId가 필요합니다.");
  const legacyOriginal = { submittedAt: text(original?.submittedAt), name: text(original?.name),
    department: text(original?.department), staffType: text(original?.staffType), completionDate: text(original?.completionDate),
    institution: text(original?.institution), fileName: text(original?.fileName), fileUrl: text(original?.fileUrl) };
  const rowFingerprint = fingerprint([sourceRow, ...Object.values(legacyOriginal)]);
  const normalizedEvidence = evidenceFiles.map(normalizeEvidenceFile);
  const evidenceMissing = normalizedEvidence.length === 0 || normalizedEvidence.some((file) => !file.fileId || !file.exists);
  const manualReview = !complete || evidenceMissing;
  const timestamp = now.toISOString();
  return {
    submissionId: legacySubmissionId(sourceRow, rowFingerprint), staffId: canonicalStaffId,
    submittedAt: legacyOriginal.submittedAt, source: "legacy_sheet_migration", environment,
    originalRowNumber: sourceRow, originalRowFingerprint: rowFingerprint, legacyOriginal,
    evidenceFiles: normalizedEvidence, evidenceMissing, manualReview,
    status: manualReview ? "manual_review" : "received",
    migration: { imported: true, legacySource: "staff_cpr_certificate_sheet_2026", legacyImportedAt: timestamp,
      sourceSheetName: "응답_심폐소생술이수증", sourceRow },
    schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
  };
}

export function planLegacyCprCertificateMigration({ environment, rows, existing = [], now = new Date() }) {
  const existingById = new Map(existing.map((item) => [item.submissionId, item]));
  const result = { create: 0, skip: 0, conflict: 0, manualReview: 0, records: [], conflicts: [] };
  for (const row of rows) {
    const record = buildLegacyCprCertificateRecord({ environment, now, ...row });
    const current = existingById.get(record.submissionId);
    if (current) {
      if (current.originalRowFingerprint === record.originalRowFingerprint && current.environment === environment) result.skip += 1;
      else { result.conflict += 1; result.conflicts.push({ sourceRow: record.originalRowNumber, code: "existing_record_conflict" }); }
      continue;
    }
    result.records.push(record);
    if (record.manualReview) result.manualReview += 1;
    else result.create += 1;
  }
  return result;
}

export class CprCertificateSubmissionStore {
  constructor({ database = getFirebaseAdminDb, context = () => process.env, submissionId = randomUUID } = {}) {
    this.database = database; this.context = context; this.submissionId = submissionId;
  }
  get environment() { return submissionEnvironment(this.context()); }
  get collectionName() { return COLLECTIONS[this.environment]; }
  async createRequest({ staffId, submittedAt = new Date(), completionDate, institution, evidenceFile, submissionId, requestFingerprint }) {
    const canonicalStaffId = text(staffId);
    const file = normalizeEvidenceFile({ ...evidenceFile, exists: true });
    if (!canonicalStaffId || !text(completionDate) || !file.fileId || !file.fileName || !file.mimeType) {
      throw new Error("CPR 이수증 감사 원장 필수값이 없습니다.");
    }
    const id = submissionId || this.submissionId();
    const timestamp = submittedAt instanceof Date ? submittedAt.toISOString() : text(submittedAt);
    const request = { submissionId: id, staffId: canonicalStaffId, submittedAt: timestamp,
      completionDate: text(completionDate), institution: text(institution), source: "portal", environment: this.environment,
      ...(requestFingerprint ? { requestFingerprint } : {}),
      originalRowNumber: null, originalRowFingerprint: fingerprint([canonicalStaffId, timestamp, completionDate, file.fileId]),
      evidenceFiles: [file], evidenceMissing: false, manualReview: false, status: "received",
      migration: { imported: false }, schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp };
    const ref = this.database().collection(this.collectionName).doc(id);
    try { await ref.create(request); }
    catch (error) {
      if (![6, "already-exists"].includes(error.code) || !requestFingerprint) throw error;
      const existing = this.readDocument(await ref.get());
      if (existing.staffId !== canonicalStaffId || existing.requestFingerprint !== requestFingerprint ||
          existing.evidenceFiles?.[0]?.fileId !== file.fileId) throw new Error("CPR 접수 재시도 내용이 일치하지 않습니다.");
      return existing;
    }
    return request;
  }
  async getRequest(submissionId) {
    const snapshot = await this.database().collection(this.collectionName).doc(text(submissionId)).get();
    return snapshot.exists ? this.readDocument(snapshot) : null;
  }
  async listRequests() {
    const snapshot = await this.database().collection(this.collectionName).get();
    return snapshot.docs.map((doc) => this.readDocument(doc)).sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
  }
  readDocument(snapshot) {
    const request = snapshot.data();
    if (request.submissionId !== snapshot.id || request.environment !== this.environment) {
      throw new Error("CPR 이수증 감사 원장의 환경·문서 ID가 일치하지 않습니다.");
    }
    return request;
  }
}

export const cprCertificateSubmissionStore = new CprCertificateSubmissionStore();
