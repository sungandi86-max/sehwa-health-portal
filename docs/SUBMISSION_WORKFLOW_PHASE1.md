# Submission workflow boundary, Phase 1

This checkpoint fixes the code contract before any Sheet-to-Firestore configuration migration. No source Sheet, Firestore document, environment variable, or deployed Apps Script version is changed by this branch.

## Public and server-only configuration

The public upload-card projection contains only `title`, `titleLines`, `description`, `target`, `documentType`, `deadline`, `fileGuide`, `buttonText`, a safe navigation `url`, `status`, `uploadType`, and `highlight`. Raw Drive folder IDs and Drive folder URLs are not public card URLs. Existing `앱_제출센터` cards remain the temporary public display source.

`server/lib/submissionWorkflows.js` is the server-only workflow source. It fixes the canonical type, enabled state, auth policy, allowed roles, staffId requirement, file MIME/size rules, destination policy, audit Sheet, Firestore status policy, and public-card reference. A client-supplied `sheetName` or `folderId` never chooses the destination. The repository Apps Script maps only enabled type IDs to fixed Sheets/folders and refuses absent response Sheets instead of creating them.

`/api/submit` accepts JSON POST only and does not opt into cross-origin browser access. The site calls it from the same origin. The anonymous student route remains public, so this is not a replacement for rate limiting or abuse controls.

| Canonical type | Current route | Auth and users | File | Fixed audit/status destination | Admin route |
| --- | --- | --- | --- | --- | --- |
| `cpr` | `/firebase-submit/cpr` → `/api/submit` | Firebase + current canonical staffId; staff/homeroom/health_teacher/admin | PDF/JPEG/PNG, ≤3 MiB after optional image compression | `응답_심폐소생술이수증` + server-owned CPR Drive folder; `staff_submission_status`, then client `staff_submissions` | `/firebase-admin/submissions` |
| `tb` | `/firebase-submit/tb` → `/api/submit` | Same, plus TB completion guard | Same | `응답_결핵검진확인증` + server-owned TB Drive folder; `staff_submission_status`, then client `staff_submissions` | `/firebase-admin/submissions` |
| `tb_registration` | `/upload` modal → `/api/submit` | Same TB guard; submission period also checked by Apps Script | None | `응답_교직원결핵검진유형선택`; `staff_submission_status` | TB status/admin views |
| `student_tb_reply` (`student-file`) | `/upload?mode=public&type=tbreply` → `/api/submit` | Anonymous student/guardian route explicitly present in UI; no staffId | PDF/JPEG/PNG, ≤3 MiB after optional image compression | Fixed student reply Drive folder + `제출기록`; no Firestore status | Existing raw receipt review |
| `inbody` | CMS health-event action → `/api/submit` | Firebase + current canonical staffId; staff/homeroom/health_teacher/admin | None | `응답_인바디측정신청`; no Firestore status | Existing Apps Script receipt summary |
| `infection` | `/firebase-submit/infection` | Firebase + homeroom/health_teacher/admin via Firestore rules | No `/api/submit` file | `student_health_submissions`; legacy `/api/submit` remains 410 | Infection admin view |
| `recruit` | `/firebase-submit/recruit` | Firebase current staff through Firestore rules | No legacy upload | `staff_submissions`; legacy `/api/submit` disabled | `/firebase-admin/submissions` |
| `other` | No active upload card | Policy not confirmed | Legacy file form disabled at `/api/submit` | No allowed destination | None |

The current public student reply path is intentionally anonymous because the existing URL and UI explicitly offer public submission. It should receive a separate abuse-prevention and privacy review before Production rollout. `other` and legacy Sheet-backed `recruit` are closed rather than guessed public.

## Legacy management Sheet

`제출항목관리` has a real `제출명` header. The old `getSubmissionManagedFolderId_` searches only `제출항목명`/`제출항목`/`제목`, so the current live reader returned no managed folder and fell back. A test locks this mismatch. Phase 1 does not promote that reader to a security authority; the student reply now uses only the server-owned fixed folder. The reader remains unused compatibility code until config migration.

## Release blockers

