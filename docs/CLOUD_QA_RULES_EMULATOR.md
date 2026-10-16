# Current P0-3 phase 2 hardening result — local validation PASS

The previous blocked/baseline report is retained below as history. This section supersedes its current-result statements.

## Minimal security changes

- `hasCurrentAssignmentIntegrity` validates canonical current-path UID against request.auth.uid, numeric schoolYear=2026 and numeric semester=2, with required keys. No missing defaults, string coercion or document repair is performed. These constants match the existing `_2026_2` path contract.
- All four existing role predicates (health teacher, health teacher/admin, public staff and homeroom) require this integrity check; existing active=true and role membership remain, with explicit list typing for roles.
- New CPR original creation requires approved current staff authority before the existing own-staffId/file/submitter checks. Inactive, unapproved, anonymous and foreign-subject creates are denied. Existing historical own reads, admin review, delete denial and status values are unchanged.
- TB's direct assignment lookup also checks identity/term integrity. Its existing active-state create contract is deliberately unchanged; changing inactive TB behavior is a separate policy decision. Student audit ledgers, TB approval/invalidation and training correction success logic are untouched.

## Executed results

| Check | Result |
| --- | --- |
| Official Emulator 1.19.8 cached artifact SHA256 | PASS; same pinned checksum |
| Emulator role/resource matrix | 184/184 groups, 920/920 operations PASS |
| Previous four failing safety tests | 4/4 PASS (all denied) |
| Complete Emulator suite | 217/217 PASS; zero failures/skips/cancellations |
| Additional normal/adversarial groups this step | 25/25 PASS |
| Server + P0-1/P0-2/P0-3 security mock subset | 178/178 PASS |
| Full ordinary tests | 523/523 PASS; integration suite remains separate |
| Normal / explicit production build | PASS / PASS |
| lint / typecheck | N/A; scripts absent |
| git diff --check | PASS |

All 184 baseline groups remain. The one revoked CPR create expectation changes from ALLOW to DENY because it was the confirmed security defect; its historical read/list expectations remain unchanged. No group or assertion was removed to obtain PASS.

Additional tests pair malformed UID/year/semester (including combined mismatches), missing keys, incorrect field types, inactive/missing approval and unrelated roles with the same request after restoring a valid assignment. All four role predicates are exercised, as are CPR foreign-subject rejection, existing original/status preservation and TB's direct identity lookup. The original synthetic QA identity groups still gain no approved staff/admin authority.

## Server authorization boundary

Admin SDK bypasses Rules. Existing mock API tests separately cover manager denial, target scope, production-only QA/unknown rejection, project-bound injected DBs and workflow transitions. A new submission guard mock test confirms foreign UID, inactive and unrelated-role denial plus zero reads with an injected mismatched project.

Server code was not changed in this Rules-focused step. Remaining independent gap: the generic submission identity helper still permits a missing assignment UID and does not explicitly revalidate stored year/semester; training access has a separate injected-DB validation follow-up. This Emulator success does not resolve those server boundaries or constitute complete API authorization approval.

## Production compatibility and deployment hold

Valid current assignments and existing approved roles pass the matrix. Collection names, stored document schema and original review/status contracts are unchanged. Self profile/access requests, signed-in historical own-submission reads and recruit self-service were not tightened.

Historical operational assignments missing UID/year/semester, using strings instead of numbers, or stored at a mismatching current path will lose role-derived access under the hardened Rules. No production documents were read, so their actual prevalence is unknown. Deployment is on hold pending an authorized compatibility review and resolution of independent server risks. Do not run a repair migration automatically. Future term rollover must update both path constants and matching term checks with regression tests.

## Required production compatibility audit before any deployment

This is a future plan only. No production read, export, migration, dry-run or repair was executed for this checkpoint. Rules deployment remains on hold.

### Exact fields evaluated by the hardened Rules

| Field | Required type/value at user_assignments/{auth.uid}_2026_2 |
| --- | --- |
| uid | string, exactly request.auth.uid and the UID segment of the current path |
| schoolYear | Firestore number (integer or double), numeric value exactly 2026; string "2026" is rejected |
| semester | Firestore number (integer or double), numeric value exactly 2; string "2" is rejected |
| active | boolean true for role-derived authority and new CPR creation; absent/false/string values do not grant approval |
| roles | list containing the applicable existing role string; health_teacher, admin, staff and homeroom predicates retain their existing membership sets |
| staffId | new CPR payload requires a string exactly matching the current approved assignment's staffId; existing schema/subject checks remain |

