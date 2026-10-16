# P0-3 phase 3: staff receipt persistence and recovery

## Scope and existing flow

CPR and TB certificate file submissions now use a server-owned receipt protocol. Registration (tb_registration), Inbody, student replies/infection and training correction flows are not migrated by this change. No Apps Script code is changed.

Before: the API authenticated staff, forwarded a signed GAS upload, wrote the certificate audit and status, and returned success/error. CPR also created a random-ID browser original; QA TB created a browser original after the response. An audit/status failure could appear as complete submission failure. CPR audit IDs were random. Production TB already had a stable content/scoped identity, idempotent audit create, canonical server original, and review/invalidation transactions.

After:

1. Resolve the existing trusted environment and GAS/secret/Drive policy; authenticate canonical staff. Validate actual injected DB project using P0-1/P0-3 helpers before journal/data/GAS access.
2. Resolve stable receipt identity. Reserve upload ownership transactionally in the server-only journal.
3. Upload once through the existing signed GAS contract. Persist the confirmed file ID before subsequent receipt work.
4. Create/read the stable certificate audit (authoritative original receipt); create the existing staff_submissions original projection without replacing an existing reviewed document.
5. Update the environment-selected status separately. Read the latest original/audit/status in a transaction before CPR/QA-TB status writes. Production TB calls the existing recordProductionTbReceipt unchanged.
6. Return confirmed receipt and synchronization state. The browser no longer writes another CPR/TB original.

Existing admin original review remains in adminSubmissions; the server rereads its current state. Self/admin status readers retain their existing selected ledgers. This change does not invent a new approval enum or alter TB confirmation/invalidation, production student audit, or training correction success-response logic.

## Identity and concurrency

Production TB reuses productionTbSubmissionIdentity exactly (canonical staffId/year/checkup/document/mime/content digest/self-vs-proxy/proxy actor/request intent). Its existing subject/actor and duplicate-warning contracts are retained. CPR and QA-TB use a hash of explicit environment, type, canonical staffId, authenticated UID, year, relevant submission metadata, mime, decoded-file SHA256 and optional requestId. File names and arbitrary client staffId do not identify a receipt. A foreign top-level staffId is rejected.

The browser retains one requestId per payload/UID/content fingerprint until the server confirms both receipt and sync; once a receipt ID is known, retries send only resumeReceiptId (and an optional scoped recovery proof), not file bytes. The server restores the validated request descriptor from its journal only after checking environment, type, staffId and authenticated owner UID; it survives response loss, transient errors and reload via sessionStorage (memory fallback if storage is unavailable). A subsequent acknowledged new intent gets a new ID. Old clients without requestId use content/scope identity. Production TB self-submission intentionally retains its existing content-based deduplication even if a client sends a new requestId; a changed file/meaningful submission is independent.

The journal resources are staff_submission_receipts_qa and staff_submission_receipts_production. Transactions grant only one upload owner. Concurrent duplicates return UPLOAD_OUTCOME_PENDING and never issue another GAS request. Post-upload audit/original creates are atomic/idempotent by ID; repeats do not reset existing reviewed records. Synced retries only inspect current state and perform no new upload/original/status writes.

## Recovery stages and response contract

| Outcome | Server response / recovery |
| --- | --- |
| GAS result confirmed, file checkpoint fails | 503 UPLOAD_CHECKPOINT_PENDING; receiptSaved=false, retryable=true, scoped recoveryToken; same intent resumes without upload |
| File persisted, certificate audit create fails | 503 RECEIPT_SAVE_PENDING; reuse journal file on retry; lost create acknowledgement is resolved by reading the stable audit |
| Audit receipt saved, original projection or status sync fails | 200 success, receiptSaved=true, syncPending=true, statusSynced=false; retry projection/sync only |
| Receipt/sync saved, response lost | Same ID; read verified journal/audit/original, no duplicate file or record |
| Previously recorded receipt cannot currently be read | Known receipt remains accepted with RECEIPT_STATE_CHECK_PENDING; no false claim that it was never saved |
| Admin completed/rejected/reviewing/invalidated during retry | Read latest state; never reapply stale submitted/pending state |
| GAS response missing/invalid/ambiguous | UPLOAD_OUTCOME_UNKNOWN; no automatic upload retry or lease takeover; manual reconciliation needed |
| Resource/project/identity invalid | Fail before upload; no production fallback |

receiptSaved refers to the durable certificate audit as the authoritative original receipt. staff_submissions is its existing UI/review projection; it may still need projection recovery when syncPending=true. statusSynced is independent of receipt acceptance. HTTP 200 with syncPending means accepted original receipt, not a claim that all downstream work succeeded. receiptState distinguishes submitted, status_pending, completed, rejected and invalidated; unconfirmed/retryable errors do not become UI success.

A recoveryToken is a bounded one-day HMAC proof using the existing environment's submission proxy secret, scoped to receipt ID/fingerprint/environment/staffId/authenticated UID and upload-operation token. It carries only the confirmed file ID and is not an OAuth/service-account credential. The API validates it before accepting client-supplied recovery metadata. It is never logged. No new signing secret or environment value is introduced.

## Review and status protection

