# Common access guards and synthetic training browser validation

Baseline: feature/cloud-qa-firebase-guard-p0 at 5d72c3089f17ba6804e19803c7b8c341eb51b1fa. No live account/data/API/deployment is used.

## Confirmed causes and minimal changes

App has a bounded Auth-redirect startup check and page-specific guards, not a single global role policy. Header shows common menus without granting data access; its administrator link depends on current assignment. /faq is the existing public portal FAQ. /firebase-faq, /firebase-checkups and /firebase-education were wrapped in the administrator-only FirebaseV2AccessGate despite their staff-facing content and navigation. They now reuse FirebaseStaffSubmissionAccessGate in readOnly mode. Existing V2/admin consumers retain their administrator guard; no blanket change makes protected routes public. Firestore FAQ/content reads were already public, so a staff-only page is not a confidentiality boundary. No Rules privilege is changed.

getUserAssignmentResult now rejects foreign/missing UID, stale or string term values, malformed approval/role fields and absent canonical staffId instead of publishing a usable assignment. Current numeric term is 2026/2. Pending registration stays not-found, inactive assignment stays inactive. Role predicates remain the existing staff/homeroom/training_admin/health_teacher/admin vocabulary. Normal submission writers additionally require an allowed submission role and the authenticated server identity's staffId to equal the assignment's ID. Read-only training/content guards do not pretend to validate a roster locally; the training API separately checks canonical staff matching/current employment. Malformed legacy assignments may now be blocked: do not repair production documents automatically.

The four shared gates now invalidate pending async checks on account change/unmount, reject stale results and stop loading after 15 seconds without granting access. They retain denial messages on the requested route rather than introducing redirect loops. A hung SDK call itself is not canceled, and this is not a token-revocation system. Header already used an account-generation check and was not redesigned.

TrainingAttendancePage validates a nonempty eligibility result, renders ink controls only when every displayed event is eligible, and accepts completion only with ok=true, matching event IDs and a valid signedAt. A failed/ambiguous response rechecks eligibility; it never becomes a completion message. A now-duplicate/ineligible response removes ink controls. Retryable failures remain retryable only when eligibility is revalidated. Existing layout/styles and server receipt/correction contracts remain.

## Role matrix

| Synthetic authority | Public home /faq | Internal content FAQ/checkups/education | Training / staff guard | Homeroom-report guard | Admin guard |
| --- | --- | --- | --- | --- | --- |
| Anonymous | existing public contract | denied | denied | denied | denied |
| Signed-in pending | existing public contract | denied | denied | denied | denied |
| Approved staff | public | allowed | allowed | denied | denied |
| Approved homeroom | public | allowed | allowed | allowed, own class | denied |
| Approved admin | public | allowed | allowed | no homeroom-report role by itself | allowed |
| Approved health teacher | public | allowed | allowed | allowed | allowed |
| Inactive assignment | public | denied | denied | denied | denied |
| No current assignment | public | denied | denied | denied | denied |

Browser role tests exercise actual FAQ/training pages and actual shared staff/admin/student-health gates. Home/public routes and unchanged role-specific pages also have static tracing; the browser fixture router is NOT the production App bootstrap. Server training list and administrator-directory APIs execute actual handlers with synthetic auth/DB/directory dependencies for all eight identities. Existing server/Rules suites separately cover other submission, health and admin boundaries. No claim is made that all production API routes were exhaustively exercised in the browser. Public own-profile/access-request exceptions are retained. Admin Rules may permit administrative reads distinct from a homeroom-report UI.

## Browser scope and reproduction

Use Node 22, existing Python Playwright and /usr/bin/chromium. Start node tools/browser/serve.mjs, then run python3 tools/browser/check.py and python3 tools/browser/check_extra.py. Stop the server afterward. It binds only 127.0.0.1:4179. Production Vite configuration has no fixture switch; only this standalone fixture server replaces Firebase modules. Neither fixture module nor router is part of production application imports.

