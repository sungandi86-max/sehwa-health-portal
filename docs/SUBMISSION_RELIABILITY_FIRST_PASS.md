# Submission reliability / CPR projection / exact review handoff

Baseline: cadb021e572a1ae9e5371923081d15a4c6c055fa. Local implementation only; no deployment, live resource access, data repair, migration or environment changes.

## Queries and scope

- Staff receipt management applies status equality before ordering/limiting. 50 records/page, one lookahead record and snapshot cursor; submittedAt descending then document ID descending. Next/first page controls are explicit. A direct submissionId uses getDoc and never substitutes another record.
- Count aggregation counts receipts matching the selected status, not teachers or completion eligibility. Counts and page reads are separate requests, not a point-in-time report; concurrent changes may change counts/page membership. Reload starts a fresh view.
- Submission overview pages current numeric-term active staff assignments, 25 accounts/page, ordered by assignment document ID. The target count is a count of eligible assignment ACCOUNTS, not distinct canonical staff IDs. Missing user profiles remain visible. Multiple accounts tied to one staff ID are not silently merged.
- For each displayed account, fetch only the latest receipt by UID and, when linked, canonical staffId. This includes admin-proxy originals. Compare exact timestamp seconds/nanoseconds and document ID deterministically. There is no 300-receipt or 300-user scan. Status/search filters and completion totals are explicitly CURRENT PAGE only, not all-school counts. Receipt totals separately include unlinked/proxy receipts.
- At most 26 assignment documents, 25 profiles and 50 one-document submission queries per overview page, plus the small existing submission catalogue and count aggregations; latest queries run in batches of five accounts. No new listener/full receipt download.
- The infection tab is outside this staff-submission change; its existing 50-record scope is now labeled explicitly.
- Existing valid originals require submittedAt. Firestore orderBy excludes malformed historical documents missing it. Count can therefore differ from pageable records if invalid legacy data exists; no live inspection, automatic timestamp repair or migration was done. Such evidence requires a separately approved non-destructive compatibility audit.

## Indexes / permissions / cost

firestore.indexes.json contains the required query definitions (five composite indexes). It is a review artifact: no Firebase configuration/deployment command has been added or executed. Before enabling the code in an authorized environment, compare these definitions with existing indexes and add only missing indexes; do not replace/delete unknown existing indexes. Real index readiness is NOT established by Emulator tests.

Composite queries cover status+submittedAt; itemId+UID+submittedAt; itemId+staffId+submittedAt; itemId+staffId+completed+submittedAt; current-term active staff assignments. Built-in descending document-ID ordering provides ties. Aggregate counts consume index reads and are billable; paging reduces document payload but does not make counts free. No data API is used to confirm production indexes here.

Rules are unchanged. Administrator role/assignment checks remain. Server Admin SDK guards remain independent of Rules.

## CPR contract

- Original individual receipts, attendance/signature ledger and private files are not combined or deleted. One existing staffId_taskId status remains the derived completion; no new ledger.
- Valid group completion has display priority over individual review, including completed/rejected/pending individual reviews. Reviewing an individual receipt still updates that receipt atomically. Rejection of one individual receipt can select another completed receipt; legacy completed projections without a known receipt ID are preserved conservatively until an explicit authoritative rebuild.
- Client review re-reads the source receipt in a transaction and rejects a stale prior status or changed subject. It checks another completed individual source before revocation. Projection revision increments without replacing a valid group event.
- Server status writes transact against the current projection. Original attendance success is retained when projection fails, with cprProjectionSynced=false. The attendee is told not to re-sign and to request administrator reconstruction. Admin corrections expose the same distinction.
- Existing training-attendance-correct gains reconcile-cpr: health teacher/admin only, current directory subject and event ownership checked. It rebuilds from current original signatures and receipts, writes only the existing status, and never uploads, appends or signs. It uses staff-scoped signature reads, not a download of every employee's signatures. Existing Sheet target dependencies remain.
- Rebuild checks the pre-read projection and receipt snapshots in the transaction. The real store verifies the current active signature pairs in that same transaction. A cancelled/replaced/new concurrent signature causes rejection/retry, rather than writing stale derived state. Normal group projection verifies its committed signature IDs are still active before writing.
- Additive existing-document metadata: cprProjectionRevision and evidenceSubmissionId on the projection; completionTaskId on training events. Existing training inner keys, status strings, collection names and original documents stay compatible. No data backfill is required or executed.
- New education defaults to explicit none, with an administrator choice for cpr-training-2026. Old events with no binding retain the legacy title classification. Editing an event with signature history cannot change its completion binding through the API; historical recategorization is a separate review, not an automatic migration. The existing 17 Sheet fields and Apps Script are unchanged.

