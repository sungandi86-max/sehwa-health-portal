import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { validateAuthBoundary, firebaseAuthRuntimePolicy } from "../../common/firebaseAuthPolicy.js";
const host = "qa.example.invalid", qa = "isolated-health-qa";
const state = { calls: [], policy: null, popupError: null, result: null, redirect: null };
const storage = new Map();
globalThis.window = { location: { hostname: host, origin: `https://${host}`, pathname: "/training", search: "?fixture=1", hash: "#section" },
  innerWidth: 1200, innerHeight: 900, navigator: {}, matchMedia: () => ({ matches: false }), dispatchEvent() {},
  sessionStorage: { getItem: (k) => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: (k) => storage.delete(k) } };
globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
globalThis.__authBoundaryMock = { state, assertBoundary(providerId) {
  state.calls.push("boundary");
  return validateAuthBoundary({ policy: state.policy, options: state.policy.environment === "production"
      ? { projectId: "sehwa-health-portal-v2", authDomain: "sehwa-health-portal.vercel.app" }
      : { projectId: qa, authDomain: `${qa}.firebaseapp.com` },
    hostname: state.policy.environment === "production" ? "sehwa-health-portal.vercel.app" : host, providerId, microsoftTenantId: "fixture.onmicrosoft.com" });
} };
const mock = `const {state, assertBoundary} = globalThis.__authBoundaryMock;
export const auth = {};
export const googleProvider = {providerId: "google.com"}, microsoftProvider = {providerId: "microsoft.com"};
export const assertAuthLoginBoundary = assertBoundary;
export const browserLocalPersistence = {};
export const setPersistence = async () => state.calls.push("persistence");
export const signInWithPopup = async (_auth, p) => {state.calls.push("popup:"+p.providerId); if(state.popupError) throw state.popupError; return state.result;};
export const signInWithRedirect = async (_auth,p) => {state.calls.push("redirect:"+p.providerId);};
export const getRedirectResult = async () => {state.calls.push("getRedirectResult"); return state.redirect;};
export const signOut = async () => state.calls.push("signOut");`;
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === "firebase/auth" || (specifier === "./firebase.js" && context.parentURL.includes("firebaseAuth.js"))) return { url: `data:text/javascript,${encodeURIComponent(mock)}`, shortCircuit: true };
  return next(specifier, context);
} });
const auth = await import("./firebaseAuth.js"); hooks.deregister();
const valid = () => firebaseAuthRuntimePolicy({ APP_ENV: "qa", QA_FIREBASE_PROJECT_ID: qa, FIREBASE_PROJECT_ID: qa,
  VITE_FIREBASE_PROJECT_ID: qa, QA_AUTHORIZED_DOMAINS: host, QA_MICROSOFT_TENANT_ID: "fixture.onmicrosoft.com" });
