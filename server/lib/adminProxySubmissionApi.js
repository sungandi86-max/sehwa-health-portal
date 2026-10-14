import { proxySubmissionCollection } from "./adminProxySubmission.js";
import { verifyDirectoryAdmin } from "./staffDirectory.js";
import { trainingEnvironment } from "./trainingDeployment.js";
import { CURRENT_SCHOOL_YEAR } from "./staffDirectory.js";
import { healthScreeningTypeDocumentId, HEALTH_SCREENING_TYPE_COLLECTION, validHealthScreeningTypeRecord, unconfirmedScreeningType } from "./healthScreeningTypeStore.js";

export async function attachAnnualScreeningTypes(db, items, schoolYear = CURRENT_SCHOOL_YEAR) {
  const staffIds = [...new Set(items.map((item) => item.staffId).filter((id) => typeof id === "string" && id && !id.includes("/")))];
  if (!staffIds.length) return items;
  const snapshots = await db.getAll(...staffIds.map((staffId) => db.collection(HEALTH_SCREENING_TYPE_COLLECTION).doc(healthScreeningTypeDocumentId(staffId, schoolYear))));
  const byId = new Map(staffIds.map((staffId, index) => {
    const item = snapshots[index]?.exists ? snapshots[index].data() : null;
    return [staffId, validHealthScreeningTypeRecord(item, staffId, schoolYear) ? item : unconfirmedScreeningType(staffId, schoolYear)];
  }));
  return items.map((item) => ({ ...item, ...(byId.has(item.staffId) ? { annualHealthScreeningType: byId.get(item.staffId) } : {}) }));
}

function iso(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

function publicItem(doc, environment) {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    submittedAt: iso(data.submittedAt),
    updatedAt: iso(data.updatedAt),
    proxyRegisteredAt: iso(data.proxyRegisteredAt),
    sourceEnvironment: environment,
  };
}

export async function handleAdminProxySubmissionsResource(req, res, {
  verifyAdmin = verifyDirectoryAdmin,
  environment = trainingEnvironment,
  context = process.env,
  annualTypes = attachAnnualScreeningTypes,
} = {}) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });
  }
  const access = await verifyAdmin(req);
  if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });

  const deployment = environment(context);
  if (deployment !== "qa" && deployment !== "production") {
    return res.status(503).json({ ok: false, message: "제출 조회는 승인된 배포 환경에서만 가능합니다." });
  }
  const itemId = req.query?.itemId;
  if (itemId !== undefined && !["tb", "cpr", "recruit"].includes(itemId)) {
    return res.status(400).json({ ok: false, message: "지원하지 않는 제출 유형입니다." });
  }
  const collectionName = proxySubmissionCollection(deployment);
  let query = access.db.collection(collectionName);
  query = itemId ? query.where("itemId", "==", itemId) : query.orderBy("submittedAt", "desc");
  const snapshot = await query.limit(itemId ? 300 : 50).get();
  let items = snapshot.docs.map((doc) => publicItem(doc, deployment))
    .sort((left, right) => String(right.submittedAt || "").localeCompare(String(left.submittedAt || "")));
  // Annual types are QA-only; Production keeps its existing read contract.
  if (deployment === "qa") items = await annualTypes(access.db, items);
  return res.status(200).json({ ok: true, items });
}
