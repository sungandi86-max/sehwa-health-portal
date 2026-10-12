import { verifyDirectoryAdmin } from "./staffDirectory.js";
import { studentSubmissionAuditStore } from "./studentSubmissionAuditStore.js";

export async function handleStudentSubmissionAuditResource(req, res, {
  verifyAdmin = verifyDirectoryAdmin, store = studentSubmissionAuditStore,
} = {}) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });
  const access = await verifyAdmin(req);
  if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });
  if (!["qa", "production"].includes(store.environment)) {
    return res.status(403).json({ ok: false, message: "승인된 감사 원장 환경이 아닙니다." });
  }
  const records = await store.listRequests();
  return res.status(200).json({ ok: true, environment: store.environment, summary: {
    total: records.length, manualReview: records.filter((record) => record.manualReview).length,
  }, items: records.map((record) => ({
    submissionId: record.submissionId, submittedAt: record.submittedAt,
    submissionType: record.submissionType, source: record.source, status: record.status,
    signedPath: record.signedPath === true, legacy: record.legacy === true,
    matchStatus: record.matchStatus, manualReview: record.manualReview,
    originalRowNumber: record.originalRowNumber,
    evidence: (record.evidenceFiles || []).map((file) => ({
      fileId: file.fileId, mimeType: file.mimeType, lookupStatus: file.lookupStatus,
    })),
  })) });
}