Canonical original projections are create-only on initial acceptance; retries never set status back to submitted. CPR/QA-TB synchronization transactionally inspects original, audit and current status; completed/group completion, review markers, invalid audits and newer pending receipts are preserved. Production TB calls its unchanged idempotent receipt/review implementation. Server responses reflect the latest reviewed/invalidated audit rather than blindly reporting pending.

Normal staff authorization now requires exact UID and numeric current year/semester, in addition to active and existing staff roles. Synthetic QA identities retain their separate QA-only checks. Production proxy submission additionally requires exact approved current admin assignment/verified UID before reading its subject roster. Default completed-TB rejection remains; the certificate API may look up an exact already-recorded receipt to permit an idempotent retry, and rejects a new receipt after completion.

## Environment and permissions

Both journal and ordinary collections use the existing pure Firestore resource policy, which checks actual public DB project metadata. Default certificate stores are bound to that same DB/context. QA uses QA certificate audit and staff_submission_status_qa; production preserves its existing audit, original and staff_submission_status names/schemas. Unknown/local-without-policy environments are blocked. P0-2 GAS, Drive and source Sheet guards are not bypassed. No production-only proxy endpoint becomes available in QA.

No Rules permissions are widened: journal collections fall under default deny. An Emulator test checks get/list/create/update/delete denial for all eight identities in both journal collections. Admin SDK bypass remains a separate boundary; server authorization/project mocks run independently.

## Rollout limitations and remaining work

- GAS has no durable staff-upload lookup/replay-result API. After an ambiguous upload, or process death before its file checkpoint/response proof, automatic exactly-once recovery is impossible under the unchanged GAS contract. The protocol stops safely rather than creating another file. Reconciliation/explicit release requires a separately authorized, reviewed operation; no recovery job runs automatically.
- If a signed recovery proof cannot reach the browser and the journal file checkpoint also failed, the outcome remains unknown. Expired proofs without a durable file likewise need review.
- Browser reload recovery retains an intent ID/proof, not the local file bytes. The user must reselect the same file after a full reload; ordinary partial-sync retries keep the current form/file selected. The ID-only API can resume without file bytes when the receipt ID is available; a future UI listing of retained pending IDs could also remove the reload/reselection limitation.
- Coordinate server and browser rollout. Already-open old browser bundles still create random CPR originals (which can duplicate the server-owned projection), or attempt to rewrite the already server-created QA-TB original (which staff Rules may reject). A future reviewed rollout/client-version policy must address old sessions before production deployment. Do not silently widen Rules or deploy this change now.
- The stricter UID/year/semester server checks require the same non-destructive operational assignment compatibility audit described in CLOUD_QA_RULES_EMULATOR.md. No operational records were read or repaired here.
- Evidence upload/receipt consistency is now stronger than the old response contract, but audit/original/status remain separate stages. Permanent projection conflicts remain pending for operator review; no automatic destructive repair is attempted.
- Registration and Inbody retain existing retry contracts. Training access injected-DB follow-up remains outside this certificate change.

No live Firebase/Google access, school data, login, environment-value change, migration/sync/dry-run, deployment, commit or push is used for this implementation/validation. Only offline mocks and local synthetic Emulator data are used.

## Changed files

- `api/submit.js`
- `common/firestoreResources.js`
- `docs/CLOUD_STAFF_RECEIPT_RECOVERY.md`
- `server/lib/cprCertificateSubmissionStore.js`
- `server/lib/qaCprSynthetic.test.js`
- `server/lib/qaTbCertificateSynthetic.test.js`
- `server/lib/staffFileSubmission.js`
- `server/lib/staffReceiptProtocol.js`
- `server/lib/staffReceiptProtocol.test.js`
- `server/lib/submissionWorkflows.test.js`
- `server/lib/tbSubmissionGuard.js`
- `server/lib/tbSubmissionGuard.test.js`
- `src/lib/firestoreSubmissionContract.test.js`
- `src/lib/staffReceiptClient.js`
- `src/lib/staffReceiptClient.test.js`
- `src/lib/staffSubmissions.js`
- `src/pages/FirebaseCprSubmitPage.jsx`
- `src/pages/FirebaseTbSubmitPage.jsx`
- `tests/fixtures/staffReceiptDb.js`
- `tools/firestore-rules/matrix.mjs`

## Local validation results

- New regression tests: 28 added (23 protocol/API integration, 3 client-intent/message, 1 browser byte-free retry, 1 completed-TB guard test), all included in executed suites.
- Related server/security/client subset: 238/238 PASS.
- Full ordinary suite: 551/551 PASS, no skips/cancellations.
- Firestore Emulator: 218/218 PASS; existing 184 baseline groups retained, plus server-only journal denial across eight identities and two environments.
- Normal and explicit production builds: PASS; existing chunk-size warning only.
- lint/typecheck: N/A (not defined in package.json).
- git diff --check: PASS. No operational Rules/Apps Script/student audit/TB review/training correction source changed.
- Verified Emulator child processes and temporary fixture directories cleaned up. No commit/push/PR or deployment performed.

Checkpoint eligibility: YES for reviewed code/mock/local-Emulator validation; live external-resource QA and production deployment remain unapproved. Known ambiguous upload outcomes remain blocked for manual reconciliation rather than automatically creating another file.