1. The currently deployed Apps Script remains its old version until an explicitly approved operational update. The checked-in allowlist and no-auto-create behavior are not yet active there.
2. The Apps Script web-app URL itself accepts direct POSTs outside `/api/submit`. Its known-type destination allowlist limits destination choice, but direct callers do not receive the Vercel Firebase auth gate. A server-to-script authentication mechanism and explicit student-public abuse policy are needed before this is a complete Production security boundary.
3. Preview smoke must verify the actual configured response Sheets exist and the server-owned fixed folders are accessible. This branch intentionally performs no live submission, migration, or malicious request.

Therefore this checkpoint is **not** permission to migrate or delete `앱_제출센터` or `제출항목관리`.

## Phase 1.5 local security boundary (not deployed)

The Vercel submit handler now sends a versioned body envelope containing a server-generated UUID, timestamp, exact payload JSON, SHA-256 payload digest, and HMAC-SHA256 signature. Apps Script verifies the digest/signature and a two-minute timestamp window before resolving a submission destination. Unsigned legacy POSTs fail closed. Existing non-submission admin actions and GET readers retain their separate routes and checks.

`SUBMISSION_PROXY_SECRET` is a dedicated value of at least 32 UTF-8 bytes, required in the Vercel Production **server-only** environment and the existing Apps Script's Script Properties. It must never use a `VITE_` prefix or reuse `STUDENT_CARE_PROXY_SECRET`. No value was created or set in this change. Do not set it on the current QA/feature Preview while those deployments point at the operating Apps Script/workbook. Coordinate activation of the new Apps Script version and Vercel Production deployment; either half deployed alone will fail submissions, and the old deployed Apps Script still accepts direct unsigned POSTs.

Apps Script reserves each accepted request UUID in Script Properties under a script lock until its signed two-minute validity window ends, before any submission write. For anonymous student replies it additionally blocks the same payload digest for ten minutes and allows at most three accepted requests per ten minutes for a server-HMAC-hashed visitor IP. The raw IP is not sent to Apps Script. This IP trust assumption applies to Vercel Functions, where Vercel overwrites `x-forwarded-for`; it must be revisited if hosting or trusted-proxy routing changes. Old replay keys are removed when expired; if the guard store reaches its bounded capacity, submission fails closed. An accepted request whose downstream Sheet/Drive step fails cannot be automatically retried during its window; reconcile partial writes first.

Read-only destination inspection found all five fixed response tabs in the operating workbook and the three fixed upload folders by metadata. This does not prove the deployed Apps Script execution identity can create files or append rows; no live write was attempted. The `제출항목관리` reader remains migration compatibility only, not security authority.

The effective file maximum is 3 MiB. The client may resize/re-encode JPEG or PNG files up to 10 MiB source size as JPEG before submission; the final file must be at most 3 MiB. PDFs are never automatically compressed and are rejected above 3 MiB. The API caps the complete incoming JSON body at 4,250,000 bytes and independently validates decoded bytes, MIME, and file signature. This leaves room for base64 expansion below Vercel Functions' 4.5 MB request ceiling. A larger-file direct-upload architecture is a separate future decision.

## Phase 1.6 student reply audit contract (feature code only)

The operating `제출기록` tab has 26 existing columns, not the former student-only 13-column fixture. A read-only audit found two populated legacy rows, both using only `제출일시`, `파일명`, and `파일URL`. No other repository submission type writes this tab. Do not add columns or create a new Sheet to make the student reply path work.

| Student reply value | Existing `제출기록` column |
| --- | --- |
| Submit time and last update | `제출일시`, `최종수정일` |
| Display title and canonical type | `제출항목`, `제출명_정규화`, `구분`, `제출항목ID` (`student_tb_reply`) |
| Signed envelope request UUID | `제출ID` |
| Student name | `성명` (no canonical staffId; `교직원ID` stays empty) |
| Grade, class, number, visit date, hospital, optional note, public source, API route | JSON object in `비고` with explicit keys |
| Uploaded file name, private Drive link, file ID, MIME | `파일명`, `파일URL`, `파일ID`, `파일MIME` |
| Initial receipt state | `처리상태` (`접수`) |

