import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { firebaseAuthRuntimePolicy, validateAuthBoundary } from "./firebaseAuthPolicy.js";
import { PRODUCTION_FIREBASE_PROJECT_ID as PROD } from "./firebaseEnvironment.js";
const QA = "isolated-health-qa", HOST = "qa.example.invalid";
const context = { APP_ENV: "qa", VERCEL_ENV: "preview", QA_FIREBASE_PROJECT_ID: QA,
  FIREBASE_PROJECT_ID: QA, VITE_FIREBASE_PROJECT_ID: QA, QA_AUTHORIZED_DOMAINS: HOST, QA_MICROSOFT_TENANT_ID: "fixture.onmicrosoft.com" };
const input = () => ({ policy: firebaseAuthRuntimePolicy(context), options: { projectId: QA, authDomain: `${QA}.firebaseapp.com` }, hostname: HOST });
test("explicit QA project/domain and operator-attested host allow Google; tenant is a separate Microsoft boundary", () => {
  assert.equal(validateAuthBoundary({ ...input(), providerId: "google.com" }), true);
  assert.equal(validateAuthBoundary({ ...input(), providerId: "microsoft.com", microsoftTenantId: context.QA_MICROSOFT_TENANT_ID }), true);
});
for (const [name, patch] of [
  ["QA project missing", { policy: firebaseAuthRuntimePolicy({ ...context, QA_FIREBASE_PROJECT_ID: "" }) }],
  ["production authDomain", { options: { projectId: QA, authDomain: `${PROD}.firebaseapp.com` } }],
  ["same-origin QA handler", { options: { projectId: QA, authDomain: HOST } }],
  ["production handler", { options: { projectId: QA, authDomain: "sehwa-health-portal.vercel.app" } }],
  ["unknown environment", { policy: firebaseAuthRuntimePolicy({ VERCEL_ENV: "preview", VITE_APP_ENV: "qa", VERCEL_GIT_COMMIT_REF: "qa" }) }],
  ["unaudited authorized domains", { policy: firebaseAuthRuntimePolicy({ ...context, QA_AUTHORIZED_DOMAINS: "" }) }],
  ["wildcard authorized domains", { policy: firebaseAuthRuntimePolicy({ ...context, QA_AUTHORIZED_DOMAINS: "*.vercel.app" }) }],
  ["foreign host", { hostname: "another.example.invalid" }],
  ["server project mismatch", { policy: firebaseAuthRuntimePolicy({ ...context, FIREBASE_PROJECT_ID: PROD }) }],
  ["missing server project", { policy: firebaseAuthRuntimePolicy({ ...context, FIREBASE_PROJECT_ID: "" }) }],
  ["client project mismatch", { policy: firebaseAuthRuntimePolicy({ ...context, VITE_FIREBASE_PROJECT_ID: PROD }) }],
  ["Microsoft tenant missing", { providerId: "microsoft.com" }],
  ["Microsoft tenant mismatch", { providerId: "microsoft.com", microsoftTenantId: "foreign.invalid" }],
  ["Microsoft client tenant mismatch", { providerId: "microsoft.com", microsoftTenantId: context.QA_MICROSOFT_TENANT_ID, clientTenantId: "foreign.invalid" }],
]) test(`auth boundary rejects ${name} without disclosing configuration`, () => {
  assert.throws(() => validateAuthBoundary({ ...input(), ...patch }), (e) => {
    assert.equal(e.name, "FirebaseAuthBoundaryError");
    assert.doesNotMatch(e.message, /isolated|firebaseapp|secret|token|fixture|AIza/i); return true;
  });
});
test("production same-origin and direct Firebase domains preserve both provider contracts without QA variables", () => {
  for (const authDomain of [`${PROD}.firebaseapp.com`, "sehwa-health-portal.vercel.app"]) for (const providerId of ["google.com", "microsoft.com"]) {
    assert.equal(validateAuthBoundary({ policy: firebaseAuthRuntimePolicy({ VERCEL_ENV: "production" }),
      options: { projectId: PROD, authDomain }, hostname: "sehwa-health-portal.vercel.app", providerId }), true);
  }
});
test("Vercel sends auth paths to production ONLY on the exact production host; all other hosts get an inert local page", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url)));
  const auth = config.rewrites.filter((r) => r.source === "/__/auth/:path*");
  assert.equal(auth.length, 2);
  assert.deepEqual(auth[0].has, [{ type: "host", value: "sehwa-health-portal.vercel.app" }]);
  assert.equal(auth[0].destination, `https://${PROD}.firebaseapp.com/__/auth/:path*`);
  assert.equal(auth[1].destination, "/auth-path-blocked.html");
  const page = readFileSync(new URL("../public/auth-path-blocked.html", import.meta.url), "utf8");
  assert.doesNotMatch(page, /<script|https?:|http-equiv|<iframe/i);
});
test("only non-secret declarations enter Vite auth policy; browser-only values cannot establish QA approval", () => {
  const policy = firebaseAuthRuntimePolicy({ ...context, FIREBASE_SERVICE_ACCOUNT_JSON: "SECRET-SENTINEL", QA_SUBMISSION_PROXY_SECRET: "TOKEN-SENTINEL" });
  assert.doesNotMatch(JSON.stringify(policy), /SENTINEL/);
  assert.deepEqual(firebaseAuthRuntimePolicy({ VITE_APP_ENV: "qa", VITE_QA_AUTHORIZED_DOMAINS: HOST }).qaAuthorizedDomains, []);
});
