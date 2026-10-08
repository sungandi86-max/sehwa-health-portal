import { FieldValue } from "firebase-admin/firestore";

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

export function getTbStatusFromSubmissionState(submissionStatus) {
  if (submissionStatus === "completed") return { status: "completed", completed: true };
  if (submissionStatus === "rejected") return { status: "incomplete", completed: false };
  return { status: "pending", completed: false };
}

export async function saveTbScreeningStatus({ db, payload }) {
  const ref = db.collection("staff_submission_status").doc(`${payload.staffId}_${TB_SCREENING_TASK_ID}`);
  const snapshot = await ref.get();
  const current = snapshot.exists ? snapshot.data() : {};
  await ref.set({
    ...payload,
    screening: { ...(current.screening || {}), ...payload.screening },
    syncedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return ref.id;
}