Homeroom operations retain existing grade/classNo and matching-class conditions. No user profile field or client claim replaces assignment approval. This integrity helper is not a complete replacement for the separate assignment-write schema validator. TB direct creation adds UID/term integrity but retains its existing active-state contract.

Potentially affected records: missing/null/wrong-type UID/year/semester; foreign UID under a current path; stale year/semester under `_2026_2`; string years/terms; malformed role lists; inactive or incomplete assignments previously accepted for CPR create. A currently valid original submission need not be modified: only authorization from its caller's assignment changes. Inactive users' existing own-original read contract remains.

### Non-destructive audit plan (separate authorization required)

1. Obtain explicit approval for a bounded production read and its identity, current-term scope, retention and responsible operator. Do not use broad school-data exports or live application workflows for this audit.
2. Inspect only assignment document path and required authorization fields, using read-only field projections where supported. Exclude names, emails, student data, submission evidence and Drive references. Compare canonical UID/path and numeric term types without coercion. Examine old-term documents only if a separately approved scope requires it.
3. Report aggregate counts by defect type and access impact in a restricted review artifact. Do not commit raw records or identifiers. Distinguish intentionally inactive users from malformed records; never activate a user or infer a role from a display name.
4. If no incompatibilities exist, review synthetic Emulator coverage and independent Admin SDK gaps before requesting separate Rules deployment approval. If incompatibilities exist, hold deployment and prepare an exact proposed per-document change set; the audit itself writes nothing.

### Separate approval, backup and recovery for any eventual data repair

- Require explicit approval for the specific repair set, environment, operator and maintenance window. Migration and dry-run commands each need their own authorized scope; none are authorized or run by this checkpoint.
- Before approved writes, preserve an access-controlled, encrypted backup of the selected original documents including paths, original field types, updateTime and the deployed Rules version. Verify backup readability and a restoration rehearsal against synthetic data. Never put exports/credentials in Git.
- Review proposed values against the authoritative identity/term mapping. No automatic defaults, UID guessing, broad string conversion, role expansion or account activation. Use update-time preconditions and a bounded canary; abort on concurrent changes, mismatches or failed validation.
- On failure, stop further writes. Restore only the approved affected documents from backup with concurrency checks under a separately approved recovery procedure; do not overwrite unrelated records. Review any Rules rollback separately because it can reintroduce these four security defects.
- Record sanitized audit results and revalidate permissions using synthetic tests plus separately authorized production checks. Destroy temporary sensitive artifacts under the agreed retention policy.

Existing eight assets were retained. Only matrix tests and this report were intentionally extended within those assets; the six remaining files are byte-identical to the start of this task. Additional repository changes are firestore.rules and server/lib/tbSubmissionGuard.test.js. No UI, Apps Script or server runtime logic changed. Validation involved no deployment, real login, Firebase/Google data API request or school data access. Checkpoint commit/push is a separate requested action and does not approve deployment. The Emulator and temporary data were cleaned up; the verified JAR remains cached outside the checkout.

Checkpoint readiness: YES for this local Rules-security checkpoint; NO deployment approval.

---

# P0-3 phase 2: local Rules authorization verification

## Current result: BLOCKED

Baseline: feature/cloud-qa-firebase-guard-p0 at d3fef1f82916324bb5dbcf8b3bbc68eb3feef519. Clean start; origin divergence 0/0; main/qa remote heads preserved.

Java 21 is installed. @firebase/rules-unit-testing 5.0.0 was installed with its Firebase 12 peer contract and npm lockfile integrity checks. firebase-tools 14.27.0 was installed outside the checkout to obtain the official emulator artifact metadata. The official Firestore Emulator 1.19.8 JAR download returned **403 Domain forbidden** at storage.googleapis.com. No alternate host/proxy bypass or disabled verification was used.

`npm run test:rules` was actually executed and failed with `EMULATOR_JAR_REQUIRED`. No Emulator process or fixture database started. The matrix below is **expected behavior from static Rules analysis, not an executed PASS**. Its cases have syntax checks only. First real execution may expose fixture errors and Rules defects; both must be investigated rather than changing expected outcomes to force green tests.

