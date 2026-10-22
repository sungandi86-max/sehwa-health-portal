import { firebaseRuntimePolicy, validateFirebaseProject, PRODUCTION_FIREBASE_PROJECT_ID } from "./firebaseEnvironment.js";

const PRODUCTION_HOST = "sehwa-health-portal.vercel.app";
const PRODUCTION_DOMAIN = `${PRODUCTION_FIREBASE_PROJECT_ID}.firebaseapp.com`;
export class FirebaseAuthBoundaryError extends Error {
  constructor(code) {
    super("인증 환경 설정을 확인해 주세요.");
    this.name = "FirebaseAuthBoundaryError";
    this.code = code;
  }
}
const reject = (code) => { throw new FirebaseAuthBoundaryError(code); };

// Build-time, server-owned non-secret declarations. This is an operator
// attestation after Console review, NOT discovery of live authorized domains.
export function firebaseAuthRuntimePolicy(context = {}) {
  return { ...firebaseRuntimePolicy(context), serverProjectId: context.FIREBASE_PROJECT_ID || "",
    clientProjectId: context.VITE_FIREBASE_PROJECT_ID || "",
    qaAuthorizedDomains: String(context.QA_AUTHORIZED_DOMAINS || "").split(",").map((x) => x.trim()).filter(Boolean),
    microsoftTenantId: context.QA_MICROSOFT_TENANT_ID || "" };
}

export function validateAuthBoundary({ policy, options, hostname, providerId = "", microsoftTenantId, clientTenantId }) {
  if (!["production", "qa"].includes(policy?.environment)) reject("auth/environment-unresolved");
  try { validateFirebaseProject(policy, options?.projectId); }
  catch { reject("auth/project-rejected"); }
  if ((policy.serverProjectId && policy.serverProjectId !== options.projectId) ||
      (policy.clientProjectId && policy.clientProjectId !== options.projectId)) reject("auth/project-mismatch");
  if (policy.environment === "production") {
    if (![PRODUCTION_DOMAIN, PRODUCTION_HOST].includes(options.authDomain) ||
        (options.authDomain === PRODUCTION_HOST && hostname !== PRODUCTION_HOST)) reject("auth/domain-rejected");
    return true;
  }
  if (!policy.serverProjectId || !policy.clientProjectId) reject("auth/project-required");
  if (options.authDomain !== `${policy.qaProjectId}.firebaseapp.com` || hostname === PRODUCTION_HOST) reject("auth/domain-rejected");
  const domains = policy.qaAuthorizedDomains;
  if (!Array.isArray(domains) || !domains.length || domains.some((x) => typeof x !== "string" ||
      !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(x) || [PRODUCTION_HOST, PRODUCTION_DOMAIN].includes(x)) ||
      !domains.includes(hostname)) reject("auth/qa-authorized-domain-unverified");
  if (providerId === "microsoft.com") {
    // Tenant identifies the upstream IdP, not the Firebase project. No QA school
    // tenant fallback; an explicit reviewed tenant may intentionally be shared.
    const tenant = policy.microsoftTenantId;
    if (typeof tenant !== "string" || !/^[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*$/.test(tenant) ||
        ["common", "organizations", "consumers"].includes(tenant.toLowerCase()) ||
        tenant !== microsoftTenantId || (clientTenantId && clientTenantId !== tenant)) reject("auth/qa-microsoft-tenant-unverified");
  }
  return true;
}
