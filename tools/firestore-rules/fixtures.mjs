// Synthetic records only. Roles and assignment fields mirror firestore.rules.
export const actors = [
  { key: "anonymous", uid: null },
  { key: "pending", uid: "pending", approved: false },
  { key: "staffA", uid: "staff-a", staffId: "S-A", roles: ["staff"], approved: true },
  { key: "staffB", uid: "staff-b", staffId: "S-B", roles: ["staff"], approved: true },
  { key: "health", uid: "health", staffId: "S-H", roles: ["health_teacher"], approved: true, manager: true, health: true },
  { key: "admin", uid: "admin", staffId: "S-M", roles: ["admin"], approved: true, manager: true },
  // No invented qa_admin role or privileged custom claim. An inactive existing
  // admin role in a separate QA assignment must not confer production authority.
  { key: "qaSyntheticAdmin", uid: "qa-admin", staffId: "QA-ADMIN", roles: ["admin"], approved: false, qaOnly: true },
  { key: "revoked", uid: "revoked", staffId: "S-R", roles: ["staff"], approved: false },
];
export const serverLedgers = ["training_events", "training_events_qa", "training_events_production",
  "training_signature_ledger", "training_signature_ledger_qa", "training_signature_ledger_production",
  "training_signature_ledger_qa/pair/signatures", "training_signature_ledger_production/pair/signatures",
  "training_signature_ledger_qa/pair/signatures/signature/history",
  "training_signature_ledger_production/pair/signatures/signature/history",
  "student_submission_audit_qa", "student_submission_audit_production",
  "tb_certificate_submissions_production"];
export const resources = ["staff_submission_status", "staff_submission_status_qa", "staff_submissions",
  "staff_submission_tasks", "users", "user_assignments", "access_requests",
  "student_care_presence_public", "student_care_presence_homeroom", "student_health_submissions", ...serverLedgers];
export const assignment = (actor) => ({ uid: actor.uid, schoolYear: 2026, semester: 2,
  roles: actor.roles || ["staff"], staffId: actor.staffId || "PENDING", active: actor.approved === true,
  grade: null, classNo: null, position: "fixture", createdAt: new Date(0), updatedAt: new Date(0) });
export function status(staffId, taskId = "tb-screening-2026") {
  return taskId.startsWith("tb") ? { staffId, taskId, status: "pending", screening: { completed: false } }
    : { staffId, taskId, status: "pending", training: { completionMethod: "individual" } };
}
export const submission = (actor) => ({ itemId: "cpr", staffId: actor.staffId || "PENDING",
  submitter: { uid: actor.uid || "anonymous", email: `${actor.uid || "anonymous"}@example.invalid`, displayName: "fixture" },
  trainingDate: "2026-10-01", institution: "fixture", staffType: "fixture",
  file: { driveFileId: null, fileName: "fixture.pdf", mimeType: "application/pdf", driveUrl: null },
  status: "submitted", submittedAt: new Date(0), updatedAt: new Date(0) });
export const infection = (actor) => ({ type: "infection", schoolYear: 2026, semester: 2,
  student: { grade: 1, classNo: 1, number: 1, name: "synthetic" },
  infection: { diseaseName: "synthetic", diagnosisDate: null, exclusionStartDate: null, exclusionEndDate: null },
  report: { status: "submitted", note: null },
  submittedBy: { uid: actor.uid || "anonymous", email: `${actor.uid || "anonymous"}@example.invalid`, displayName: "fixture" },
  submittedAt: new Date(0), updatedAt: new Date(0) });
export const accessRequest = (actor, timestamp) => ({ uid: actor.uid, email: `${actor.uid}@example.invalid`,
  displayName: "fixture", schoolYear: 2026, semester: 2, requestedRole: "staff", status: "pending",
  requestedAt: timestamp, updatedAt: timestamp, reviewedBy: null, reviewedAt: null, reviewNote: null,
  applicant: { realName: "합성", department: "테스트", staffType: "기타" },
  isHomeroomRequested: false, requestedGrade: null, requestedClassNo: null });