No firestore.rules, application authorization logic, collection names, operational data structures or UI were changed. Existing Rules and production runtime logic remain byte-identical to the checkpoint.

## Reproduce after provisioning the official artifact

1. Allow the official binary download destination `storage.googleapis.com` in the cloud network settings, or supply the verified official artifact through an approved file mechanism. This permission is for tool installation; it does not authorize access to Firebase projects or Google data APIs. No cloud configuration was changed by this task.
2. Obtain cloud-firestore-emulator-v1.19.8.jar from the official firebase-preview-drop/emulator artifact directory. Keep TLS verification enabled. Expected SHA256: `9d43599ed6151199e8d604dc87fac51218e49e5f3a48519b1ae560bbe5e3382d` (firebase-tools 14.27.0 metadata).
3. Use repository Node 22 and Java 21. Run `npm ci` when restoring dependencies.
4. Run `FIRESTORE_EMULATOR_JAR=/absolute/path/cloud-firestore-emulator-v1.19.8.jar npm run test:rules`.

The runner never downloads binaries, logs into Firebase, discovers a project, runs CLI deploy commands or loads .firebaserc/.env. It verifies SHA256 before spawning Java, binds 127.0.0.1 on a dynamically allocated port, uses the fixed project `demo-sehwa-rules-local`, and passes no Firebase/Google credential variables to children. Proxy/CA variables are retained; loopback stays local. The rules-unit-testing library uses unsigned synthetic contexts directed explicitly to this local host/port, not real Firebase Auth.

Rules, logs/data and HOME are temporary. The test framework clears synthetic Firestore documents and disposes apps; the runner terminates its own processes and removes its temporary directory in finally. SIGINT/SIGTERM also trigger shutdown. A completed matrix writes a report to `/tmp/sehwa-firestore-rules-results.json`; TAP output preserves test totals. Missing Java/JAR, checksum errors, invalid endpoint/project, startup failures and test failures return nonzero. There is no skip-as-success path.

`npm test` runs ordinary mock tests and runner safety tests. It deliberately does not auto-discover the integration matrix; the latter is a separate required `npm run test:rules` check and must never be reported as covered by a green npm test.

## Fixture identities

A unauthenticated; B pending registration with no approved assignment; C staff A; D staff B; E health_teacher; F admin; G inactive QA-only admin fixture under user_assignments_qa; H revoked staff assignment (active=false).

The actual Rules use user_assignments/{uid}_2026_2, active and roles. They do not authorize using users.active or an admin custom claim. No fictitious qa_admin role or approval claim was introduced. G uses the existing admin role in a separate inactive QA assignment to prove that a QA label alone confers no normal staff/admin authority. It does not provision a synthetic QA admin login or assert that such an account already exists.

## Expected matrix — all Emulator results BLOCKED

Legend: O = get + correctly constrained own list; R = get/list within existing authorized scope; C = create valid own record; U = update only allowed fields; none = deny all. Delete is denied for every listed resource and identity, including managers. Query authorization is tested separately from point reads.

| Resource | A | B | C/D | E health | F admin | G QA inactive | H revoked |
| --- | --- | --- | --- | --- | --- | --- | --- |
| staff_submission_status | none | none | O | R,C,U | R,C,U | none | none |
| staff_submission_status_qa | none | none | O | R,C,U | R,C,U | none | none |
| staff_submissions | none | O | O,C | R,C,U | R,C,U | O | O,C (*) |
| staff_submission_tasks | none | none | R | R | R | none | none |
| users | none | O,C,U | O,C,U | R + own C,U | R + own C,U | O,C,U | O,C,U |
| user_assignments | none | O | O | R,C,U | R | O (**) | O |
| access_requests | none | O,C | O,C | R,C,U | R,C,U | O,C | O,C |
| student_care_presence_public | none | none | R | R | R | none | none |
| student_care_presence_homeroom | none | none | none | R | R | none | none |
| student_health_submissions | none | none | none | R,C,U | R,C,U | none | none |
| training_events, training_events_qa, training_events_production | none | none | none | none | none | none | none |
| training_signature_ledger, training_signature_ledger_qa, training_signature_ledger_production | none | none | none | none | none | none | none |
| student_submission_audit_qa / production, tb_certificate_submissions_production | none | none | none | none | none | none | none |

