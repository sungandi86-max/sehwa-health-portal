import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { validateScreeningYear, validHealthScreeningTypeRecord } from "./healthScreeningTypeStore.js";
import { evidenceRoute, tbWorkflowTaskId } from "../../src/lib/tbScreeningWorkflowModel.js";

const EVIDENCE_COLLECTION = "tb_certificate_submissions_production";
const STATUS_COLLECTION = "staff_submission_status";
const ROUTE_COLLECTION = "staff_health_screening_types";

export class TbWorkflowError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const identifier = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value);
const evidenceFileId = (item) => item?.fileId || item?.evidenceFiles?.[0]?.fileId || "";

function statusRef(db, staffId, schoolYear) {
  if (!identifier(staffId)) throw new TbWorkflowError("교직원 정보를 확인해 주세요.");
  return db.collection(STATUS_COLLECTION).doc(`${staffId}_${tbWorkflowTaskId(schoolYear)}`);
}

function validEvidence(item, schoolYear) {
  return item?.environment === "production" && item.schoolYear === schoolYear && item.staffId === item.subjectStaffId
    && identifier(item.staffId) && identifier(item.submissionId) && identifier(evidenceFileId(item));
}

export async function recordProductionTbReceipt(db, submission) {
  const schoolYear = validateScreeningYear(submission.schoolYear);
  if (!validEvidence(submission, schoolYear)) throw new TbWorkflowError("확인 자료 정보를 확인해 주세요.");
  const evidenceRef = db.collection(EVIDENCE_COLLECTION).doc(submission.submissionId);
  const currentStatusRef = statusRef(db, submission.staffId, schoolYear);
  return db.runTransaction(async (transaction) => {
    const [evidenceSnapshot, statusSnapshot] = await Promise.all([
      transaction.get(evidenceRef),
      transaction.get(currentStatusRef),
    ]);
    if (!evidenceSnapshot.exists || !validEvidence(evidenceSnapshot.data(), schoolYear)) {
      throw new TbWorkflowError("접수 원장의 확인 자료를 찾지 못했습니다.", 409);
    }
    const evidence = evidenceSnapshot.data();
    const current = statusSnapshot.exists ? statusSnapshot.data() : {};
    if (["confirmed", "invalid"].includes(evidence.reviewState)) return evidence;
    transaction.set(evidenceRef, {
      status: "pending",
      reviewState: "pending",
      evidenceRoute: evidence.evidenceRoute || evidenceRoute(evidence.documentType),
      revision: Number.isInteger(evidence.revision) ? evidence.revision : 1,
      updatedAt: submission.submittedAt,
    }, { merge: true });
    if (current.status !== "completed") {
      transaction.set(currentStatusRef, {
        ...current,
        staffId: submission.staffId,
        schoolYear,
        taskId: tbWorkflowTaskId(schoolYear),
        environment: "production",
        status: "pending",
        sourceType: "portal_certificate",
        revision: current.revision || 0,
        latestSubmissionId: submission.submissionId,
        screening: {
          ...(current.screening || {}),
          targetStatus: "target",
          latentStatus: "unknown",
          screeningType: "individual",
          completed: false,
          screeningDate: submission.checkupDate || "",
          note: submission.documentType || "",
          registrationStatus: "submitted",
        },
        syncedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    return { ...evidence, status: "pending", reviewState: "pending" };
  });
}

export async function listProductionTbWorkflowData(db, {
  schoolYear,
  staffId,
  evidenceCursor = "",
  statusCursor = "",
  limit = 100,
}) {
  const year = validateScreeningYear(schoolYear);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      [evidenceCursor, statusCursor].some((value) => value && !identifier(value))) {
    throw new TbWorkflowError("조회 범위를 확인해 주세요.");
  }
  let evidenceQuery = db.collection(EVIDENCE_COLLECTION).where("schoolYear", "==", year);
  let statusQuery = db.collection(STATUS_COLLECTION).where("taskId", "==", tbWorkflowTaskId(year));
  if (staffId) {
    statusRef(db, staffId, year);
    evidenceQuery = db.collection(EVIDENCE_COLLECTION).where("staffId", "==", staffId);
  }
  const page = (query, cursor) => {
    const ordered = query.orderBy(FieldPath.documentId());
    return (cursor ? ordered.startAfter(cursor) : ordered).limit(limit).get();
  };
  const [evidence, statuses] = await Promise.all([
    page(evidenceQuery, evidenceCursor),
    staffId ? statusRef(db, staffId, year).get() : page(statusQuery, statusCursor),
  ]);
  const statusDocs = staffId ? (statuses.exists ? [statuses] : []) : statuses.docs;
  return {
    evidence: evidence.docs.map((doc) => doc.data()).filter((item) => validEvidence(item, year)),
    statuses: statusDocs.map((doc) => doc.data()).filter((item) =>
      item.staffId && item.schoolYear === year && item.taskId === tbWorkflowTaskId(year)),
    completeness: { evidence: evidence.docs.length < limit, statuses: staffId || statuses.docs.length < limit },
    cursors: {
      evidence: evidence.docs.length === limit ? evidence.docs.at(-1).id : null,
      statuses: !staffId && statuses.docs.length === limit ? statuses.docs.at(-1).id : null,
    },
  };
}

export async function reviewProductionTbEvidence(db, input, { now = () => new Date().toISOString() } = {}) {
  const schoolYear = validateScreeningYear(input.schoolYear);
  if (!identifier(input.submissionId) || !identifier(input.actor) || !Number.isInteger(input.expectedRevision)
      || input.expectedRevision < 0 || !["confirm", "invalidate"].includes(input.action)) {
    throw new TbWorkflowError("확인 요청을 확인해 주세요.");
  }
  const evidenceRef = db.collection(EVIDENCE_COLLECTION).doc(input.submissionId);
  const preliminary = await evidenceRef.get();
  const candidate = preliminary.exists ? preliminary.data() : null;
  if (!validEvidence(candidate, schoolYear)) throw new TbWorkflowError("해당 학년도 확인 자료를 찾지 못했습니다.", 404);
  const currentStatusRef = statusRef(db, candidate.staffId, schoolYear);
  const routeRef = db.collection(ROUTE_COLLECTION).doc(`${candidate.staffId}_${schoolYear}`);
  return db.runTransaction(async (transaction) => {
    const [evidenceSnapshot, statusSnapshot, routeSnapshot] = await Promise.all([
      transaction.get(evidenceRef),
      transaction.get(currentStatusRef),
      transaction.get(routeRef),
    ]);
    const evidence = evidenceSnapshot.exists ? evidenceSnapshot.data() : null;
    const current = statusSnapshot.exists ? statusSnapshot.data() : {};
    if (!validEvidence(evidence, schoolYear) || evidenceFileId(evidence) !== evidenceFileId(candidate)) {
      throw new TbWorkflowError("확인 자료가 변경되었습니다.", 409);
    }
    if (input.action === "confirm" && evidence.reviewState === "confirmed" && current.evidenceSubmissionId === input.submissionId) {
      return current;
    }
    if ((current.revision || 0) !== input.expectedRevision) {
      throw new TbWorkflowError("다른 확인이 저장되었습니다. 새로고침해 주세요.", 409);
    }
    if (input.action === "confirm" && ["invalid", "rejected", "withdrawn"].includes(evidence.reviewState || evidence.status)) {
      throw new TbWorkflowError("무효 자료는 확인 완료할 수 없습니다.", 409);
    }
    const timestamp = now();
    const revision = (current.revision || 0) + 1;
    const routeData = routeSnapshot.exists ? routeSnapshot.data() : null;
    const route = validHealthScreeningTypeRecord(routeData, evidence.staffId, schoolYear, "production") ? routeData : null;
    const approval = {
      confirmedAt: timestamp,
      confirmedBy: input.actor,
      evidenceSubmissionId: input.submissionId,
      schoolYear,
      routeRevision: route?.revision || 0,
      routeAtConfirmation: route?.screeningType || null,
      evidenceSnapshot: {
        submissionId: input.submissionId,
        fileId: evidenceFileId(evidence),
        evidenceRoute: evidence.evidenceRoute || evidenceRoute(evidence.documentType),
      },
      revision,
    };
    const confirmed = input.action === "confirm";
    const result = {
      ...current,
      staffId: evidence.staffId,
      schoolYear,
      taskId: tbWorkflowTaskId(schoolYear),
      environment: "production",
      revision,
      ...(confirmed ? {
        ...approval,
        status: "completed",
        sourceType: "admin_confirmation",
        discrepancy: false,
        screening: { ...(current.screening || {}), completed: true, registrationStatus: "confirmed" },
      } : {
        discrepancy: current.status === "completed",
        invalidatedSubmissionId: input.submissionId,
      }),
      updatedAt: timestamp,
    };
    transaction.set(evidenceRef, {
      status: confirmed ? "completed" : "rejected",
      reviewState: confirmed ? "confirmed" : "invalid",
      reviewedBy: input.actor,
      reviewedAt: timestamp,
      revision: (evidence.revision || 0) + 1,
      updatedAt: timestamp,
    }, { merge: true });
    transaction.set(currentStatusRef, result, { merge: true });
    transaction.create(currentStatusRef.collection("confirmationHistory").doc(String(revision)), {
      ...approval,
      action: input.action,
      actor: input.actor,
      source: "production_workflow",
    });
    return result;
  });
}
