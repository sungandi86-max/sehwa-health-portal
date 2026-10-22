# Cloud QA external resource isolation (P0-2)

Base: P0-1 checkpoint 6f265f4cbf62808a6cf26ab02044008cb3418a56. This change is implementation and mock/config validation only. It does not provision a QA GAS deployment, Sheet, Drive folder, identity, secret or OAuth account. No live Firebase, Apps Script, Sheets or Drive operation is part of validation. API function membership remains 12.

## Audit and classification

Counts below describe independent runtime selection/call sites, not keyword matches. Initial runtime review found 21; expansion found two direct tool links and the roadmap resolver, bringing the total to 24. Unused config and manual tools are listed separately.

| Class | Location | Sites | Decision |
| --- | --- | ---: | --- |
| B risk | src/App.jsx, AdminAuthGate.jsx, AdminReceiptStatusPage.jsx, portalContent.js (three loaders) | 6 | Remove cross-origin production retries completely |
| B risk | api/submit.js, api/portal.js, api/health-room-status.js GAS selection | 3 | Environment-specific binding, no QA fallback |
| B risk | trainingSpreadsheetId unknown default; fixed research source | 2 | Dedicated bindings or explicit sharedReadOnly |
| B risk | Training signature OAuth default binding | 1 | Environment-specific credential source |
| B risk | Submission secret; student-care forward secret; sync secret | 3 | Environment-specific secret source |
| B risk | training, submission, CMS, roadmap environment resolvers | 4 | P0-1 policy, never branch-only QA |
| B boundary gap | CPR/TB/student evidence folder checks | 3 | Mandatory nonproduction folder; reject known opposite-environment resources |
| B direct link | AdminRoadmapPage and AdminMessageHelperPage GAS tool | 2 | Production-only link, unavailable outside production |
| A allowed | Production GAS_URL -> legacy VITE_GAS_BASE_URL | separate | Preserve only in production |
| A allowed | Production canonical staff/training and research workbooks; OAuth binding | separate | Preserve existing production selections, no new required production variable |
| C allowed | Static offline sample data, labels, empty defaults without network I/O | separate | Keep; these do not authorize or select remote resources |
| D obsolete | src/config.js GAS_BASE_URL currently has no importer | 1 | Guard existing export with production policy; no nonproduction default |
| A production-only tooling | scripts/migrate*, seed*, backfill and credential CLI | separate | Manual operational tools; not executed or added to setup. They are not certified QA-safe |

Browser hostname checks retained for display/login UX are not authorization. They cannot choose server resources or override the validated Firebase/environment policy. Real resource selectors use server configuration. Publicly managed content may contain external links; this change does not certify arbitrary imported content or make every Firestore collection path QA-isolated.

## Environment source of truth

Use firebaseRuntimePolicy from common/firebaseEnvironment.js (P0-1). APP_ENV=qa or local must be explicit and compatible with VERCEL_ENV. VERCEL_ENV=production retains the existing production contract. Preview or VERCEL_GIT_COMMIT_REF alone cannot grant QA. Unknown/contradictory configurations fail before resource I/O.

The training/submission/CMS/roadmap adapters accept only qa/production from this policy. Generic resource helpers also support explicit local resources. This does not add a local Firestore workflow/ledger adapter: workflows without a local adapter remain blocked rather than borrowing QA or production collections.

## Resource matrix

| Resource | production | qa | local |
| --- | --- | --- | --- |
| Submission GAS | GAS_URL, legacy VITE_GAS_BASE_URL | QA_SUBMISSION_GAS_URL | LOCAL_SUBMISSION_GAS_URL |
| Portal GAS | same existing production GAS | QA_PORTAL_GAS_URL | LOCAL_PORTAL_GAS_URL |
| Student-care GAS | same existing production GAS | QA_STUDENT_CARE_GAS_URL | LOCAL_STUDENT_CARE_GAS_URL |
| Staff/training Sheet | existing canonical workbook | QA_STAFF_ROSTER_SOURCE_SPREADSHEET_ID | LOCAL_STAFF_ROSTER_SOURCE_SPREADSHEET_ID |
| Research mandatory-training Sheet | existing canonical research workbook | QA_RESEARCH_TRAINING_SPREADSHEET_ID | LOCAL_RESEARCH_TRAINING_SPREADSHEET_ID |
| Submission signature | SUBMISSION_PROXY_SECRET | QA_SUBMISSION_PROXY_SECRET | LOCAL_SUBMISSION_PROXY_SECRET |
| Student-care signature/callback | STUDENT_CARE_PROXY_SECRET | QA_STUDENT_CARE_PROXY_SECRET | LOCAL_STUDENT_CARE_PROXY_SECRET |
| QR signature | TRAINING_QR_SECRET | QA_TRAINING_QR_SECRET | LOCAL_TRAINING_QR_SECRET |
| CPR evidence folder | existing Apps Script canonical folder | QA_CPR_DRIVE_FOLDER_ID | LOCAL_CPR_DRIVE_FOLDER_ID |
| TB evidence folder | existing Apps Script canonical folder | QA_TB_CERTIFICATE_DRIVE_FOLDER_ID | LOCAL_TB_CERTIFICATE_DRIVE_FOLDER_ID |
| Student reply folder | existing Apps Script canonical folder | QA_STUDENT_REPLY_DRIVE_FOLDER_ID | LOCAL_STUDENT_REPLY_DRIVE_FOLDER_ID |
| Signature OAuth | TRAINING_DRIVE_OAUTH_CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN | QA_TRAINING_DRIVE_OAUTH_CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN | LOCAL_TRAINING_DRIVE_OAUTH_CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN |

