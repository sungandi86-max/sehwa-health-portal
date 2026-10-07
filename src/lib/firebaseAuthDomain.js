export const DEFAULT_FIREBASE_AUTH_DOMAIN = "sehwa-health-portal-v2.firebaseapp.com";

const FIRST_PARTY_AUTH_HOSTS = new Set([
  "sehwa-health-portal.vercel.app",
  "sehwa-health-portal-git-qa-sungandi86-maxs-projects.vercel.app",
]);

export function resolveFirebaseAuthDomain(hostname, configuredAuthDomain = "") {
  if (FIRST_PARTY_AUTH_HOSTS.has(hostname)) return hostname;
  return configuredAuthDomain || DEFAULT_FIREBASE_AUTH_DOMAIN;
}