Chromium executes real React components at a 390x844 viewport. All non-loopback requests are aborted. Firebase SDK/Auth is replaced with synthetic objects, and HTTP API responses are intercepted. Synthetic sessionStorage exercises direct URLs/reload; it is NOT real Firebase session restoration or OAuth redirect validation. Existing tests/fixtures/training-phase2.jsx is reused for admin/target/QR/summary/final views; its submission response now matches the real completion DTO.

check.py: 53 browser checks including 40 role/page combinations, list/detail/target badges, direct URL/reload, duplicate/non-target/excluded/error denial, ink submission and completion, failed-submit retry, signout during pending assignment, timeout fail-closed, admin QR/attendance/final roster, synthetic PDF download, and an HTTP-200 unconfirmed response that never completes. The downloaded PDF is a synthetic transport fixture, not a roster built from real stored evidence.

check_extra.py: 7 checks reusing 5 existing training-phase2 views plus canonical writer identity match/mismatch. Server-side rendering/export, lock recovery and status writes are validated by separate mock tests, not by falsely labeling unit tests as browser E2E.

## Scenario limits

A-G: PASS in local mock-browser integration. H: status-update contracts checked by server mocks; full browser my-status read-back from a persisted service is BLOCKED. I: mock browser admin confirmation PASS. J: roster and synthetic PDF download PASS; actual private Drive evidence retrieval/production output is BLOCKED. K: browser failed-response retry and server lock/recovery mocks PASS; no live recovery executed. L: synthetic direct URL/reload/session PASS; actual OAuth/Firebase/Vercel restoration BLOCKED.

No Firebase Rules change, QA infrastructure creation, Sheet migration, operational data repair, credential/environment-value change, real login/API access, commit/push/PR or deployment is part of this work. Existing Firestore Rules matrix is retained with one additional public-FAQ contract case; existing health-teacher FAQ write/delete permission is preserved. Local checkpoint eligibility does not imply live QA or production deployment approval.

## Final execution evidence

- New assignment-integrity and real-handler role tests: 11/11 PASS.
- Related training/access/status/ledger/export/lifecycle tests: 117/117 PASS.
- Full ordinary suite: 617/617 PASS; zero failures/skips/cancellations.
- Real Chromium with mocked SDK/API: 53 main + 7 reused-fixture/canonical checks = 60 PASS. No non-loopback request was permitted; fixture contexts and browser closed.
- Firestore Rules Emulator: 219/219 PASS (218 existing + public FAQ contract); Rules source unchanged. The new FAQ test preserves existing health-teacher delete permission rather than assuming a new universal deny policy.
- Normal / explicit production build: PASS / PASS; existing chunk-size warning. lint/typecheck N/A. Tracked/new-file whitespace checks PASS.
- HEAD unchanged, main/qa unchanged; no commit/push/PR/deploy. Test server and own temporary PDF removed. No cache/build artifact belongs in this change.

Changed files (19):

- src/components/FirebaseV2AccessGate.jsx
- src/components/FirebaseStaffSubmissionAccessGate.jsx
- src/components/FirebaseAdminRoleAccessGate.jsx
- src/components/FirebaseStudentHealthAccessGate.jsx
- src/lib/userProfile.js
- src/pages/FirebaseFaqPage.jsx
- src/pages/FirebaseCheckupsPage.jsx
- src/pages/FirebaseEducationPage.jsx
- src/pages/TrainingAttendancePage.jsx
- src/lib/userProfileAccess.test.js
- server/lib/guardRoleMatrix.test.js
- tests/fixtures/training-phase2.jsx
- tools/firestore-rules/matrix.mjs
- tools/browser/serve.mjs
- tools/browser/fixtureFirebase.js
- tools/browser/entry.jsx
- tools/browser/check.py
- tools/browser/check_extra.py
- docs/ACCESS_GUARD_SYNTHETIC_QA.md

Checkpoint eligibility: YES for local code/mock/browser/Emulator validation only. Full cross-service E2E and production rollout remain blocked; no infrastructure work is included.