## TB and exact links

- Submission overview links use the actual stored submission document ID, without a state filter. Management fetches that exact record under existing Rules.
- An annual TB original links to the existing panel with canonical staffId, schoolYear, submissionId and document type. These parameters select the view only, never grant authority. The panel focuses the subject and pending receipt. Server confirmation now also checks that the supplied subject matches the receipt before transaction writes.
- Explicit QA runtime policy enables the existing type panel in Preview; hostname alone is not new authorization. A QA notice states that production evidence workflow is unavailable. Its review controls stay disabled; the production-only API guard is unchanged. QA type storage remains isolated.
- Existing source/review/discrepancy/history behavior, partial-success receipt protocol, invalidation and evidence reuse are retained. No upload is initiated by navigation.

## Before live QA / production

Required: authorized isolated QA resources and Auth, verified index readiness, deployment routing validation, synthetic tests of new pagination/direct TB routes, and separate live API permission review. Production TB confirmation has not been enabled in Preview. Existing historical assignments/missing timestamps/legacy CPR classification were not inspected or repaired.

## Executed local validation

- Related query/navigation/QA-panel/CPR/training/TB/project-guard tests: 132/132 PASS.
- Full ordinary suite after final changes: 636/636 PASS, zero failures/skips.
- Firestore Rules Emulator: 220/220 PASS; includes existing 219 and an added admin query/count/CPR transaction permission boundary. Rules unchanged. Emulator does not enforce production composite-index readiness.
- Existing real Chromium mock-browser regression: 53 + 7 = 60 PASS. This is synthetic SDK/HTTP coverage of existing access/training fixtures, not live Firebase/Vercel or exhaustive browser coverage of the new paginated admin/TB panels. The checkpoint-final Chromium validation additionally exercises the real admin submission/status/TB components in seven synthetic scenarios; live Firebase/Vercel integration remains pending.
- Normal and explicit production build PASS; existing chunk-size warning. lint/typecheck N/A (undefined scripts).
- Tracked/new-file whitespace PASS; secret-pattern additions detected 0; 12 API Functions; no staged files, commit or push.
- No real Firebase/Google/Apps Script call, real login, deployment, migration or data modification. Local fixture server and Emulator stopped.

## Changed files

- common/cprProjection.js
- common/firestoreResources.test.js
- docs/SUBMISSION_RELIABILITY_FIRST_PASS.md
- firestore.indexes.json
- server/lib/cprProjectionRecovery.test.js
- server/lib/cprTrainingStatus.js
- server/lib/tbScreeningWorkflow.test.js
- server/lib/tbScreeningWorkflowApi.js
- server/lib/tbScreeningWorkflowStore.js
- server/lib/trainingCenter.js
- server/lib/trainingCenterPhase2.js
- server/lib/trainingCenterPhase2.test.js
- server/lib/trainingCenterPhase2Api.js
- server/lib/trainingCenterStore.js
- server/lib/trainingEventStore.js
- server/lib/trainingEventStore.test.js
- server/lib/trainingSignatureLedger.js
- src/components/HealthScreeningTypeAdminPanel.jsx
- src/lib/adminSubmissions.js
- src/lib/healthScreeningTypes.js
- src/lib/healthScreeningTypes.test.js
- src/lib/submissionNavigation.js
- src/lib/submissionNavigation.test.js
- src/lib/submissionQuery.test.js
- src/lib/submissionStatus.js
- src/pages/FirebaseAdminSubmissionsPage.jsx
- src/pages/FirebaseStaffSubmissionStatusAdminPage.jsx
- src/pages/FirebaseSubmissionStatusPage.jsx
- src/pages/FirebaseTrainingAdminPage.jsx
- src/pages/FirebaseTrainingAttendanceAdminPage.jsx
- src/pages/TrainingAttendancePage.jsx
- tools/firestore-rules/matrix.mjs