QA portal/student-care endpoints cannot borrow QA_SUBMISSION_GAS_URL either: declare each resource binding deliberately. QA Sheets no longer use the unprefixed STAFF_ROSTER_SOURCE_SPREADSHEET_ID as authority. Production continues to use its canonical workbook even when that old variable is present.

GAS URLs must use the HTTPS script.google.com /macros/s/<deployment>/exec contract. Known production deployment IDs and explicitly configured opposing URLs are denied outside production. QA/local folder IDs are required and cannot be known production canonical folders, explicitly configured opposing folders, or optional PRODUCTION_DRIVE_FOLDER_IDS entries. Production never sends a QA folder in its envelope; the unchanged Apps Script retains its canonical destination.

Identifiers and names alone cannot prove ownership of an arbitrary Google resource offline. Dedicated bindings must be supplied from verified QA resources by an administrator. Known production/opposing-resource collisions are rejected; an undisclosed production resource mislabeled as QA cannot be discovered without platform metadata or a live check, which this task forbids. Do not treat mock tests as deployment ownership verification.

## Explicit shared read-only policy

No shared resource is approved by default. QA_SHARED_READONLY_SHEET_IDS (comma-separated IDs) can explicitly authorize selected sources for read access. LOCAL_SHARED_READONLY_SHEET_IDS is the analogous local option. Source binding must still be specified; the allowlist is not a fallback selection mechanism.

A selected canonical Sheet can be read only if explicitly listed. The low-level Sheet reader verifies permission before loading a service account/JWT. Training Sheet writers reject sharedReadOnly before requesting metadata or issuing writes. No Drive write, upload folder, OAuth credential or signature secret has a shared exception. Never use a production Sheet sync as a test even if its source is read-only: the destination could still be sensitive.

## Secret boundary

Select binding names by trusted environment; never compare QA and production secret values to infer environment. Errors/logs must not include secret values. The existing inbound authentication comparison still checks caller proof against the environment-selected secret. Administrators must issue distinct secrets and minimally scoped QA-only OAuth credentials; source-name separation cannot detect an operator copying the same secret into two bindings without comparing values.

Apps Script code is unchanged. A separately administered QA script must already verify the matching QA signature secret and dedicated Drive destination contract. Changing a Cloud binding does not update a script property, deploy script code, or prove the script avoids production Sheets. If its contract is not ready, leave the integration unconfigured and blocked. Local live GAS similarly requires a compatible explicit script deployment; no production fallback is supported.

## Fail-closed contract

ResourcePolicyError uses status 503 and a generic message. Fixed codes:

- ENVIRONMENT_UNRESOLVED
- QA_RESOURCE_MISSING
- RESOURCE_ENV_MISMATCH
- QA_GAS_REQUIRED
- QA_DRIVE_REQUIRED
- QA_SHEET_REQUIRED
- RESOURCE_MISSING (missing production/local resource)
- SHARED_RESOURCE_READ_ONLY

Raw URL, Sheet/folder ID, upstream body and SDK credential diagnostics are excluded from resource errors. Portal/student-care no longer return raw upstream debug bodies. Submission resources are checked after payload validation and before staff auth/storage/GAS calls. Training validates its workbook before auth and real QR/upload entrypoints validate required signature resources before auth. Staff-directory checks Sheet requirements before its default admin gate; dedicated Firebase-only subresources keep their own existing authorization contracts.

