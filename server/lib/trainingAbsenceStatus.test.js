import test from "node:test";
import assert from "node:assert/strict";
import { listTrainingAttendanceStatuses, saveTrainingAttendanceStatus, trainingAbsenceCollection } from "./trainingAbsenceStatus.js";

function memoryDb() {
  const values = new Map();
  return { values, collection(name) { return {
    doc(id) { return { set: async (value, options) => values.set(`${name}/${id}`, options?.merge ? { ...values.get(`${name}/${id}`), ...value } : value) }; },
    where(field, operator, expected) { assert.equal(operator, "=="); return { limit() { return { get: async () => ({ docs: [...values.entries()]
      .filter(([key, value]) => key.startsWith(`${name}/`) && value[field] === expected)
      .map(([, value]) => ({ data: () => value })) }) }; } }; },
  }; } };
}

const qa = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" };
const production = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" };

test("absence status collections are environment-isolated and default-deny compatible", () => {
  assert.equal(trainingAbsenceCollection(qa), "training_attendance_status_qa");
  assert.equal(trainingAbsenceCollection(production), "training_attendance_status_production");
});

test("attendance clears absence details and event reads stay scoped", async () => {
  const db = memoryDb();
  await saveTrainingAttendanceStatus(db, { eventId: "EVENT-A", staffId: "STAFF-1", attendanceStatus: "absent",
    absenceReason: "sick_leave", absenceNote: "", actorStaffId: "ADMIN", updatedAt: "2026-10-13T06:00:00.000Z" }, qa);
  await saveTrainingAttendanceStatus(db, { eventId: "EVENT-B", staffId: "STAFF-1", attendanceStatus: "absent",
    absenceReason: "annual_leave", absenceNote: "", actorStaffId: "ADMIN", updatedAt: "2026-10-13T06:01:00.000Z" }, qa);
  await saveTrainingAttendanceStatus(db, { eventId: "EVENT-A", staffId: "STAFF-1", attendanceStatus: "attended",
    absenceReason: "sick_leave", absenceNote: "ignored", actorStaffId: "ADMIN", updatedAt: "2026-10-13T06:02:00.000Z" }, qa);
  const rows = await listTrainingAttendanceStatuses(db, "EVENT-A", qa);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].attendanceStatus, rows[0].absenceReason, rows[0].absenceNote], ["attended", null, ""]);
  assert.equal([...db.values.keys()].some((key) => key.startsWith("training_attendance_status_production/")), false);
});

test("absence status rejects unapproved reasons", async () => {
  await assert.rejects(saveTrainingAttendanceStatus(memoryDb(), { eventId: "EVENT-A", staffId: "STAFF-1",
    attendanceStatus: "absent", absenceReason: "untrusted", actorStaffId: "ADMIN", updatedAt: "now" }, qa), /사유/);
});