The Apps Script `preflightSubmission_` helper reads the fixed destination Sheet, checks required header names, validates fields and file bytes/MIME/size, and resolves the fixed Drive folder before touching replay properties. Other enabled submission types keep their existing positional append formats but now verify the exact existing response-header order before reservation; the four operating response-tab headers were audited read-only. The helper has no append/upload/property write and is exercised against a fixture copied from the observed 26-header operating schema. Untrusted student name and filename are escaped before placement in cells that Sheets could interpret as formulas.

After preflight, a signed request reserves its UUID. A Drive create or Sheet append failure after reservation retains the guard, rather than releasing it and risking a second upload; the same anonymous payload digest is also held for ten minutes. This can block a legitimate retry and may leave an orphan file when Drive succeeds but Sheet fails. Reconcile the file and Sheet manually before accepting another submission; there is no automatic deletion or retry. Production Apps Script v93 and Vercel remain unchanged until this feature code is separately reviewed and deployed.

## Production migration without submission downtime

Compatibility is **CASE B**: the current Production Apps Script parses the top-level POST body as the submission and reads `type`/`sheetName`. A signed envelope instead places the submission JSON in `payloadJson`, so deploying the new Vercel proxy against that old Apps Script would reject submissions. Vercel-first deployment is not safe.

The new Apps Script accepts signed requests in all modes. It accepts the old unsigned payload only when `SUBMISSION_PROXY_TRANSITION_UNTIL` is set in Script Properties to a future epoch-millisecond deadline no more than 15 minutes away. It maps only the known legacy type/Sheet combinations; the old type-less TB registration payload is mapped by its one fixed Sheet name. Client folder IDs never select storage. Missing, expired, overly distant, or malformed transition values leave the script strict. During the short transition, direct unsigned calls still remain possible without the new anonymous rate limit, so monitor and end it promptly. The overlap preserves the enabled CPR, TB, TB registration, InBody, and student-reply routes only. The old UI still contains disabled `recruit` and `other` legacy submit forms; confirm no operating card exposes them before rollout, rather than claiming every legacy route is uninterrupted. Also, the old UI advertises 10MB while the transitional Apps Script enforces 3MiB; oversized files can fail during the brief overlap and should receive a clear support message. A transition deadline that expires before the new Vercel deployment is ready also interrupts unsigned requests; pause or roll back before expiry if that occurs.

Operational sequence, requiring a separate approval before any secret or deployment change:

1. Generate one fresh 32-byte-or-longer secret. Set it only as the Vercel Production server-side Secret `SUBMISSION_PROXY_SECRET` and the same property on the existing Production Apps Script. Do not use `VITE_` or reuse `STUDENT_CARE_PROXY_SECRET`.
2. Immediately before updating the existing Apps Script web-app deployment, set `SUBMISSION_PROXY_TRANSITION_UNTIL` to no more than 15 minutes ahead. Update that existing deployment ID and URL to this transitional-capable version. The old Vercel proxy continues to send its allowlisted unsigned payloads.
3. Deploy the new Vercel Production code. Verify deployment readiness and a controlled signed submission/response through the existing URL. If rollout cannot finish inside the window, pause and follow the approved rollback procedure rather than leaving indefinite dual mode.
4. Delete the transition property as soon as signed forwarding is confirmed, or allow its deadline to expire. Verify a direct unsigned POST is rejected without a Sheet/Drive write. The same code is strict by default, so no permanent dual mode or new URL is needed.

Use a **different** QA secret only if QA has a separate Apps Script deployment bound to a QA workbook. The current QA Preview must not receive the Production secret while its Apps Script endpoint targets the operating workbook. Feature Preview likewise remains without the submit secret. Script Properties, not process memory, hold requestId replay, same-payload suppression, and hashed-visitor rate counters under a script lock; these counters are shared among executions of that Apps Script, with a bounded store and fail-closed capacity handling. Legacy unsigned requests during the transitional window cannot have the same trusted visitor limit as signed requests and remain a short-lived residual risk.
