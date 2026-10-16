import { firebaseRuntimePolicy, PRODUCTION_FIREBASE_PROJECT_ID, rejectFirebaseConfiguration,
  validateFirebaseCredential, validateFirebaseProject } from "../../common/firebaseEnvironment.js";

export function validatedAdminConfiguration(context, readAccount) {
  const policy = firebaseRuntimePolicy(context);
  const projectId = context.FIREBASE_PROJECT_ID || context.VITE_FIREBASE_PROJECT_ID ||
    (policy.environment === "production" ? PRODUCTION_FIREBASE_PROJECT_ID : "");
  validateFirebaseProject(policy, projectId);
  if (context.VITE_FIREBASE_PROJECT_ID && context.VITE_FIREBASE_PROJECT_ID !== projectId) {
    rejectFirebaseConfiguration("client-server-project");
  }
  if (context.VITE_APP_ENV && context.VITE_APP_ENV !== policy.environment) rejectFirebaseConfiguration("client-environment");
  const sources = [context.FIREBASE_SERVICE_ACCOUNT_JSON, context.FIREBASE_SERVICE_ACCOUNT_BASE64,
    context.FIREBASE_SERVICE_ACCOUNT_PATH].filter(Boolean);
  if (sources.length !== 1) rejectFirebaseConfiguration("credential-source");
  let account;
  try { account = readAccount(); }
  catch { rejectFirebaseConfiguration("credential-format"); }
  validateFirebaseCredential(policy, projectId, account);
  return { projectId, account };
}

export function initializeFirebaseAdmin({ context, readAccount, sdk }) {
  const { projectId, account } = validatedAdminConfiguration(context, readAccount);
  const apps = sdk.getApps();
  if (apps.length > 1 || (apps.length && apps[0].options?.projectId !== projectId)) rejectFirebaseConfiguration("existing-app");
  // Never trust a cached app created elsewhere with an unknown credential.
  const existing = apps[0];
  if (existing && (existing.options.credential !== sdk.trustedCredential ||
      ["project_id", "client_email", "private_key"].some((key) => account[key] !== sdk.trustedAccount?.[key]))) {
    rejectFirebaseConfiguration("existing-credential");
  }
  if (existing) return existing;
  try {
    const credential = sdk.cert(account);
    const app = sdk.initializeApp({ credential, projectId });
    sdk.trustedCredential = credential;
    sdk.trustedAccount = { ...account };
    return app;
  } catch { rejectFirebaseConfiguration("admin-initialization"); }
}
