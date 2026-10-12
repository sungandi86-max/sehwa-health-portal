import { createHash, randomUUID } from "node:crypto";
import { getFirebaseAdminDb } from "./firebaseAdmin.js";
import { submissionEnvironment } from "./submissionConfig.js";

export const STUDENT_SUBMISSION_AUDIT_COLLECTIONS = Object.freeze({
  qa: "student_submission_audit_qa",
  production: "student_submission_audit_production",
});

const SOURCE_SHEET = "제출기록";
const SOURCE_SHEET_ID = 310103;
const text = (value) => String(value ?? "").trim();
const fingerprint = (parts) => createHash("sha256").update(JSON.stringify(parts), "utf8").digest("hex");

export function studentEvidenceIdFromUrl(url) {
  const match = text(url).match(/^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)\//);
  return match?.[1] || "";
}

export function buildLegacyStudentSubmissionRecord({ rowNumber, headers, values, environment,
  evidence = {}, now = new Date() }) {
  if (!STUDENT_SUBMISSION_AUDIT_COLLECTIONS[environment] || !Number.isInteger(rowNumber) || rowNumber < 2 ||
    !Array.isArray(headers) || !Array.isArray(values) || headers[0] !== "제출일시") {
    throw new Error("제출기록 원본 행 또는 환경이 올바르지 않습니다.");
  }
  const original = Object.fromEntries(headers.map((header, index) => [header, text(values[index])]));
  const originalRowFingerprint = fingerprint([SOURCE_SHEET_ID, rowNumber, headers.map((header) => original[header])]);
  const explicitFileId = original["파일ID"];
  const urlFileId = studentEvidenceIdFromUrl(original["파일URL"]);
  const fileId = explicitFileId || urlFileId;
  const signedPath = original["구분"] === "student_tb_reply" && Boolean(original["제출ID"]);
  const hasStudentFields = ["학년", "반", "번호", "학생명"].every((header) => Boolean(original[header]));
  const matchStatus = hasStudentFields ? "unmatched" : "incomplete";
  const reasons = ["canonical_student_identity_unavailable"];
  if (!hasStudentFields) reasons.push("student_fields_incomplete");
  if (!fileId || evidence.exists !== true) reasons.push("evidence_unverified");
  if (explicitFileId && urlFileId && explicitFileId !== urlFileId) reasons.push("evidence_id_mismatch");
  const createdAt = now.toISOString();
  return {
    submissionId: `legacy-student-reply-${rowNumber}-${originalRowFingerprint.slice(0, 16)}`,
    canonicalStudentKey: null,
    studentIdentity: { grade: original["학년"], classNumber: original["반"],
      studentNumber: original["번호"], name: original["학생명"] || original["성명"] },
    submissionType: signedPath ? "student_tb_reply" : original["제출유형"] || "student-file",
    submittedAt: original["제출일시"], source: signedPath ? "signed_sheet_migration" : "legacy_sheet_migration",
    environment, originalRowNumber: rowNumber, originalRowFingerprint,
    originalSubmissionId: original["제출ID"] || null,
    originalFields: Object.fromEntries(Object.entries(original).filter(([, value]) => value !== "")),
    evidenceFiles: [{ fileId, originalUrl: original["파일URL"], fileName: original["파일명"],
      mimeType: original["파일MIME"] || text(evidence.mimeType), exists: evidence.exists === true,
      lookupStatus: evidence.exists === true ? "metadata_found" : "unverified" }],
    matchStatus, manualReview: true, manualReviewReasons: reasons, status: "manual_review", schemaVersion: 1,
    migration: { imported: true, sourceSheet: SOURCE_SHEET, sourceSheetId: SOURCE_SHEET_ID, sourceRow: rowNumber,
      importedAt: createdAt }, createdAt, updatedAt: createdAt,
  };
}

export function planLegacyStudentSubmissionMigration({ rows, existing = [], environment, now = new Date() }) {
  const byId = new Map(existing.map((record) => [record.submissionId, record]));
  const result = { canonicalCreate: 0, manualReview: 0, skip: 0, conflict: 0, records: [], conflicts: [] };
  const seenEvidence = new Set();
  for (const row of rows) {
    const record = buildLegacyStudentSubmissionRecord({ ...row, environment, now });
    const fileId = record.evidenceFiles[0].fileId;
    const current = byId.get(record.submissionId);
    if (fileId && seenEvidence.has(fileId)) {
      result.conflict += 1;
      result.conflicts.push({ rowNumber: row.rowNumber, code: "duplicate_evidence_file" });
      continue;
    }
    if (fileId) seenEvidence.add(fileId);
    if (current) {
      if (current.environment === environment && current.originalRowFingerprint === record.originalRowFingerprint &&
        current.migration?.sourceRow === row.rowNumber) result.skip += 1;
      else { result.conflict += 1; result.conflicts.push({ rowNumber: row.rowNumber, code: "existing_record_conflict" }); }
      continue;
    }
    result.records.push(record);
    if (record.manualReview) result.manualReview += 1;
    else result.canonicalCreate += 1;
  }
  return result;
}

