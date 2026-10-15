import { proxySubmissionCollection } from "./adminProxySubmission.js";
import { verifyDirectoryAdmin } from "./staffDirectory.js";
import { trainingEnvironment } from "./trainingDeployment.js";
import { CURRENT_SCHOOL_YEAR } from "./staffDirectory.js";
import { healthScreeningTypeDocumentId, HEALTH_SCREENING_TYPE_COLLECTION, validHealthScreeningTypeRecord, unconfirmedScreeningType } from "./healthScreeningTypeStore.js";
import { verifyCurrentStaffSubmissionIdentity } from "./tbSubmissionGuard.js";
import { validatedSchoolYear, tbWorkflowTaskId, joinTbScreeningWorkflow } from "../../src/lib/tbScreeningWorkflowModel.js";
import { FieldPath } from "firebase-admin/firestore";

export async function attachQaTbWorkflows(db, items, schoolYear, evidenceComplete = true) {
  const enriched = await attachAnnualScreeningTypes(db, items, schoolYear);
  const staffIds = [...new Set(items.map((item) => item.staffId).filter((id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(id)))];
  if (!staffIds.length) return enriched;
  const snapshots = await db.getAll(...staffIds.map((id) => db.collection("staff_submission_status_qa").doc(`${id}_${tbWorkflowTaskId(schoolYear)}`)));
  const statuses = new Map(staffIds.map((id, index) => {
    const item = snapshots[index]?.exists ? snapshots[index].data() : null;
    return [id, item?.environment === "qa" && item.staffId === id && item.schoolYear === schoolYear && item.taskId === tbWorkflowTaskId(schoolYear) ? item : null];
  }));
  return enriched.map((item) => item.type === "tb" && item.schoolYear === schoolYear && statuses.has(item.staffId)
    ? { ...item, workflow: joinTbScreeningWorkflow({ staffId: item.staffId, schoolYear,
      route: item.annualHealthScreeningType, evidence: items.filter((evidence) => evidence.staffId === item.staffId
        && evidence.type === "tb" && evidence.schoolYear === schoolYear && evidence.submissionId === evidence.id),
      status: statuses.get(item.staffId), evidenceComplete }) } : item);
}

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
  qaIdentity = verifyCurrentStaffSubmissionIdentity,
  workflows = attachQaTbWorkflows,
} = {}) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });
  }
  const deployment = environment(context);
  if (deployment !== "qa" && deployment !== "production") {
    return res.status(503).json({ ok: false, message: "제출 조회는 승인된 배포 환경에서만 가능합니다." });
  }
  let schoolYear = null;
  const yearScoped = deployment === "qa" && (req.query?.itemId === "tb" || (req.query?.itemId === undefined && req.query?.schoolYear !== undefined));
  if (yearScoped) {
    try { schoolYear = validatedSchoolYear(req.query?.schoolYear); }
    catch { return res.status(400).json({ ok: false, message: "학년도를 명시해 주세요." }); }
  }
  const access = deployment === "qa" ? await qaIdentity(req, { context, workflowEnvironment: "qa", schoolYear: schoolYear ?? CURRENT_SCHOOL_YEAR }) : await verifyAdmin(req);
  if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });
  if (deployment === "qa" && !access.roles?.some((role) => ["health_teacher", "admin"].includes(role))) return res.status(403).json({ ok: false, message: "관리 권한이 필요합니다." });
  const itemId = req.query?.itemId;
  if (itemId !== undefined && !["tb", "cpr", "recruit"].includes(itemId)) {
    return res.status(400).json({ ok: false, message: "지원하지 않는 제출 유형입니다." });
  }
  const collectionName = proxySubmissionCollection(deployment);
  let query = access.db.collection(collectionName);
  if (yearScoped) {
    const cursor = req.query?.cursor || "";
    if (typeof cursor !== "string" || (cursor && !/^[A-Za-z0-9_-]{1,200}$/.test(cursor))) return res.status(400).json({ ok: false, message: "조회 범위를 확인해 주세요." });
    query = query.where("schoolYear", "==", schoolYear).orderBy(FieldPath.documentId());
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.limit(100).get();
    const complete = snapshot.docs.length < 100;
    const items = snapshot.docs.map((doc) => publicItem(doc, deployment)).filter((item) => item.schoolYear === schoolYear
      && item.environment === "qa" && (!itemId || item.itemId === itemId));
    return res.status(200).json({ ok: true, items: await workflows(access.db, items, schoolYear, complete),
      datasets: { completeness: { evidence: complete, statuses: true }, cursors: { evidence: complete ? null : snapshot.docs.at(-1).id, statuses: null } } });
  }
  query = itemId ? query.where("itemId", "==", itemId) : query.orderBy("submittedAt", "desc");
  const snapshot = await query.limit(itemId ? 300 : 50).get();
  let items = snapshot.docs.map((doc) => publicItem(doc, deployment))
    .sort((left, right) => String(right.submittedAt || "").localeCompare(String(left.submittedAt || "")));
  // Annual types are QA-only; Production keeps its existing read contract.
  if (deployment === "qa") items = await annualTypes(access.db, items);
  return res.status(200).json({ ok: true, items });
}
