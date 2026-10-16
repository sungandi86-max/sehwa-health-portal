// Server-owned deployment policy. No credential values belong in this module.
export const PRODUCTION_FIREBASE_PROJECT_ID = "sehwa-health-portal-v2";

export class FirebaseConfigurationError extends Error {
  constructor(code) {
    super(`Firebase configuration rejected (${code}).`);
    this.name = "FirebaseConfigurationError";
    this.code = code;
  }
}

export function rejectFirebaseConfiguration(code) {
  throw new FirebaseConfigurationError(code);
}

// A branch name and VITE_* values never grant a server environment.
export function firebaseRuntimePolicy(context = {}) {
  const requested = context.APP_ENV;
  const platform = context.VERCEL_ENV;
  let environment = "unknown";
  if (requested === undefined || requested === "") {
    if (platform === "production") environment = "production";
  } else if (requested === "production" && (!platform || platform === "production")) {
    environment = "production";
  } else if (requested === "qa" && (!platform || ["preview", "development"].includes(platform))) {
    environment = "qa";
  } else if (requested === "local" && (!platform || platform === "development")) {
    environment = "local";
  }
  return { environment, qaProjectId: context.QA_FIREBASE_PROJECT_ID || "" };
}

const validProjectId = (value) => typeof value === "string" && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value);

export function validateFirebaseProject(policy, projectId) {
  if (!["production", "qa", "local"].includes(policy?.environment)) rejectFirebaseConfiguration("environment");
  if (!validProjectId(projectId)) rejectFirebaseConfiguration("project");
  if (policy.environment === "production") {
    if (projectId !== PRODUCTION_FIREBASE_PROJECT_ID) rejectFirebaseConfiguration("production-project");
  } else {
    if (!validProjectId(policy.qaProjectId)) rejectFirebaseConfiguration("qa-project-required");
    if (policy.qaProjectId === PRODUCTION_FIREBASE_PROJECT_ID || projectId === PRODUCTION_FIREBASE_PROJECT_ID) {
      rejectFirebaseConfiguration("production-project-forbidden");
    }
    if (projectId !== policy.qaProjectId) rejectFirebaseConfiguration("project-mismatch");
  }
  return projectId;
}

export function validateFirebaseCredential(policy, projectId, account) {
  validateFirebaseProject(policy, projectId);
  if (!account || account.type !== "service_account" || account.project_id !== projectId ||
      typeof account.client_email !== "string" ||
      !account.client_email.endsWith(`@${projectId}.iam.gserviceaccount.com`) ||
      typeof account.private_key !== "string" || !account.private_key.trim() ||
      [["projectId", "project_id"], ["clientEmail", "client_email"], ["privateKey", "private_key"]]
        .some(([alias, field]) => account[alias] !== undefined && account[alias] !== account[field])) {
    rejectFirebaseConfiguration("credential");
  }
  return account;
}
