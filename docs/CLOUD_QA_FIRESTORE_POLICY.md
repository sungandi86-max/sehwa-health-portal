# P0-3 phase 1: Firestore contracts

This change is local code/mock validation only. No Rules deployment, live Firebase/Google access, migration, synchronization, or dry-run execution is part of validation.

## Environment and project boundary

The server reuses `firebaseRuntimePolicy`: explicit `APP_ENV` plus platform consistency; `VERCEL_ENV=production` retains the existing production default. Preview, branch names, hostnames and client claims do not grant QA authority. Client policy comes from the server-side Vite build definition, not request input. Unknown environments are rejected.

`validateFirestoreDb` checks public `db.app.options.projectId` and Admin `db.projectId` metadata. At least one must be identifiable; every available identifier must pass the existing P0-1 project validator. QA/local require the configured non-production `QA_FIREBASE_PROJECT_ID`; production retains the pinned production project. There is no test bypass or production default for unidentifiable DB objects.

Validation runs after client/Admin `getFirestore`, on every Admin DB acquisition including SDK cache reuse, and before selected client/server helpers call Firestore. Credential validation remains in the existing Admin initialization guard; DB metadata validation does not replace service-account validation. Injected DBs must carry realistic public project metadata.

## Resource contracts

| Key | Type | Production | QA |
| --- | --- | --- | --- |
| submissions | projectScoped | staff_submissions | staff_submissions in QA project |
| tasks | projectScoped | staff_submission_tasks | staff_submission_tasks in QA project |
| statuses | environmentScoped | staff_submission_status | staff_submission_status_qa |
| assignments | projectScoped | user_assignments | user_assignments in QA project |
| syntheticAssignments | environmentScoped | blocked | user_assignments_qa |
| productionTbEvidence | productionOnly | tb_certificate_submissions_production | blocked |

Local uses an explicitly validated non-production project and the existing QA status collection name. Synthetic assignments remain QA-only. A resource name override must exactly match the policy-selected name. Unknown resource keys, absent environment mappings, and QA productionOnly access fail before collection access. This registry is intentionally limited; it is not a claim that every repository collection has been migrated.

## Reader and writer alignment

- Browser CPR/recruit originals, admin submission readers/review writers, dashboard and submission overview use `submissions`.
- CPR reconciliation reads `submissions` and writes `statuses` using the same DB/context. Group CPR processing uses the same status writer.
- Staff self-status, admin status overview/manual update, submission endpoint CPR/TB status updates, TB completion guard, and mandatory-training snapshots select `statuses` from the same contract.
- QA TB certificate responses retain the audit receipt ID. The QA browser path records the existing original-submission schema in QA project's `staff_submissions`, enabling the existing original reader; production keeps its server-owned receipt workflow. The upload adapter forwards the existing schoolYear input instead of dropping it.
- No status enum, approval/rejection meaning, document ID convention, or production document schema is changed. Existing completed group-CPR protection remains.
- Research/staff Sheets still pass P0-2 `sheetResource` preflight. This workflow additionally rejects canonical production Sheet IDs in QA/local even if the general P0-2 shared-read-only allowlist includes them; other P0-2 workflows retain their policy.

## Authorization layers and limits

Client Rules and Admin SDK authorization are separate. Admin bypasses Rules; the existing authenticated server role checks and project guards remain necessary. Policy helpers select resources, not roles.

The production Rules blocks are unchanged. The added QA status block preserves the production admin write checks, staff's own staffId read condition, payload validation and delete denial, with an additional non-production token audience condition. Firebase validates the token audience against the actual project's authentication boundary; the inequality alone does not configure a trusted QA project. Deploy and validate this Rules file in the separately provisioned QA project before live use. No Rules were deployed here.

Synthetic QA identities deliberately have inactive, separate assignments. This phase does not widen normal client Rules to grant those identities staff/admin access. Browser end-to-end tests using synthetic identities remain blocked unless a separate, narrowly scoped authorization design is approved. Mock contract tests do not prove Rules authorization.

QA TB original persistence remains a separate browser write after server audit/status persistence, as is the existing browser CPR original flow. A browser/Rules failure can leave an audit/status without its browser original; errors are surfaced, with no production fallback. Atomic receipt persistence/retry reconciliation is a remaining follow-up, not verified live behavior.

## Required configuration and safe validation

Reuse P0-1 bindings: APP_ENV, QA_FIREBASE_PROJECT_ID, FIREBASE_PROJECT_ID, the existing explicit service-account source, and VITE_FIREBASE_* settings. No new production variable is required. P0-2 QA GAS/Sheet/Drive bindings remain mandatory for their respective workflows. Do not put real values in this document.

Offline tests cover project-scoped names in QA, QA status names, productionOnly rejection, unknown environment, injected/mixed/cached DBs, zero Firestore calls on blocked helper paths, client initialization DB validation, actual browser submission/status functions with replaced SDK/API, CPR reconciliation/group writes, and production names. Existing suites protect TB workflow, admin authorization and training correction success responses. Rules checks are static; a Firestore emulator authorization matrix and dedicated-project live QA are still required.

Next scope: move selected certificate/audit stores and production-only TB store boundaries onto the policy; validate training access injected DBs before their first read; separately analyze student-care/audit, infection, users/access requests, training events/signature ledgers. Preserve the production student audit ledger and TB receipt/confirmation/invalidation contracts. Never run operational transfer scripts automatically.

## Changed files

- `api/submit.js`
- `common/firebaseEnvironment.test.js`
- `common/firestoreResources.js`
- `common/firestoreResources.test.js`
- `docs/CLOUD_QA_FIRESTORE_POLICY.md`
- `firestore.rules`
- `server/healthMandatoryTrainingAnalysis.test.js`
- `server/healthMandatoryTrainingDryRun.js`
- `server/lib/cprTrainingStatus.js`
- `server/lib/firebaseAdmin.js`
- `server/lib/firestoreResources.js`
- `server/lib/qaCprSynthetic.test.js`
- `server/lib/qaInbodySynthetic.test.js`
- `server/lib/qaTbCertificateSynthetic.test.js`
- `server/lib/tbScreeningStatus.js`
- `server/lib/tbScreeningStatus.test.js`
- `server/lib/tbSubmissionGuard.js`
- `src/lib/adminSubmissions.js`
- `src/lib/dashboardSummary.js`
- `src/lib/firebaseInitialization.js`
- `src/lib/firestoreResources.js`
- `src/lib/firestoreSubmissionContract.test.js`
- `src/lib/healthScreeningTypeIntegration.test.js`
- `src/lib/staffSubmissionStatus.js`
- `src/lib/staffSubmissionStatusAdmin.js`
- `src/lib/staffSubmissions.js`
- `src/lib/submissionStatus.js`