## Checkpoint-final browser and index audit

New reproduction: start `node tools/browser/serve.mjs`, run `python3 tools/browser/check_submissions.py`, stop the server. Existing `check.py` and `check_extra.py` remain separately runnable. The standalone fixture replaces only test SDK imports; production Vite has no test-mode switch. Browser aborts every non-loopback request, intercepts local API responses, and seeds no real credentials or identities.

Seven browser scenarios: pending receipts 122 across 50/50/22 rows without omission/duplication and correct total/page labels; exact TB ID ignoring unrelated status filters and retaining staff/year/type (including read-only historical year); 32 target accounts across 25/7 pages without duplication and exact receipt handoff; actual client transaction preserving group event through individual completion/rejection; attendance-success/projection-pending display and administrator reconstruction request with only one signature submission; missing-index errors on both receipt and target pages (direct getDoc still works); denied staff access to a known admin receipt ID. Browser reconstruction response is mocked; real server reconstruction/CAS/active-original checks are covered separately by server mock tests, not falsely claimed as a live browser/backend integration.

`submissionQuery.test.js` validates the five index definitions against actual executed helper query descriptors and checks internal duplicates. Each definition is used. Equality-field order may differ textually in a query but all equality fields are covered; ordering fields and directions match. Existing equivalent remote indexes could satisfy a query. No remote inventory/READY status is known, and no index is created/deployed.

| Definition | Covered query | If no usable index is READY |
| --- | --- | --- |
| 1 staff_submissions: status ASC / submittedAt DESC / name DESC | filtered receipt list | status-filtered management fails explicitly; unfiltered built-in ordering and direct ID are separate paths |
| 2 staff_submissions: itemId ASC / submitter.uid ASC / submittedAt DESC / name DESC | latest receipt by account | submission-status page fails rather than calling an incomplete result missing |
| 3 staff_submissions: itemId ASC / staffId ASC / submittedAt DESC / name DESC | latest linked/proxy receipt | linked target status page fails; no UID-only fallback |
| 4 staff_submissions: itemId ASC / staffId ASC / status ASC / submittedAt DESC / name DESC | other completed individual CPR sources | canonical CPR review fails before receipt/status writes; attendance/rebuild use other queries and are not certified by this index |
| 5 user_assignments: schoolYear ASC / semester ASC / active ASC / roles CONTAINS / name ASC | paged target assignments and count | target page/count fails; no capped roster fallback |

The five definitions are not redundant within this file: in particular index 4 cannot replace index 3 for a cross-status latest query because status is then unbound before the ordering fields. Repository baseline contains no other index configuration; remote duplication remains UNKNOWN. Firestore Emulator does not enforce production composite indexes. Count requests and reads are separate snapshots; no point-in-time cross-page report is claimed under concurrent live writes.

Additional checkpoint-validation files: tools/browser/entry.jsx, tools/browser/fixtureFirebase.js, tools/browser/submissionFixture.js (new), tools/browser/check_submissions.py (new), src/lib/submissionQuery.test.js, this document. No additional production functional source correction was needed during browser validation. Initial selector/mock-flag test harness issues were corrected without changing production behavior.

Live OAuth/Firebase login, real Rules/project integration, Drive storage, Google resource signatures, Vercel routing and actual index READY verification stay BLOCKED. Index definitions must be compared with each project's existing inventory by an authorized operator, missing equivalents prepared, and readiness confirmed before a separately authorized rollout. No full-file replacement of unknown deployed indexes, data repair or migration is authorized by this checkpoint.
