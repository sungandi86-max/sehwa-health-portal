import { FieldValue } from "firebase-admin/firestore";
import { tbWorkflowTaskId } from "../../src/lib/tbScreeningWorkflowModel.js";

export const TB_SCREENING_TASK_ID = "tb-screening-2026";

function requiredStaffId(value) {
  const staffId = String(value || "").trim();
  if (!staffId) throw new Error("canonical staffId is required");
  return staffId;
}

function text(value, maxLength = 200) {
  return String(value || "").trim().slice(0, maxLength);
}

export function buildTbRegistrationStatus({ staffId, registrationType }) {
  return {
    staffId: requiredStaffId(staffId),
    taskId: TB_SCREENING_TASK_ID,
    status: "incomplete",
    sourceType: "portal_registration",
    screening: {
      targetStatus: "target",
      latentStatus: "unknown",
      screeningType: "group",
      completed: false,
      screeningDate: "",
      note: text(registrationType),
      registrationStatus: "applied",
    },
  };
}

export function buildTbCertificateStatus({ staffId, checkupDate, documentType }) {
  return {
    staffId: requiredStaffId(staffId),
    taskId: TB_SCREENING_TASK_ID,
    status: "pending",
    sourceType: "portal_certificate",
    screening: {
      targetStatus: "target",
      latentStatus: "unknown",
      screeningType: "individual",
      completed: false,
      screeningDate: text(checkupDate, 10),
      note: text(documentType),
      registrationStatus: "submitted",
    },
  };
}

export function buildQaTbCertificateReceiptStatus({ submission, current = {} }) {
  const payload = buildTbCertificateStatus({ staffId: submission.staffId,
    checkupDate: submission.checkupDate, documentType: submission.documentType });
  return { ...current, ...payload, schoolYear: submission.schoolYear,
    taskId: tbWorkflowTaskId(submission.schoolYear), environment: "qa", revision: current.revision || 0,
    screening: { ...payload.screening, ...current.screening, completed: false,
      screeningType: payload.screening.screeningType, screeningDate: payload.screening.screeningDate,
      note: payload.screening.note, registrationStatus: payload.screening.registrationStatus },
    latestSubmissionId: submission.submissionId, updatedAt: submission.submittedAt };
}

export function getTbStatusFromSubmissionState(submissionStatus) {
  if (submissionStatus === "completed") return { status: "completed", completed: true };
  if (submissionStatus === "rejected") return { status: "incomplete", completed: false };
  return { status: "pending", completed: false };
}

export async function saveTbScreeningStatus({ db, payload, collectionName = "staff_submission_status", qaWorkflow = false, schoolYear,
  transaction, currentSnapshot }) {
  if (!["staff_submission_status", "staff_submission_status_qa"].includes(collectionName)) {
    throw new Error("TB status collection is not allowed");
  }
  if (qaWorkflow && collectionName !== "staff_submission_status_qa") throw new Error("QA workflow requires QA status collection");
  if (transaction && !qaWorkflow) throw new Error("Transaction status writes require QA workflow");
  const selectedTaskId = qaWorkflow ? tbWorkflowTaskId(schoolYear) : TB_SCREENING_TASK_ID;
  const ref = db.collection(collectionName).doc(`${payload.staffId}_${selectedTaskId}`);
  const snapshot = transaction ? currentSnapshot || await transaction.get(ref) : await ref.get();
  const current = snapshot.exists ? snapshot.data() : {};
  if (qaWorkflow && current.status === "completed" && payload.status !== "completed") return ref.id;
  const value = {
    ...payload,
    ...(qaWorkflow ? { taskId: selectedTaskId, schoolYear, environment: "qa" } : {}),
    screening: { ...(current.screening || {}), ...payload.screening },
    syncedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (transaction) transaction.set(ref, value, { merge: true });
  else await ref.set(value, { merge: true });
  return ref.id;
}
