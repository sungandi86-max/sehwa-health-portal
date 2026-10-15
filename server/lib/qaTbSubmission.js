import { createHash, createHmac } from "node:crypto";
import { CURRENT_SCHOOL_YEAR } from "../../src/config/school.js";
import { validatedSchoolYear, evidenceRoute } from "../../src/lib/tbScreeningWorkflowModel.js";

const text = (value) => String(value ?? "").normalize("NFKC").trim();
export class QaTbSubmissionError extends Error {
  constructor(message, status = 503, identity = null) {
    super(message); this.status = status; this.identity = identity;
  }
}

export function qaTbSubmissionIdentity(input, secret) {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    throw new QaTbSubmissionError("제출 보안 설정이 필요합니다.");
  }
  const schoolYear = validatedSchoolYear(input.schoolYear);
  const evidenceSha256 = createHash("sha256").update(Buffer.from(input.fileBase64, "base64")).digest("hex");
  const metadata = Object.fromEntries(["checkupDate", "docType", "staffType"].map((key) => [key, text(input.fields?.[key])]));
  const requestFingerprint = createHmac("sha256", secret).update(JSON.stringify({ version: 1,
    staffId: text(input.staffId), actorStaffId: text(input.actorStaffId), schoolYear,
    submissionMode: input.submissionMode, evidenceSha256, mimeType: text(input.fileMimeType).toLowerCase(),
    metadata, proxyNote: text(input.proxyNote).slice(0, 500) })).digest("hex");
  return { submissionId: `QA-STAFF-TB-${requestFingerprint.slice(0, 32)}`, requestFingerprint, evidenceSha256 };
}

async function updateUploadRequest(db, identity, values) {
  const ref = db.collection("tb_upload_requests_qa").doc(identity.submissionId);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const existing = snapshot.exists ? snapshot.data() : null;
    if (existing && existing.requestFingerprint !== identity.requestFingerprint) {
      throw new QaTbSubmissionError("기존 QA 제출 식별자와 요청 내용이 일치하지 않습니다.", 409, identity);
    }
    if (!existing) tx.create(ref, { ...identity, ...values, environment: "qa" });
    else if (Object.keys(values).length) tx.set(ref, { ...existing, ...values });
    return existing;
  });
}

export async function receiveQaTbSubmission(input, { db, secret, folderId, uploadContract, upload,
  certificateStore, recordReceipt, now = new Date(), currentSchoolYear = CURRENT_SCHOOL_YEAR } = {}) {
  const schoolYear = validatedSchoolYear(input.schoolYear);
  if (schoolYear !== currentSchoolYear) throw new QaTbSubmissionError("현재 학년도 자료만 제출할 수 있습니다.", 400);
  if (uploadContract !== "qa-tb-idempotency-v1") {
    throw new QaTbSubmissionError("QA 결핵검진 업로드 복구 계약이 준비되지 않았습니다.");
  }
  if (!folderId || certificateStore.environment !== "qa") throw new QaTbSubmissionError("QA 결핵검진 저장소를 확인할 수 없습니다.");
  if (!input.staffId || !input.actorStaffId) throw new QaTbSubmissionError("교직원 제출 신원을 확인할 수 없습니다.", 403);
  const identity = qaTbSubmissionIdentity(input, secret);
  const timestamp = now.toISOString();
  const ref = db.collection("tb_upload_requests_qa").doc(identity.submissionId);
  const existing = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists) {
      const stored = snapshot.data();
      if (stored.requestFingerprint !== identity.requestFingerprint) {
        throw new QaTbSubmissionError("기존 QA 제출 식별자와 요청 내용이 일치하지 않습니다.", 409, identity);
      }
      return stored;
    }
    if (input.completedStatus === true) throw new QaTbSubmissionError("이미 결핵검진 완료가 확인되었습니다.", 409, identity);
    tx.create(ref, { ...identity, environment: "qa", schoolYear, staffId: input.staffId,
      actorStaffId: input.actorStaffId, submissionMode: input.submissionMode,
      metadata: { checkupDate: text(input.fields.checkupDate), documentType: text(input.fields.docType),
        staffType: text(input.fields.staffType), mimeType: input.fileMimeType,
        proxyNote: text(input.proxyNote).slice(0, 500) }, createdAt: timestamp });
    return null;
  });
  if (existing?.receipt) return existing.receipt;
  let file = existing?.uploadedFile;
  try {
    if (!file) {
      file = await upload(identity);
    }
    validateFile(file, identity, folderId);
    if (!existing?.uploadedFile) await updateUploadRequest(db, identity, { uploadedFile: file });
    const evidenceFile = { fileId: file.fileId, fileName: input.fileName, mimeType: input.fileMimeType, exists: true };
    await certificateStore.createRequest({ ...identity, staffId: input.staffId, schoolYear, submittedAt: now,
      checkupDate: input.fields.checkupDate, documentType: input.fields.docType, evidenceFile,
      evidenceRoute: evidenceRoute(input.fields.docType), submissionMode: input.submissionMode,
      subject: input.subject, submittedBy: input.actor, proxyNote: input.proxyNote });
    const submission = { ...identity, environment: "qa", schoolYear, type: "tb", itemId: "tb",
      staffId: input.staffId, subjectStaffId: input.staffId, subjectName: text(input.subject?.name),
      submittedByStaffId: input.actorStaffId, submittedByName: text(input.actor?.name),
      submissionMode: input.submissionMode, proxyNote: text(input.proxyNote).slice(0, 500),
      checkupDate: text(input.fields.checkupDate), documentType: text(input.fields.docType),
      evidenceRoute: evidenceRoute(input.fields.docType), fileId: file.fileId, evidenceFiles: [evidenceFile],
      file: { driveFileId: file.fileId, fileName: input.fileName, mimeType: input.fileMimeType },
      status: "submitted", submittedAt: timestamp, updatedAt: timestamp };
    await recordReceipt(db, submission);
    const receipt = { status: "success", success: true, submissionId: identity.submissionId,
      staffId: input.staffId, schoolYear, environment: "qa", fileId: file.fileId, submittedAt: timestamp };
    await updateUploadRequest(db, identity, { receipt });
    return receipt;
  } catch (error) {
    if (error instanceof QaTbSubmissionError) throw error;
    throw new QaTbSubmissionError("QA 접수를 완료하지 못했습니다. 같은 자료로 다시 시도해 주세요.", 503,
      { ...identity, ...(file?.fileId ? { fileId: file.fileId } : {}) });
  }
}

function validateFile(file, identity, folderId) {
  if (!file?.fileId || file.submissionId !== identity.submissionId ||
    file.requestFingerprint !== identity.requestFingerprint || file.folderId !== folderId || file.private !== true) {
    throw new QaTbSubmissionError("QA 비공개 증빙 파일 응답을 확인할 수 없습니다.", 502, identity);
  }
}
