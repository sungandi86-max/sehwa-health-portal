import { createHash, randomUUID } from "node:crypto";
import { getFirebaseAdminDb } from "./firebaseAdmin.js";
import { submissionEnvironment } from "./submissionConfig.js";

const COLLECTIONS = Object.freeze({ qa: "tb_certificate_submissions_qa", production: "tb_certificate_submissions_production" });
const text = (value) => String(value ?? "").normalize("NFKC").trim();
const fingerprint = (parts) => createHash("sha256").update(parts.map(text).join("\u001f"), "utf8").digest("hex");
const legacyId = (sourceRow, rowFingerprint) => `legacy-tb-certificate-${sourceRow}-${rowFingerprint.slice(0, 16)}`;

function normalizeEvidenceFile(file) {
  return { fileId: text(file?.fileId), originalUrl: text(file?.originalUrl), fileName: text(file?.fileName),
    mimeType: text(file?.mimeType), exists: file?.exists === true,
    lookupStatus: text(file?.lookupStatus) || (file?.exists === true ? "FOUND" : "NOT_FOUND") };
}

export function buildLegacyTbCertificateRecord({ environment, sourceRow, original, staffId = "",
  candidateStaffId = "", matchStatus, mappingApproval = null, evidenceFiles = [], now = new Date() }) {
  if (!Number.isInteger(sourceRow) || sourceRow < 2) throw new Error("legacy source row가 올바르지 않습니다.");
  const legacyOriginal = { submittedAt: text(original?.submittedAt), name: text(original?.name),
    department: text(original?.department), staffType: text(original?.staffType), checkupDate: text(original?.checkupDate),
    documentType: text(original?.documentType), fileName: text(original?.fileName), fileUrl: text(original?.fileUrl) };
  const rowFingerprint = fingerprint([sourceRow, ...Object.values(legacyOriginal)]);
  const evidence = evidenceFiles.map(normalizeEvidenceFile);
  const evidenceMissing = evidence.length === 0 || evidence.some((file) => !file.fileId || !file.exists);
  const canonicalStaffId = text(staffId);
  const normalizedMatchStatus = text(matchStatus);
  const identityConfirmed = Boolean(canonicalStaffId) && ["matched", "manually_approved"].includes(normalizedMatchStatus);
  const evidenceStatus = evidenceMissing ? "missing" : "verified";
  const manualReviewReasons = [];
  if (!identityConfirmed) manualReviewReasons.push("identity_unresolved");
  if (evidenceMissing) manualReviewReasons.push("evidence_missing");
  const manualReview = manualReviewReasons.length > 0;
  const timestamp = now.toISOString();
  return {
    submissionId: legacyId(sourceRow, rowFingerprint), staffId: canonicalStaffId,
    candidateStaffId: canonicalStaffId ? "" : text(candidateStaffId), submittedAt: legacyOriginal.submittedAt,
    source: "legacy_sheet_migration", environment, originalRowNumber: sourceRow,
    originalRowFingerprint: rowFingerprint, legacyOriginal, evidenceFiles: evidence,
    evidenceMissing, evidenceStatus, manualReview, manualReviewReasons,
    matchStatus: normalizedMatchStatus, identityConfirmed, status: manualReview ? "manual_review" : "received",
    migration: { imported: true, legacySource: "staff_tb_certificate_sheet_2026", legacyImportedAt: timestamp,
      sourceSheetName: "응답_결핵검진확인증", sourceRow,
      manualMappingApproved: normalizedMatchStatus === "manually_approved",
      manualMappingBasis: normalizedMatchStatus === "manually_approved" ? text(mappingApproval?.basis) : "" },
    schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
  };
}

export function planLegacyTbCertificateMigration({ environment, rows, existing = [], now = new Date() }) {
  const existingById = new Map(existing.map((item) => [item.submissionId, item]));
  const result = { canonicalCreate: 0, manualReview: 0, identityConfirmedEvidenceMissing: 0,
    identityUnresolvedEvidenceMissing: 0, skip: 0, conflict: 0, records: [], conflicts: [] };
  for (const row of rows) {
    const record = buildLegacyTbCertificateRecord({ environment, now, ...row });
    const current = existingById.get(record.submissionId);
    if (current) {
      if (current.originalRowFingerprint === record.originalRowFingerprint && current.environment === environment) result.skip += 1;
      else { result.conflict += 1; result.conflicts.push({ sourceRow: record.originalRowNumber, code: "existing_record_conflict" }); }
      continue;
    }
    result.records.push(record);
    if (record.manualReview) result.manualReview += 1;
    else result.canonicalCreate += 1;
    if (record.identityConfirmed && record.evidenceMissing) result.identityConfirmedEvidenceMissing += 1;
    if (!record.identityConfirmed && record.evidenceMissing) result.identityUnresolvedEvidenceMissing += 1;
  }
  return result;
}

export class TbCertificateSubmissionStore {
  constructor({ database = getFirebaseAdminDb, context = () => process.env, submissionId = randomUUID } = {}) {
    this.database = database; this.context = context; this.submissionId = submissionId;
  }
  get environment() { return submissionEnvironment(this.context()); }
  get collectionName() { return COLLECTIONS[this.environment]; }
  async createRequest({ staffId, submittedAt = new Date(), checkupDate, documentType, evidenceFile,
    submissionMode = "self", subject = null, submittedBy = null, proxyNote = "" }) {
    const canonicalStaffId = text(staffId);
    const file = normalizeEvidenceFile({ ...evidenceFile, exists: true });
    if (!canonicalStaffId || !text(checkupDate) || !file.fileId || !file.fileName || !file.mimeType) {
      throw new Error("결핵검진 확인증 감사 원장 필수값이 없습니다.");
    }
    const id = this.submissionId();
    const timestamp = submittedAt instanceof Date ? submittedAt.toISOString() : text(submittedAt);
    const request = { submissionId: id, staffId: canonicalStaffId, candidateStaffId: "", submittedAt: timestamp,
      checkupDate: text(checkupDate), documentType: text(documentType), source: "portal", environment: this.environment,
      originalRowNumber: null, originalRowFingerprint: fingerprint([canonicalStaffId, timestamp, checkupDate, file.fileId]),
      evidenceFiles: [file], evidenceMissing: false, manualReview: false, matchStatus: "matched", status: "received",
      evidenceStatus: "verified", manualReviewReasons: [], identityConfirmed: true,
      submissionMode, subjectStaffId: subject?.staffId || canonicalStaffId, subjectName: text(subject?.name),
      submittedByStaffId: text(submittedBy?.staffId), submittedByName: text(submittedBy?.name),
      proxyNote: text(proxyNote).slice(0, 500), proxyRegisteredAt: submissionMode === "admin_proxy" ? timestamp : "",
      migration: { imported: false }, schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp };
    await this.database().collection(this.collectionName).doc(id).create(request);
    return request;
  }
  async listRequests() {
    const snapshot = await this.database().collection(this.collectionName).get();
    return snapshot.docs.map((doc) => this.readDocument(doc)).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }
  readDocument(snapshot) {
    const request = snapshot.data();
    if (request.submissionId !== snapshot.id || request.environment !== this.environment) {
      throw new Error("결핵검진 확인증 감사 원장의 환경·문서 ID가 일치하지 않습니다.");
    }
    return request;
  }
}

export const tbCertificateSubmissionStore = new TbCertificateSubmissionStore();