export class StudentSubmissionAuditStore {
  constructor({ database = getFirebaseAdminDb, context = () => process.env, id = randomUUID } = {}) {
    this.database = database; this.context = context; this.id = id;
  }
  get environment() { return submissionEnvironment(this.context()); }
  get collectionName() { return STUDENT_SUBMISSION_AUDIT_COLLECTIONS[this.environment]; }
  assertQa() { if (this.environment !== "qa") throw new Error("QA 감사 원장에만 기록할 수 있습니다."); }
  async createQaRequest({ requestId, fields, evidenceFile, now = new Date() }) {
    this.assertQa();
    const studentName = text(fields?.studentName);
    if (studentName !== "[QA] synthetic" || !["grade", "classNumber", "studentNumber"].every((key) => text(fields?.[key])) ||
      !text(requestId) || !text(evidenceFile?.fileId) || !text(evidenceFile?.fileName).includes("QA")) {
      throw new Error("QA 합성 제출 필수값이 없습니다.");
    }
    const submittedAt = now.toISOString();
    const record = { submissionId: requestId, canonicalStudentKey: null,
      studentIdentity: { grade: text(fields.grade), classNumber: text(fields.classNumber),
        studentNumber: text(fields.studentNumber), name: studentName },
      submissionType: "student_tb_reply", submittedAt, source: "qa_signed_submission", environment: "qa",
      originalRowNumber: null, originalRowFingerprint: null, originalSubmissionId: null, originalFields: {},
      evidenceFiles: [{ fileId: text(evidenceFile.fileId), originalUrl: "", fileName: text(evidenceFile.fileName),
        mimeType: text(evidenceFile.mimeType), exists: true, lookupStatus: "uploaded_private" }],
      matchStatus: "synthetic", manualReview: false, manualReviewReasons: [], status: "received", schemaVersion: 1,
      migration: { imported: false }, createdAt: submittedAt, updatedAt: submittedAt };
    await this.database().collection(this.collectionName).doc(requestId).create(record);
    return record;
  }
  async createQaFixture({ pattern, evidenceFile, now = new Date() }) {
    this.assertQa();
    if (!["signed", "legacy_manual_review"].includes(pattern) ||
      !text(evidenceFile?.fileId).startsWith("QA-") || !text(evidenceFile?.fileName).includes("QA")) {
      throw new Error("개인정보 없는 QA fixture만 허용됩니다.");
    }
    const submissionId = this.id();
    const submittedAt = now.toISOString();
    const record = { submissionId, canonicalStudentKey: null, studentIdentity: { grade: "QA", classNumber: "QA",
      studentNumber: "QA", name: "[QA] synthetic" }, submissionType: "student_tb_reply", submittedAt,
      source: pattern === "signed" ? "qa_signed_fixture" : "qa_legacy_fixture", environment: "qa",
      originalRowNumber: null, originalRowFingerprint: null, originalSubmissionId: null, originalFields: {},
      evidenceFiles: [{ fileId: evidenceFile.fileId, originalUrl: "", fileName: evidenceFile.fileName,
        mimeType: evidenceFile.mimeType || "application/pdf", exists: false, lookupStatus: "synthetic_metadata_only" }],
      matchStatus: pattern === "signed" ? "synthetic" : "unmatched", manualReview: pattern !== "signed",
      manualReviewReasons: pattern === "signed" ? [] : ["canonical_student_identity_unavailable"],
      status: pattern === "signed" ? "received" : "manual_review", schemaVersion: 1,
      migration: { imported: false }, createdAt: submittedAt, updatedAt: submittedAt };
    await this.database().collection(this.collectionName).doc(submissionId).create(record);
    return record;
  }
  async listQaRequests() {
    this.assertQa();
    const snapshot = await this.database().collection(this.collectionName).get();
    return snapshot.docs.map((doc) => {
      const record = doc.data();
      if (record.submissionId !== doc.id || record.environment !== "qa") throw new Error("QA 감사 원장 출처가 올바르지 않습니다.");
      return record;
    });
  }
}

export const studentSubmissionAuditStore = new StudentSubmissionAuditStore();
