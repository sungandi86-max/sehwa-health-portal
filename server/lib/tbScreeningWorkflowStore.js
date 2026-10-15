import { FieldPath } from "firebase-admin/firestore";
import { trainingEnvironment } from "./trainingDeployment.js";
import { validateScreeningYear, validHealthScreeningTypeRecord } from "./healthScreeningTypeStore.js";
import { tbWorkflowTaskId } from "../../src/lib/tbScreeningWorkflowModel.js";
import { buildQaTbCertificateReceiptStatus, saveTbScreeningStatus } from "./tbScreeningStatus.js";

export class TbWorkflowError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const identifier = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value);
const taskId = tbWorkflowTaskId;
const fileId = (item) => item.fileId || item.evidenceFiles?.[0]?.fileId;
function qa(context) {
  if (trainingEnvironment(context) !== "qa") throw new TbWorkflowError("QA 환경이 필요합니다.", 503);
}
function refs(db, staffId, year) {
  if (!identifier(staffId)) throw new TbWorkflowError("교직원 정보를 확인해 주세요.");
  return db.collection("staff_submission_status_qa").doc(`${staffId}_${taskId(year)}`);
}
function validEvidence(item, year) {
  return item?.environment === "qa" && item.schoolYear === year && item.type === "tb"
    && identifier(item.staffId) && item.subjectStaffId === item.staffId && identifier(item.submissionId)
    && identifier(fileId(item));
}
export async function recordQaTbReceipt(db, submission, { context = process.env } = {}) {
  qa(context);
  const year = validateScreeningYear(submission.schoolYear);
  if (!validEvidence(submission, year)) throw new TbWorkflowError("확인 자료 정보를 확인해 주세요.");
  const evidenceRef = db.collection("staff_submissions_qa").doc(submission.submissionId);
  const statusRef = refs(db, submission.staffId, year);
  return db.runTransaction(async (transaction) => {
    const [evidence, status] = await Promise.all([transaction.get(evidenceRef), transaction.get(statusRef)]);
    if (evidence.exists) {
      const existing = evidence.data();
      if (existing.staffId !== submission.staffId || existing.schoolYear !== year || fileId(existing) !== fileId(submission)
        || existing.requestFingerprint !== submission.requestFingerprint) {
        throw new TbWorkflowError("같은 제출 번호에 다른 자료가 있습니다.", 409);
      }
      return existing;
    }
    const item = { ...submission, fileId: fileId(submission), status: "pending", reviewState: "pending", revision: 1 };
    transaction.create(evidenceRef, item);
    const current = status.exists ? status.data() : {};
    if (current.status !== "completed") await saveTbScreeningStatus({ db,
      payload: buildQaTbCertificateReceiptStatus({ submission, current }), collectionName: "staff_submission_status_qa",
      qaWorkflow: true, schoolYear: year, transaction, currentSnapshot: status });
    return item;
  });
}

export async function listQaTbWorkflowData(db, { schoolYear, staffId, cursor = "", evidenceCursor = cursor, statusCursor = "", limit = 100 }, { context = process.env } = {}) {
  qa(context);
  const year = validateScreeningYear(schoolYear);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || [evidenceCursor, statusCursor].some((value) => value && !identifier(value))) throw new TbWorkflowError("조회 범위를 확인해 주세요.");
  let evidenceQuery = db.collection("staff_submissions_qa").where("schoolYear", "==", year);
  let statusQuery = db.collection("staff_submission_status_qa").where("schoolYear", "==", year);
  if (staffId) {
    refs(db, staffId, year);
    evidenceQuery = evidenceQuery.where("staffId", "==", staffId);
    statusQuery = statusQuery.where("staffId", "==", staffId);
  }
  const page = (query, after) => {
    const ordered = query.orderBy(FieldPath.documentId());
    return (after ? ordered.startAfter(after) : ordered).limit(limit).get();
  };
  const [evidence, statuses] = await Promise.all([page(evidenceQuery, evidenceCursor), page(statusQuery, statusCursor)]);
  return {
    evidence: evidence.docs.filter((doc) => doc.data()?.submissionId === doc.id).map((doc) => doc.data()).filter((item) => validEvidence(item, year)),
    statuses: statuses.docs.map((doc) => doc.data()).filter((item) => item.schoolYear === year && item.taskId === taskId(year) && item.environment === "qa"),
    completeness: { evidence: evidence.docs.length < limit, statuses: statuses.docs.length < limit },
    cursors: { evidence: evidence.docs.length === limit ? evidence.docs.at(-1).id : null, statuses: statuses.docs.length === limit ? statuses.docs.at(-1).id : null },
  };
}