Production success behavior retains GAS, canonical Sheets, canonical Apps Script folders, existing secret names and OAuth bindings. Its normal workflow needs no new environment variable. Missing/invalid resources now consistently return 503. Managed cached OAuth requesters cannot switch environment without being rejected. Test-only service injection remains separate from production configuration.

## Cloud configuration checklist (names and required value types only)

Keep P0-1's explicit APP_ENV, expected QA_FIREBASE_PROJECT_ID and dedicated Firebase configuration/credential requirements. Then provide the needed QA_* names in the matrix from independently verified QA deployments, workbook IDs, private folders, distinct secrets and QA-only OAuth identity. Do not paste values into chat or this document.

QA_SHARED_READONLY_SHEET_IDS is optional and empty by default; approve each entry and scope read-only permissions explicitly. PRODUCTION_DRIVE_FOLDER_IDS is an optional non-secret denylist extension, not a new production requirement. Configure QA_TRAINING_QR_SECRET only for QR workflows. Never share upload/write destinations, private signature storage, submission/student-care/QR secrets or OAuth refresh credentials across production and QA.

No actual environment values, network settings, Apps Script properties or Cloud install/start configuration are changed in this patch. In particular, do not automatically run migrations/dry-runs/syncs to validate setup. The previous start instructions may need a separately authorized update after checkpoint review.

## Validation

Run P0-1 guard tests, resource-policy tests, browser retry tests, submission/TB/training/dashboard/admin regression tests, then npm test, npm run build, explicit production build and git diff --check. Existing QA fixtures now set APP_ENV=qa and explicit resource sources; preview/branch-only rejection tests remain. Test credentials/resources are synthetic. No real Firebase/GAS/Sheets/Drive access is needed or authorized.

This patch does not complete all QA Firestore collection-path work identified in stage 3. The CPR status reconciliation and other fixed collection adapters still need their own review. Production audit ledger, TB receipt/review/invalidation and training correction success response protection remain regression requirements.

## Patch file inventory

- `api/firebase/staff-directory.js`
- `api/firebase/student-care-sync.js`
- `api/health-room-status.js`
- `api/portal.js`
- `api/submit.js`
- `docs/CLOUD_QA_RESOURCE_ISOLATION.md`
- `server/healthMandatoryTrainingDryRun.js`
- `server/healthMandatoryTrainingExceptions.test.js`
- `server/lib/cprCertificateSubmissionStore.test.js`
- `server/lib/environmentResources.js`
- `server/lib/environmentResources.test.js`
- `server/lib/healthScreeningTypeApi.test.js`
- `server/lib/healthScreeningTypeStore.test.js`
- `server/lib/inbodyRequestStore.test.js`
- `server/lib/portalApi.test.js`
- `server/lib/portalContentCms.js`
- `server/lib/portalContentCms.test.js`
- `server/lib/portalRoadmap.js`
- `server/lib/portalRoadmap.test.js`
- `server/lib/qaCprSynthetic.test.js`
- `server/lib/qaInbodySynthetic.test.js`
- `server/lib/qaTbCertificateSynthetic.test.js`
- `server/lib/staffDirectory.js`
- `server/lib/studentSubmissionAuditStore.test.js`
- `server/lib/submissionConfig.js`
- `server/lib/submissionConfig.test.js`
- `server/lib/submissionWorkflows.test.js`
- `server/lib/tbCertificateSubmissionStore.test.js`
- `server/lib/tbRegistrationRequestStore.test.js`
- `server/lib/trainingAbsenceStatus.test.js`
- `server/lib/trainingCenter.test.js`
- `server/lib/trainingCenterApi.js`
- `server/lib/trainingCenterPhase2.test.js`
- `server/lib/trainingCenterPhase2Api.js`
- `server/lib/trainingCenterStore.js`
- `server/lib/trainingDeployment.js`
- `server/lib/trainingDeployment.test.js`
- `server/lib/trainingEventStore.test.js`
- `server/lib/trainingSignatureLedger.test.js`
- `server/lib/trainingSignatureLifecycle.test.js`
- `server/lib/trainingSignatureStorage.js`
- `src/App.jsx`
- `src/components/AdminAuthGate.jsx`
- `src/config.js`
- `src/lib/externalResourceLinks.js`
- `src/lib/portalContent.js`
- `src/lib/productionFallbackRemoval.test.js`
- `src/pages/AdminMessageHelperPage.jsx`
- `src/pages/AdminReceiptStatusPage.jsx`
- `src/pages/AdminRoadmapPage.jsx`
- `tests/fixtures/submissionResourceContext.js`
