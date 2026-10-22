# P0-4 phase 3: QA Apps Script internal resource boundary

Baseline: feature/cloud-qa-firebase-guard-p0 at 2087e1b1dfaa8b5440a64a776d4b50f3a0bcda2b. Implementation and offline verification only. No script project, deployment, property, trigger, credential or Google resource is created or modified by these files.

## Production resource audit (names and paths only)

| Existing production path in apps-script/Code.gs | Resource / decision |
| --- | --- |
| getSpreadsheet_ → SpreadsheetApp.openById | Fixed production SPREADSHEET_ID; do not copy the constant into QA |
| preflightSubmission_ → DriveApp.getFolderById | Canonical production CPR/TB/student destinations; QA payload previously selected an alternate folder but still opened the production workbook in CPR/TB preflight |
| backup validation → DriveApp.getFileById / getFolderById; backup integrity → openById | Source property can default to production workbook; exclude entire backup implementation from QA |
| testDriveAccess | Fixed production folder; omit from QA |
| syncStudentCareMonthlyAggregate_/PresencePublic_/PresenceHomeroom_ → UrlFetchApp.fetch | Callback getter defaults to a production Vercel endpoint; QA getter has no fallback |
| PropertiesService | Production/QA submission secrets, student-care secret, replay/rate records, sync/backup settings/status; QA uses dedicated project properties and QA names |
| setup/removeStudentCareProjectionTriggers; backup setup/removal | Installation, timed execution and deletion via ScriptApp; do not include these implementations in QA |
| onEdit and projection/backup scheduled handlers | Can change workbook data and start sync/backup; QA versions refuse execution |
| SpreadsheetApp.getActiveSpreadsheet | No occurrence in the audited production source; forbidden in QA bundle |

Production source and manifest remain byte-identical to baseline. No operational ID/URL or secret is copied into this document or the QA bundle. Known production identifiers are represented only by SHA256 denial fingerprints in Shared.gs. These are a denylist, not proof that arbitrary Google resource ownership is QA.

## Files and reuse

Deploy only apps-script-qa/Code.gs + Shared.gs + appsscript.json into NEW, QA-owned, separate script projects. Use one project per role/deployment (submission, portal, studentCare), not a production script version or an existing production project. Never include apps-script/Code.gs alongside these files.

Shared.gs contains 39 selected functions extracted from the unchanged production source: v1 HMAC/time/visitor verification, nonce/replay/rate reservation, file type/size validation, stable student-file reuse, portal/health-room schemas and projection payloads. tools/qa-gas/shared.mjs regenerates this source offline and records its upstream source hash. It uses the parser already present in the locked Vite dependency tree. Run node tools/qa-gas/shared.mjs --check to detect drift; no deploy or Google API is involved.

Explicit adaptations: select QA_STUDENT_CARE_PROXY_SECRET, route the three callback sends through qaFetch_, and preflight every sync function before data I/O. QA implements fresh resource-selecting entrypoints, not another receipt ledger or retry worker. Old source constants, automatic maintenance, backup and trigger APIs are not extracted. Selected upstream behavior is regression checked rather than silently edited in production.

## Script Properties (GAS settings, NOT new Node/Vercel env variables)

| Name | Required when / contract |
| --- | --- |
| APP_ENV | All roles; exact qa. Missing, production or unknown blocks |
| QA_GAS_ROLE | Exact submission, portal or studentCare; dispatch does not infer role from host/payload |
| QA_RESOURCES_VERIFIED | All roles; exact true only after administrator verifies ownership, ACL and production distinction. Attestation, not a live metadata query |
| QA_SPREADSHEET_ID | All roles; dedicated QA workbook, valid identifier, not known production fingerprint. Submission validates this declaration but does not open an unused workbook |
| QA_SUBMISSION_PROXY_SECRET | Submission role; at least 32 UTF-8 bytes; match QA_SUBMISSION_PROXY_SECRET on the server |
| QA_CPR_DRIVE_FOLDER_ID | CPR submission; exact same QA destination as server binding and signed payload |
| QA_TB_CERTIFICATE_DRIVE_FOLDER_ID | TB submission; same requirement |
| QA_STUDENT_REPLY_DRIVE_FOLDER_ID | Student reply submission; same requirement |
| QA_STUDENT_CARE_PROXY_SECRET | Student-care read/write/callback; at least 32 bytes; match QA server binding. Existing student-care shared-secret protocol is retained; it is not a new HMAC protocol |
| QA_CALLBACK_HOST | Callback actions only; exact reviewed QA Preview hostname under vercel.app, production canonical host forbidden |
| QA_STUDENT_CARE_SYNC_ENDPOINT | Callback actions only; exact HTTPS host plus /api/firebase/student-care-sync; no query, alternate path, credential, redirect or default |
| QA_FIREBASE_PROJECT_ID | Callback actions only; explicit nonproduction project. Must match the separately reviewed destination server project |

