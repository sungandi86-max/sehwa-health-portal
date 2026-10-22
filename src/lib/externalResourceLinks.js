// A deployment hostname or VITE_APP_ENV never grants access to production links.
export function productionOnlyExternalLink(url, policy = typeof __FIREBASE_RUNTIME_POLICY__ === "undefined"
  ? { environment: "unknown" } : __FIREBASE_RUNTIME_POLICY__) {
  return policy.environment === "production" ? url : undefined;
}
