# Cloud QA Firebase guard (P0-1)

This guard protects Firebase initialization, not all Google/Apps Script access. Do not enable live QA until the remaining data paths and production URL fallbacks are isolated. No QA project or credentials have been provisioned by this change.

## Server-owned environment

| Server configuration | Firebase environment |
| --- | --- |
| `VERCEL_ENV=production`, APP_ENV unset | production (existing deployment contract) |
| `APP_ENV=production`, platform absent or production | production |
| `APP_ENV=qa`, platform absent, preview or development | qa |
| `APP_ENV=local`, platform absent or development | local |
| Anything else, including contradictory platform settings | unknown, blocked |

Preview alone, `VERCEL_GIT_COMMIT_REF=qa`, NODE_ENV and browser `VITE_APP_ENV` do not authorize QA. APP_ENV and QA_FIREBASE_PROJECT_ID must come from controlled server/build configuration, never request input. A local environment explicitly uses nonproduction resources; it cannot inherit production defaults. This policy does not change the separate training deployment resolver or make Cloud a full Vercel API runner.

Vite embeds only `{ environment, qaProjectId }` from server configuration as __FIREBASE_RUNTIME_POLICY__. It never embeds a service account or other server secrets. VITE_APP_ENV is an optional consistency assertion, not authority. Changing the policy requires rebuilding/restarting Vite; runtime server handlers independently revalidate their own environment. A bundle built without recognized environment still compiles but blocks when Firebase is initialized.

## QA/local configuration

Required non-secret selections: APP_ENV, QA_FIREBASE_PROJECT_ID, FIREBASE_PROJECT_ID and the complete VITE_FIREBASE_API_KEY, AUTH_DOMAIN, PROJECT_ID, STORAGE_BUCKET, MESSAGING_SENDER_ID and APP_ID fields. Both actual project IDs must equal QA_FIREBASE_PROJECT_ID, which must differ from the fixed production project. If VITE_APP_ENV is supplied it must match the server-selected environment.

Use exactly one of FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_BASE64 or FIREBASE_SERVICE_ACCOUNT_PATH. The service account must have type service_account, matching project_id, a client_email in that project's iam.gserviceaccount.com domain and a nonempty private_key. cert() parses the key only after policy validation. Never add a key value to this document or chat. Conflicting camelCase credential aliases are also rejected so SDK field precedence cannot override validated JSON fields. Multiple sources, malformed input or mismatches are rejected with fixed error codes, without raw SDK/JSON errors or credential content.

Known production API key, sender ID and app ID are rejected in QA/local; the app ID must also agree with the supplied sender ID. An unknown API key cannot be proven to belong to a project offline, so QA configuration must still come from the controlled QA project settings.

QA/local authDomain must be the QA project's firebaseapp.com domain and storageBucket must be that project's appspot.com or firebasestorage.app bucket. The existing fixed QA hostname no longer automatically replaces the QA authDomain. A future custom redirect-domain feature needs independent project routing validation. Existing production defaults and production custom authDomain resolution remain, with production project/bucket/domain checks. The known QA hostname rejects a production policy, and the production hostname rejects nonproduction policy.

Production defaults are allowed only in a recognized production environment. Production cannot select a QA project or credential. QA/local have no production fallback. Admin Auth token verification uses the guarded app/project, so Firebase Admin enforces that project's issuer/audience; token checks are not replaced with client claims.

## Initialization paths

- src/lib/firebase.js -> firebaseInitialization.js -> shared common/firebaseEnvironment.js, then Firebase SDK app/Auth/Firestore creation. Existing app/auth/db/provider exports remain.
- server/lib/firebaseAdmin.js -> firebaseAdminInitialization.js -> shared policy, then cert/initializeApp. Auth/Firestore/Messaging exports remain. Google Sheets service-account access through getFirebaseServiceAccount uses the same validation.
- Cached apps are checked again on every access. Client configuration must match the existing app. Server reuses only the app/credential created by this helper with unchanged credential fields. An externally preinitialized Admin app is rejected, even if its projectId matches.

Guard failures happen before Firebase services are obtained. Invalid config tests assert no SDK calls, cached-app rejection tests permit only local getApps inspection, and SDK exception tests assert no subsequent service creation. Tests use synthetic placeholders; they do not establish that a real credential/key/API key is valid or authorized. Offline checks cannot prove a key's ownership beyond declared metadata.

## Validation and scope

Use Node 22 and npm test; npm run build compiles without contacting Firebase. No lint/typecheck scripts are currently defined. Test production with mocks, never a live production request. Maintain main's student audit ledger, TB receipt/review/invalidation and training correction success behavior; this change does not edit those workflows, Rules, manifests or lockfiles.

Next P0: remove development fallbacks to production portal/health-room URLs and enforce QA-owned Apps Script/Sheets/Drive resources. A valid QA Firebase app alone does not isolate those services or every collection path. Do not run migration, seed, dry-run, sync, or live school-data checks as setup.