Portal reads require no upload folders, callback or submission/student-care secret. Student-care reads/confirmation require workbook and student-care secret, not Drive or callback. Callback actions preflight workbook, secret, project and endpoint before opening any workbook or sending a request, including direct sync helper invocation. No generic GAS_URL or production property is an accepted fallback.

The portal preserves the existing unauthenticated portal-content contract: use synthetic, intentionally public QA content only. Student-care requests retain the existing server-selected role/class and shared-secret contract; GAS is not a replacement for Firebase/API authorization. The submission role accepts only signed v1 QA firestore-mode CPR/TB/student-file payloads. Unsigned transition and production mode are rejected.

## Callback / Firebase boundary

Only qaFetch_ calls UrlFetchApp. It revalidates the complete QA callback configuration, accepts only the exact configured endpoint, and sets followRedirects=false. 3xx is a failure; redirects cannot carry the QA secret into a production endpoint. Raw upstream errors/debug/stack are not returned from QA web entrypoints.

No Firebase REST/admin credentials or direct Firebase endpoints exist in QA GAS. The QA project property and reviewed callback host cannot independently prove the remote server's project or inspect Vercel deployment environment. The destination must retain existing P0-1/P0-3 project/credential checks, and administrators must independently verify the alias/deployment SHA, APP_ENV, expected Firebase project and secret scope. A mislabeled unknown production resource cannot be discovered offline. Do not claim end-to-end isolation before this review.

## Upload and retry contract

Existing v1 envelope, 120-second window, UUID request ID, payload digest, HMAC, visitor/rate and script-lock rules are retained. Config/claimed environment/folder/signature validation precedes data APIs. Exact transport replay cannot create another file. Student replies preserve their stable QA submission filename and MIME/size conflict check, reusing existing evidence with a new valid transport ID.

Staff CPR/TB exactly-once recovery remains owned by the P0-3 server journal. GAS does not introduce a second receipt ID or automatically retry ambiguous uploads. If file creation succeeded but acknowledgement is lost, replay reservation remains; the server must hold unknown outcome for manual reconciliation. No claim of arbitrary lost-response automatic recovery is made. Existing production TB receipt/confirmation/invalidation and student audit are unchanged.

## Automation / scopes

QA contains no ScriptApp access or trigger-install/delete implementation. Known production edit/scheduled/backup entrypoint names throw QA_AUTOMATION_DISABLED after environment validation. Maintenance actions through doGet are forbidden. Unexported legacy handlers are absent. Even complete QA settings do not enable automation. Any future QA automation needs a separately reviewed bounded design and tests; do not copy production triggers.

The QA manifest omits script.scriptapp permission. Spreadsheet/Drive scopes remain broad because existing SpreadsheetApp/DriveApp APIs require them; runtime selectors do not narrow Google's IAM. Use a dedicated QA deployment account with no production workbook/folder sharing or elevated school access. App scopes, resource ACL, project properties and callback destination review are all required. Separate per-role scope minimization may follow; this shared manifest is not a claim of read-only OAuth privilege for the portal.

## Required resources and future setup (not performed)

- Three new QA script projects/deployments, a dedicated least-privilege QA deployment identity, synthetic workbook(s) with existing portal/health-room schemas, and the three private evidence folders.
- Set properties securely per role; do not store real values in Git or chat. Bind deployment URLs to existing QA_SUBMISSION_GAS_URL / QA_PORTAL_GAS_URL / QA_STUDENT_CARE_GAS_URL in the separately reviewed Preview configuration.
- Verify no inherited installable/time triggers, production OAuth grants, backup destinations or production resource sharing. Never remove/change production triggers.
- Review callback routing and dedicated Firebase project before enabling any manual QA sync. No callback, migration, sync, dry-run, backup, login or deployment is executed by local tests.
- Local tests are vm mocks plus the separate loopback Rules Emulator. Google Apps Script deployment/runtime semantics, ownership, deployed URLs, quotas, ACL and cross-service authorization remain unverified. Live QA stays blocked pending separately authorized resource provisioning and review.

## Executed local validation

| Check | Result |
| --- | --- |
| New VM-based GAS isolation tests | 28/28 PASS |
| Submission/Auth/Firebase/Firestore/server security subset including GAS | 299/299 PASS |
| Full ordinary suite | 606/606 PASS; zero failures/skips/cancellations |
| Local Firestore Rules Emulator | 218/218 PASS; zero failures/skips/cancellations |
| Normal / explicit production build | PASS / PASS; existing bundle-size warning |
| lint / typecheck | N/A; scripts absent |
| Generated shared-source drift check | PASS; 39 selected functions |
| Production Code.gs + manifest baseline byte comparison | PASS; unchanged |
| API Functions | 12; unchanged |

All 6 added files are QA source, an offline extraction/check tool, VM tests or this document. No existing tracked file is changed. No real API request, school data, environment/property write, trigger modification, deployment or Git mutation is part of this work. Checkpoint eligibility: YES for reviewed local code/mock/Emulator evidence; live QA and deployment remain BLOCKED pending independently verified QA resources and separate authorization.
