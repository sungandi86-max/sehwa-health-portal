import { verifyDirectoryAdmin } from "./staffDirectory.js";
import { tbRegistrationRequestStore } from "./tbRegistrationRequestStore.js";

function publicAdminItem(item) {
  return {
    requestId: item.requestId,
    staffId: item.staffId || null,
    candidateStaffId: item.candidateStaffId || null,
    submittedAt: item.submittedAt || "",
    selectedType: item.selectedType || "",
    source: item.source,
    status: item.status,
    manualReview: item.manualReview === true,
    legacyOriginal: item.manualReview === true ? item.legacyOriginal : undefined,
    migration: item.migration?.imported === true ? {
      imported: true,
      legacySource: item.migration.legacySource,
      sourceSheetName: item.migration.sourceSheetName,
      sourceRow: item.migration.sourceRow,
    } : { imported: false },
  };
}

export async function handleTbRegistrationAuditResource(req, res, {
  verifyAdmin = verifyDirectoryAdmin,
  store = tbRegistrationRequestStore,
} = {}) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });
  const access = await verifyAdmin(req);
  if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });
  const records = await store.listRequests();
  const items = records.map(publicAdminItem);
  return res.status(200).json({
    ok: true,
    environment: store.environment,
    summary: {
      total: items.length,
      canonical: items.filter((item) => item.staffId && !item.manualReview).length,
      manualReview: items.filter((item) => item.manualReview).length,
    },
    items,
  });
}