function reset() { state.calls.length = 0; state.policy = valid(); state.popupError = null; state.result = null; state.redirect = null; storage.clear(); window.navigator.standalone = false; }
test("real login entrypoints block unknown/unverified QA before persistence, popup or redirect SDK requests", async () => {
  for (const policy of [{ environment: "unknown" }, { ...valid(), qaAuthorizedDomains: [] }]) for (const login of [auth.signInWithGoogle, auth.signInWithMicrosoft]) {
    reset(); state.policy = policy;
    await assert.rejects(login(), /인증 환경/); assert.deepEqual(state.calls, ["boundary"]);
  }
});
test("Google and Microsoft/Teams popup login use their original providers after boundary validation", async () => {
  for (const [login, provider] of [[auth.signInWithGoogle,"google.com"], [auth.signInWithMicrosoft,"microsoft.com"]]) {
    reset(); await login(); assert.equal(state.calls[0], "boundary"); assert.ok(state.calls.includes(`popup:${provider}`));
  }
});
test("PWA redirect, popup-blocked fallback and safe internal session route restoration remain intact", async () => {
  reset(); window.navigator.standalone = true; await auth.signInWithGoogle();
  assert.ok(state.calls.includes("redirect:google.com")); assert.equal(auth.hasPendingRedirectRoute(), true);
  state.redirect = { user: { providerData: [{ providerId: "google.com" }] } };
  const result = await auth.handleAuthRedirectResult();
  assert.equal(result.route, "/training?fixture=1#section"); assert.equal(result.error, null); assert.equal(auth.hasPendingRedirectRoute(), false);
  reset(); state.popupError = { code: "auth/popup-blocked", message: "TOKEN-SENTINEL" };
  await auth.signInWithMicrosoft(); assert.ok(state.calls.includes("redirect:microsoft.com"));
});
test("blocked redirect restoration performs zero redirect-result SDK calls and publishes only safe errors", async () => {
  reset(); state.policy = { environment: "unknown" };
  const result = await auth.handleAuthRedirectResult(); assert.equal(result.result, null);
  assert.deepEqual(state.calls,["boundary"]); assert.doesNotMatch(auth.consumeRedirectAuthMessage(), /TOKEN|credential|AIza/);
  for (const code of ["auth/network-request-failed","auth/unauthorized-domain","unexpected"]) {
    const e = { code, message: "TOKEN-SENTINEL PRIVATE-KEY-SENTINEL" };
    assert.doesNotMatch(auth.getFriendlyAuthErrorMessage(e), /SENTINEL/);
    assert.doesNotMatch(auth.getFriendlyRedirectAuthErrorMessage(e), /SENTINEL/);
  }
});
test("Microsoft school-domain restriction and restored session provider checks are retained", async () => {
  reset(); state.result = { user: { email: "foreign@example.invalid", providerData:[{providerId:"microsoft.com"}] } };
  await assert.rejects(auth.signInWithMicrosoft(), /학교 Teams/); assert.ok(state.calls.includes("signOut"));
  reset(); state.redirect = { user: { email: "fixture@sehwa-gs.hs.kr", providerData:[{providerId:"microsoft.com"}] } };
  const result = await auth.handleAuthRedirectResult(); assert.equal(result.error,null);
  assert.equal(state.calls.filter((x)=>x==="boundary").length,2);
});

test("custom-token persistence gate and pending Microsoft redirects cannot bypass QA preflight", async () => {
  reset(); state.policy = { ...valid(), qaAuthorizedDomains: [] };
  assert.throws(() => auth.ensureAuthLocalPersistence(), /인증 환경/);
  assert.deepEqual(state.calls, ["boundary"]);
  reset(); window.navigator.standalone = true; await auth.signInWithMicrosoft();
  state.calls.length = 0; state.policy.microsoftTenantId = "";
  const denied = await auth.handleAuthRedirectResult(); assert.ok(denied.error);
  assert.deepEqual(state.calls, ["boundary"]);
});
test("legacy Microsoft redirect without a provider marker fails safely and clears the restored session on tenant rejection", async () => {
  reset(); state.policy.microsoftTenantId = "";
  state.redirect = { user: { email: "fixture@sehwa-gs.hs.kr", providerData:[{providerId:"microsoft.com"}] } };
  const result = await auth.handleAuthRedirectResult(); assert.equal(result.result, null); assert.ok(result.error);
  assert.ok(state.calls.includes("signOut"));
});

test("production real login entrypoints retain Google, Teams, redirect and restoration without new QA configuration", async () => {
  for (const [login, provider] of [[auth.signInWithGoogle,"google.com"], [auth.signInWithMicrosoft,"microsoft.com"]]) {
    reset(); state.policy = firebaseAuthRuntimePolicy({ VERCEL_ENV: "production" });
    await login(); assert.ok(state.calls.includes(`popup:${provider}`));
    window.navigator.standalone = true; await login(); assert.ok(state.calls.includes(`redirect:${provider}`));
    state.redirect = { user: { email: "fixture@sehwa-gs.hs.kr", providerData:[{providerId:provider}] } };
    assert.equal((await auth.handleAuthRedirectResult()).error, null);
  }
});