export async function reviewQaTbEvidence(db, input, { context = process.env, verifyEvidenceFile, now = () => new Date().toISOString() } = {}) {
  qa(context);
  const year = validateScreeningYear(input.schoolYear);
  if (!identifier(input.submissionId) || !identifier(input.actor) || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0
    || !["confirm", "invalidate"].includes(input.action)) throw new TbWorkflowError("확인 요청을 확인해 주세요.");
  const evidenceRef = db.collection("staff_submissions_qa").doc(input.submissionId);
  const preliminary = await evidenceRef.get();
  const candidate = preliminary.exists ? preliminary.data() : null;
  if (!validEvidence(candidate, year) || candidate.submissionId !== input.submissionId) throw new TbWorkflowError("해당 학년도 확인 자료를 찾지 못했습니다.", 404);
  if (input.action === "confirm") {
    if (typeof verifyEvidenceFile !== "function") throw new TbWorkflowError("확인 자료 접근을 확인하지 못했습니다.", 503);
    if (await verifyEvidenceFile(fileId(candidate)) !== true) throw new TbWorkflowError("확인 자료 접근을 확인하지 못했습니다.", 503);
  }
  const statusRef = refs(db, candidate.staffId, year);
  const routeRef = db.collection("staff_health_screening_types_qa").doc(`${candidate.staffId}_${year}`);
  return db.runTransaction(async (transaction) => {
    const [evidenceSnapshot, statusSnapshot, routeSnapshot] = await Promise.all([
      transaction.get(evidenceRef), transaction.get(statusRef), transaction.get(routeRef),
    ]);
    const evidence = evidenceSnapshot.exists ? evidenceSnapshot.data() : null;
    const current = statusSnapshot.exists ? statusSnapshot.data() : {};
    if (!validEvidence(evidence, year) || evidence.submissionId !== input.submissionId || evidence.staffId !== candidate.staffId
      || fileId(evidence) !== fileId(candidate)) throw new TbWorkflowError("확인 자료가 변경되었습니다.", 409);
    if (input.action === "confirm" && evidence.reviewState === "confirmed" && current.evidenceSubmissionId === input.submissionId) return current;
    if ((current.revision || 0) !== input.expectedRevision) throw new TbWorkflowError("다른 확인이 저장되었습니다. 새로고침해 주세요.", 409);
    if (input.action === "confirm" && ["invalid", "rejected", "withdrawn"].includes(evidence.reviewState || evidence.status)) throw new TbWorkflowError("무효 자료는 확인 완료할 수 없습니다.", 409);
    const timestamp = now();
    const revision = (current.revision || 0) + 1;
    const routeData = routeSnapshot.exists ? routeSnapshot.data() : null;
    const route = validHealthScreeningTypeRecord(routeData, evidence.staffId, year) ? routeData : null;
    const confirmed = input.action === "confirm";
    const approval = { confirmedAt: timestamp, confirmedBy: input.actor, evidenceSubmissionId: input.submissionId,
      schoolYear: year, routeRevision: route?.revision || 0, routeAtConfirmation: route?.screeningType || null,
      evidenceSnapshot: { submissionId: input.submissionId, fileId: fileId(evidence), evidenceRoute: evidence.evidenceRoute || null }, revision };
    const certificate = buildQaTbCertificateReceiptStatus({ submission: evidence, current });
    const result = { ...current, staffId: evidence.staffId, schoolYear: year, taskId: taskId(year), environment: "qa", revision,
      ...(confirmed ? { ...approval, status: "completed", sourceType: "admin_confirmation", screening: { ...certificate.screening, completed: true } }
        : { discrepancy: current.status === "completed", invalidatedSubmissionId: input.submissionId }), updatedAt: timestamp };
    transaction.set(evidenceRef, { ...evidence, status: confirmed ? "completed" : "rejected", reviewState: confirmed ? "confirmed" : "invalid", reviewedBy: input.actor, reviewedAt: timestamp, revision: (evidence.revision || 0) + 1 });
    await saveTbScreeningStatus({ db, payload: result, collectionName: "staff_submission_status_qa",
      qaWorkflow: true, schoolYear: year, transaction, currentSnapshot: statusSnapshot });
    transaction.create(statusRef.collection("confirmationHistory").doc(String(revision)), { ...approval, action: input.action, actor: input.actor, source: "qa_workflow" });
    return result;
  });
}
