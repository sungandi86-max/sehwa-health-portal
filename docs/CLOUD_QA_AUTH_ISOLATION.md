# P0-4 phase 2: Firebase Auth route isolation

Implementation baseline: feature/cloud-qa-firebase-guard-p0 at 320ac29026b3985d132dc5f34df9cba86b06ffe2. This document contains configuration names, not real resource values or credentials. No deployment or Console/provider configuration is performed.

## Runtime contract

The existing P0-1 server environment policy remains authoritative: explicit APP_ENV=qa, compatible platform environment, and QA_FIREBASE_PROJECT_ID. Preview, branch names, a query parameter, hostname or VITE_APP_ENV alone cannot establish QA.

The client initializer already rejects QA project/authDomain/bucket mismatches before SDK initialization. A new build-time auth policy additionally guards federated login before persistence/popup/redirect, the persistence gate used by existing custom-token switches, and redirect-result restoration. Actual Auth app project metadata is compared to both declared server and client project IDs. QA now requires explicit FIREBASE_PROJECT_ID as well as VITE_FIREBASE_PROJECT_ID; both must equal QA_FIREBASE_PROJECT_ID.

QA authDomain must be the dedicated project's Firebase-hosted domain. Same-origin QA /__/auth is not used, and the production host/domain is rejected. Production retains its pinned Firebase project, same-origin auth on its existing production host, existing direct Firebase domain fallback, Google/Microsoft provider IDs, tenant default, school-email restriction, local persistence, popup fallback, PWA/mobile redirect and safe internal route restoration. No new QA variable is required in production.

Local federated login is blocked by this new boundary until a separate local authentication policy is defined; offline tests and the loopback Emulator do not require federated login.

## Vercel routing

The existing /__/auth/:path* production proxy is retained only with an exact host condition for the current production host. The following auth-path rewrite for all other hosts serves public/auth-path-blocked.html, an inert document without scripts, redirects or external URLs. This is a blocked auth route, not an HTTP 403 guarantee. API count remains 12; no proxy function is added.

Static tests verify route ordering, the exact production host condition and destination, and the inert fallback. They are NOT proof of deployed Vercel routing. After separately authorized QA deployment, inspect actual route behavior on the QA alias and verify that requests never reach the production handler. Vite's development server does not execute Vercel's routing configuration.

## Required manual configuration (future, not performed)

1. Provision/register a dedicated QA Firebase web app and server identity. Supply the existing QA VITE_FIREBASE_* configuration and QA_FIREBASE_PROJECT_ID. Supply FIREBASE_PROJECT_ID explicitly. Confirm actual client/Admin credential project consistency; no runtime environment value is changed here.
2. In the QA Firebase Console, enable the intended providers and manually confirm the exact QA hostname(s) in Authentication Authorized domains. Do not change production Console settings or authorize arbitrary Preview domains.
3. Only after that review, set QA_AUTHORIZED_DOMAINS in the QA branch's Preview build environment to a comma-separated exact hostname list. No scheme, path or wildcard; production hosts/domains are forbidden. This new non-secret server build input is an operator attestation, NOT a Console API query or cryptographic proof. Missing/unlisted/invalid declarations block login. Incorrect or stale attestations cannot be detected offline; Firebase still enforces its live configuration. Changes require a newly reviewed build.
4. For Microsoft/Teams, set QA_MICROSOFT_TENANT_ID to an explicitly reviewed concrete tenant domain/ID. Broad common/organizations/consumers selections are rejected. The QA provider uses this tenant, with no implicit production-school default. If VITE_MICROSOFT_TENANT_ID is also present it must match. Google does not require a Microsoft tenant. Tenant and Firebase project are separate boundaries; an intentionally shared IdP tenant does not grant production Firebase authority. Existing school-email restrictions remain, so do not broaden them to make synthetic accounts pass.
5. In the QA Firebase/provider consoles, configure the QA Firebase auth handler redirect URI and QA-only provider registration/credentials. Provider secrets belong in the provider/Firebase Console, never VITE_* variables. Validate Google and Microsoft settings separately. No credentials are generated here.
6. Keep production redirect registration intact. Inspect Vercel Git Integration, environment scopes and automatic deployment controls before any future push/deploy. Never rely on skip markers as a deployment barrier.

QA uses a cross-origin Firebase-hosted auth helper. Browser third-party storage restrictions may prevent mobile/PWA redirect restoration; popup and mocked redirect tests cannot prove live browser compatibility. Do not fall back to the production handler to repair this. If cross-origin redirect fails, hold that workflow and design a reviewed QA-specific same-origin handler under a separately authorized change.

## Redirect/session safety

Pending redirects retain the existing internal route plus the selected provider ID. QA Microsoft tenant checks run before consuming a known Microsoft redirect. Legacy redirects without a provider marker are checked after SDK restoration; if that provider boundary fails, the restored user is signed out and a fixed safe error is published. The existing school-domain enforcement is retained. Unknown environment and unverified QA host are blocked before getRedirectResult.

Error codes use fixed auth/* policy codes and a fixed Korean message. No key, token, tenant, URL, project ID or SDK credential diagnostic is interpolated into policy errors. Existing friendly SDK error mappings remain. Only non-secret project/domain/tenant declarations enter the Vite policy; service accounts, API secrets and tokens do not.

## Validation and limits

Run common/firebaseAuthPolicy.test.js, src/lib/firebaseAuthBoundary.test.js, src/lib/firebaseAuthDomain.test.js and existing common/firebaseEnvironment.test.js; then npm test, npm run test:rules using the pinned verified local JAR, npm run build and explicit APP_ENV=production VERCEL_ENV=production build, plus git diff --check. lint/typecheck are not defined (N/A).

All auth SDK calls in integration tests are replaced with mocks. Rules tests use only the local demo-project Emulator. No live login, Firebase/Google/Microsoft data access, school data, environment-value changes, production OAuth changes, deployment, migration, commit or push is authorized by this implementation. A local code checkpoint is distinct from live QA or production deployment approval.

## Executed local results

- Auth boundary/domain + existing Firebase initialization guards: 75/75 PASS.
- Full ordinary tests: 578/578 PASS (551 baseline + 27 net additions), no failures/skips/cancellations.
- Local Firestore Rules Emulator: 218/218 PASS, no failures/skips/cancellations.
- Normal build and explicit production build: PASS; existing bundle-size warning remains.
- lint/typecheck: N/A (scripts absent). git diff --check: PASS.
- 11 intended changed files, API Functions 12. Existing Rules, Apps Script, production student audit, TB review/invalidation and training correction source are unchanged.
- Live Firebase/Google/Microsoft access, school-data access and deployments: zero. No commit/push/PR performed.
- Checkpoint eligibility: YES for local code/mock/static/Emulator evidence only. Deployed routing, Console/provider settings and browser redirect compatibility remain unverified; live QA and production deployment remain blocked pending separate configuration review/authorization.