(*) Static baseline CPR/TB create validation checks assignment staffId but does not explicitly require active=true. The matrix separately includes a stricter safety requirement that revoked users cannot create new CPR evidence. This likely conflicts with current Rules and needs actual Emulator evidence before modification.

(**) Signed-in identities can read the own canonical assignment path (including a missing document); this does not grant access to user_assignments_qa or make an inactive QA assignment approved.

Existing signed-in self-service exceptions are preserved and must not be mislabeled as staff authorization: own users profile; own access request and rejected-request resubmission; own historical original submission. A recruit request also has an explicit signedIn-only create contract. Whether revoked users should lose historical/self-service access is a policy question; it was not inferred or changed.

The default-deny cases also include signature and history subcollections. Extra cases cover staff A reading staff B originals; unconstrained status list rejection; homeroom current class get/list/infection create and foreign class denial; stale assignment paths; training_admin not granting health/admin rights; expected denial for current-path documents with foreign UID/year/semester; and server-only ledger denial even for managers. `_qa` is a path name, not a project identity assertion. Emulator fake token audience is synthetic; no production-project authentication was performed.

## Static risks requiring actual Emulator confirmation

1. The current role predicates check existence, active and roles, but not uid/year/semester equality inside a document placed at the current path. Three explicit safety tests require denial of malformed current assignments. Do not claim those tests passed.
2. Revoked CPR/TB evidence create may still pass a matching staffId check. A separate safety test requires new evidence denial. Do not change Rules based solely on this analysis while the Emulator is blocked.
3. The Rules do not enforce qaExpiresAt on ordinary active canonical admin assignments. Inactive/revoked records are the supported revocation boundary. A fabricated active canonical admin record is not a safe way to model a QA-only identity. No automatic-expiration contract was invented.
4. Rules are bypassed by Admin SDK. Server project validation/role/target checks remain independently mandatory. Training access's injected DB boundary remains a documented P0-3 follow-up; existing API mocks are not proof that every server entry is covered.

## Server mock verification scope

Run the existing healthScreeningTypeApi, tbScreeningWorkflow, trainingCenterAccess, trainingCenterPhase2, studentSubmissionAuditApi, cprCertificateAuditApi, tbCertificateAuditApi, common/firebaseEnvironment, common/firestoreResources and environmentResources suites. These exercise denied administrator requests, foreign staff self scope, training ownership, QA/unknown production-only rejection, injected DB project mismatch and fail-closed resource resolution. All SDK/API adapters in these tests are mocks. Rules results must not be presented as Admin authorization results.

## Next step: submission persistence and retry recovery

Keep browser originals and server audit/status writes in the same validated project/resource contract. Define a stable idempotency key, authoritative receipt owner, partial-success response, retry lookup and bounded reconciliation behavior before changing storage. Retries must not duplicate Drive uploads or audit entries, reopen approved/rejected/invalidated TB evidence, erase group-CPR completion, or turn successful training corrections into failures. Cover server success/browser failure, response loss, duplicate retry and concurrent retry using mocks first. No migration or live recovery job should run automatically.

## Execution evidence for this task

| Check | Result |
| --- | --- |
| Official JAR installation | BLOCKED — 403 Domain forbidden |
| npm run test:rules | BLOCKED — missing verified JAR; nonzero exit, no fixture writes |
| Matrix syntax check | PASS — syntax only, not authorization behavior |
| Runner safety unit tests | PASS — 9/9 |
| Server mock + P0-1/P0-2/P0-3 security subset | PASS — 183/183 |
| Full ordinary suite | PASS — 522/522 (513 existing + 9 runner safety; matrix excluded explicitly) |
| Normal / explicit production build | PASS / PASS; existing chunk-size warning |
| lint / typecheck | N/A — no scripts in repository |
| git diff --check | PASS |
| Rules changes | None |
| Emulator fixture writes / processes launched | 0 / 0 |
| Live Firebase/Google data API access / school data access | 0 / 0 |
| Commit / push / PR / deploy | 0 / 0 / 0 / 0 |

Package downloads and one rejected official binary-download attempt are tool installation traffic, not Firebase/Google data API validation. No assertion of live QA readiness is made. Emulator authorization verification remains BLOCKED.
