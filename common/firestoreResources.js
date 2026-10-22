import { validateFirebaseProject, rejectFirebaseConfiguration } from "./firebaseEnvironment.js";

// Names are contracts, not a suffix convention. Tasks and identity live in the
// selected project; existing QA status ledgers retain their explicit names.
export const FIRESTORE_RESOURCES = Object.freeze({
  receipts: { type: "environmentScoped", production: "staff_submission_receipts_production", qa: "staff_submission_receipts_qa" },
  submissions: { type: "projectScoped", name: "staff_submissions" },
  tasks: { type: "projectScoped", name: "staff_submission_tasks" },
  statuses: { type: "environmentScoped", production: "staff_submission_status", qa: "staff_submission_status_qa", local: "staff_submission_status_qa" },
  assignments: { type: "projectScoped", name: "user_assignments" },
  syntheticAssignments: { type: "environmentScoped", qa: "user_assignments_qa" },
  studentHealth: { type: "projectScoped", name: "student_health_submissions" },
  productionTbEvidence: { type: "productionOnly", name: "tb_certificate_submissions_production" },
});

export function validateFirestoreDb(policy, db) {
  // Public SDK metadata only. Check both when available; do not trust one while
  // silently ignoring a conflicting cached/injected object's identity.
  let appProject, dbProject;
  try { appProject = db?.app?.options?.projectId; dbProject = db?.projectId; }
  catch { rejectFirebaseConfiguration("firestore-project-unresolved"); }
  const projects = [appProject, dbProject].filter((value) => value !== undefined);
  if (!projects.length) rejectFirebaseConfiguration("firestore-project-unresolved");
  for (const project of projects) validateFirebaseProject(policy, project);
  return db;
}

export function firestoreResource(policy, db, key, requestedName) {
  validateFirestoreDb(policy, db);
  const resource = FIRESTORE_RESOURCES[key];
  if (!resource) rejectFirebaseConfiguration("firestore-resource-unknown");
  if (resource.type === "productionOnly" && policy.environment !== "production") {
    rejectFirebaseConfiguration("firestore-production-only");
  }
  const name = resource.type === "environmentScoped"
    ? resource[policy.environment] : resource.name;
  if (!name) rejectFirebaseConfiguration("firestore-resource-unresolved");
  if (requestedName !== undefined && requestedName !== name) rejectFirebaseConfiguration("firestore-resource-mismatch");
  return name;
}
