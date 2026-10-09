# Submission workflow boundary, Phase 1

This checkpoint fixes the code contract before any Sheet-to-Firestore configuration migration. No source Sheet, Firestore document, environment variable, or deployed Apps Script version is changed by this branch.

## Public and server-only configuration

The public upload-card projection contains only `title`, `titleLines`, `description`, `target`, `documentType`, `deadline`, `fileGuide`, `buttonText`, a safe navigation `url`, `status`, `uploadType`, and `highlight`. Raw Drive folder IDs and Drive folder URLs are not public card URLs. Existing `앱_제출센터` cards remain the temporary public display source.

`server/lib/submissionWorkflows.js` is the server-only workflow source. It fixes the canonical type, enabled state, auth policy, allowed roles, staffId requirement, file MIME/size rules, destination policy, audit Sheet, Firestore status policy, and public-card reference. A client-supplied `sheetName` or `folderId` never chooses the destination. The repository Apps Script maps only enabled type IDs to fixed Sheets/folders and refuses absent response Sheets instead of creating them.

`/api/submit` accepts JSON POST only and does not opt into cross-origin browser access. The site calls it from the same origin. The anonymous student route remains public, so this is not a replacement for rate limiting or abuse controls.

| Canonical type | Current route | Auth and users | File | Fixed audit/status destination | Admin route |
| --- | --- | --- | --- | --- | --- |
| `cpr` | `/firebase-submit/cpr` → `/api/submit` | Firebase + current canonical staffId; staff/homeroom/health_teacher/admin | PDF/JPEG/PNG, ≤10 MiB | `응답_심폐소생술이수증` + server-owned CPR Drive folder; `staff_submission_status`, then client `staff_submissions` | `/firebase-admin/submissions` |
| `tb` | `/firebase-submit/tb` → `/api/submit` | Same, plus TB completion guard | Same | `응답_결핵검진확인증` + server-owned TB Drive folder; `staff_submission_status`, then client `staff_submissions` | `/firebase-admin/submissions` |
| `tb_registration` | `/upload` modal → `/api/submit` | Same TB guard; submission period also checked by Apps Script | None | `응답_교직원결핵검진유형선택`; `staff_submission_status` | TB status/admin views |
| `student_tb_reply` (`student-file`) | `/upload?mode=public&type=tbreply` → `/api/submit` | Anonymous student/guardian route explicitly present in UI; no staffId | PDF/JPEG/PNG, ≤10 MiB | Fixed student reply Drive folder + `제출기록`; no Firestore status | Existing raw receipt review |
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
