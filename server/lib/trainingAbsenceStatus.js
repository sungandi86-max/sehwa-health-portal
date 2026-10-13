import { createHash } from "node:crypto";
import { requireTrainingEnvironment } from "./trainingDeployment.js";

const REASONS = Object.freeze({
  business_trip: "출장",
  annual_leave: "연가",
  sick_leave: "병가",
  official_leave: "공가",
  special_leave: "특별휴가",
  other: "기타",
});

export const TRAINING_ABSENCE_REASONS = Object.freeze(Object.keys(REASONS));

export function trainingAbsenceCollection(context = process.env) {
  return `training_attendance_status_${requireTrainingEnvironment(context)}`;
}

export function trainingAbsenceLabel(reason, note = "") {
  if (!reason || !REASONS[reason]) return "미참석";
  const detail = String(note || "").normalize("NFKC").trim();
  return reason === "other" && detail ? `${REASONS[reason]}(${detail})` : REASONS[reason];
}

function documentId(eventId, staffId) {
  return createHash("sha256").update(JSON.stringify([eventId, staffId])).digest("hex");
}

export async function listTrainingAttendanceStatuses(db, eventId, context = process.env) {
  const snapshot = await db.collection(trainingAbsenceCollection(context)).where("eventId", "==", eventId).limit(500).get();
  return snapshot.docs.map((doc) => doc.data());
}

export async function saveTrainingAttendanceStatus(db, { eventId, staffId, attendanceStatus, absenceReason = null,
  absenceNote = "", actorStaffId, updatedAt }, context = process.env) {
  if (!eventId || !staffId || !["attended", "absent"].includes(attendanceStatus)) throw new RangeError("출석 상태를 확인해 주세요.");
  if (attendanceStatus === "absent" && absenceReason !== null && !TRAINING_ABSENCE_REASONS.includes(absenceReason)) throw new RangeError("미참석 사유를 확인해 주세요.");
  const note = attendanceStatus === "absent" ? String(absenceNote || "").normalize("NFKC").trim().slice(0, 200) : "";
  const reason = attendanceStatus === "absent" ? absenceReason : null;
  const value = { eventId, staffId, attendanceStatus, absenceReason: reason, absenceNote: note,
    updatedByStaffId: actorStaffId, updatedAt };
  await db.collection(trainingAbsenceCollection(context)).doc(documentId(eventId, staffId)).set(value, { merge: true });
  return value;
}
