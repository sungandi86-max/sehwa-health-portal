import { verifyDirectoryAdmin } from "./staffDirectory.js";
import { tbCertificateSubmissionStore } from "./tbCertificateSubmissionStore.js";

function publicAdminItem(item) {
  return { submissionId: item.submissionId, staffId: item.staffId, candidateStaffId: item.candidateStaffId || "",
    submittedAt: item.submittedAt, checkupDate: item.checkupDate || item.legacyOriginal?.checkupDate || "",
    documentType: item.documentType || item.legacyOriginal?.documentType || "", source: item.source,
    status: item.status, matchStatus: item.matchStatus, identityConfirmed: item.identityConfirmed === true,
    evidenceStatus: item.evidenceStatus, manualReview: item.manualReview === true,
    manualReviewReasons: Array.isArray(item.manualReviewReasons) ? item.manualReviewReasons : [],
    evidenceMissing: item.evidenceMissing === true,
    evidenceFiles: (item.evidenceFiles || []).map((file) => ({ fileId: file.fileId, fileName: file.fileName,
      mimeType: file.mimeType, exists: file.exists === true, lookupStatus: file.lookupStatus })),
    migration: item.migration?.imported === true ? { imported: true, legacySource: item.migration.legacySource,
      sourceSheetName: item.migration.sourceSheetName, sourceRow: item.migration.sourceRow,
      manualMappingApproved: item.migration.manualMappingApproved === true,
      manualMappingBasis: item.migration.manualMappingBasis || "" } : { imported: false } };
}

export async function handleTbCertificateAuditResource(req, res, {
  verifyAdmin = verifyDirectoryAdmin, store = tbCertificateSubmissionStore,
} = {}) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });
  const access = await verifyAdmin(req);
  if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });
  const items = (await store.listRequests()).map(publicAdminItem);
  return res.status(200).json({ ok: true, environment: store.environment,
    summary: { total: items.length, canonical: items.filter((item) => !item.manualReview).length,
      manualReview: items.filter((item) => item.manualReview).length,
      evidenceMissing: items.filter((item) => item.evidenceMissing).length }, items });
}
