# Staff Submission And Training Status Model

This document freezes the design direction for unifying staff-facing
submission, training, and screening status before implementation.

No React, API, Apps Script, Firestore Rules, or migration behavior is defined
as already implemented here. This is the implementation reference for a later,
rollbackable set of phases.

## Fixed Menu Names

Use these names consistently in product copy, navigation, and future tickets.

- User menu: `나의 제출·이수 현황`
- Admin menu: `교직원 제출·이수 현황`

Do not rename this surface to administrator-centered labels such as
`나의 보건업무` or `보건업무 현황`.

## Core Questions

The same task/status model should answer two practical questions.

- User: "내가 아직 안 한 제출·이수·검진이 뭐지?"
- Admin: "누가 어떤 제출·이수·검진을 아직 완료하지 않았지?"

The model should avoid separate one-off status systems for TB, CPR, file
submissions, legal training, and manual exceptions.

## Current Sources

### Health Office Master Sheet

Google Sheet: `2026학년도 보건실 업무`

Relevant tabs:

- `교직원 결핵검진현황`
- `교직원 심폐소생술 연수 이수`
- `교직원명단`
- `제출항목관리`
- `제출기록`
- `제출현황`

These tabs are managed by the health office and remain operational source
records. Do not replace or delete them during the first implementation phases.

### External Research Department Sheet

Google Sheet: `2026 세화여고 교직원 법정의무연수 이수 현황`

Relevant tab:

- `법정의무연수 묶음과정`

This source is owned by another department and must be treated as read-only by
온라인 보건실.

### Firestore Sources Already In Use

- `users`: Firebase Auth user profile metadata.
- `user_assignments`: current-term roles, class responsibility, and active
  assignment.
- `submission_items`: existing v2 submission entry definitions.
- `staff_submissions`: CPR, TB, and recruit v2 submission records.

## Source Ownership

Every task must declare one source-of-truth type.

### `health_sheet`

The health office directly manages the source sheet.

Examples:

- Staff TB screening.
- CPR training completion managed by the health office.

Sync policy can be close to real time because the project already owns the
health-office Apps Script and Sheet workflow.

### `research_sheet`

Another department owns the source.

Example:

- `보건 관련 법정의무연수`

Rules:

- Read-only.
- No writes from 온라인 보건실.
- No Apps Script triggers installed on the research department sheet.
- No source sheet structure changes.
- No operational dependency imposed on the research department.

Sync policy:

- One automatic daily snapshot sync.
- Optional admin manual refresh.
- No real-time `onEdit` sync.
- If sync fails, keep the last snapshot and show sync status to admins.

### `firestore_submission`

온라인 보건실 Firestore submission data is the source.

Examples:

- CPR certificate upload records in `staff_submissions`.
- TB certificate upload records in `staff_submissions`.
- Recruit confirmation requests in `staff_submissions`.

### `manual`

The health teacher or admin manually decides completion, exception, or
not-applicable state.

Manual state should live in Firestore as an override layer, not as edits to
external source sheets.

## Health-Related Legal Training Scope

The research department's `법정의무연수 묶음과정` represents the full 23-hour
mandatory legal training bundle. 온라인 보건실 must not look like it manages the
entire research department training program.

User-facing title:

`보건 관련 법정의무연수`

User-facing description:

`감염병 · 4대폭력예방 · 아동학대예방 · 장애인학대예방`

Completion source:

- Sheet: `2026 세화여고 교직원 법정의무연수 이수 현황`
- Tab: `법정의무연수 묶음과정`
- Rule: `이수상태 == "이수완료"`

The training completion number should not be stored in the 온라인 보건실
Firestore projection unless a later privacy review approves a specific need.

## Task Definition Model

Recommended collection: `staff_submission_tasks`

Keep task definitions separate from user/admin menu names. The collection
defines units of work, not pages.

Example:

```js
{
  taskId: "tb-screening-2026",
  title: "교직원 결핵검진",
  category: "screening",

  sourceType: "health_sheet",
  sourceConfig: {
    spreadsheetName: "2026학년도 보건실 업무",
    sheetName: "교직원 결핵검진현황"
  },

  completionRule: {
    field: "검진상태",
    completedValue: "검진완료"
  },

  targetType: "all_staff",
  dueDate: "2026-12-31",
  enabled: true,
  order: 10,

  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Task Categories

Supported categories:

- `screening`: health screening, such as TB screening.
- `training`: training completion, such as CPR or health-related legal
  training.
- `file_submission`: evidence file submission.
- `confirmation`: confirmation request or acknowledgement.
- `manual`: manually managed status.

Internal categories do not need to be exposed directly to users.

### `submission_items` Versus `staff_submission_tasks`

`submission_items` is already a good fit for visible submission entry cards:
title, description, button labels, visibility, and route behavior.

`staff_submission_tasks` should be separate because it needs source ownership,
completion rules, target rules, due dates, and status semantics across sources
that are not all user-submitted files.

Recommendation:

- Keep `submission_items` for submission UI entries.
- Create `staff_submission_tasks` for unified task definitions.
- Link the two only when a task has a direct submission action, for example:

```js
{
  taskId: "cpr-certificate-2026",
  linkedSubmissionItemId: "cpr"
}
```

This avoids forcing research-sheet or health-sheet tasks into a UI-entry schema.

## Completion Status Model

Use one user-visible status vocabulary:

| Status | Korean label | Meaning |
| --- | --- | --- |
| `completed` | 완료 | Source rule or manual override confirms completion. |
| `incomplete` | 미완료 | User is a target and no completion evidence exists. |
| `pending` | 확인중 | Submission or evidence exists but admin/source confirmation is not complete. |
| `not_applicable` | 해당없음 | User is excluded by target rule or manual exception. |
| `unknown` | 확인필요 | Source sync failed, identity matching failed, or status cannot be trusted. |

Do not convert sync failure into `incomplete`. A stale or failed source must not
create a false "미완료" notice.

## User Status Projection

Recommended collection: `staff_submission_status`

This collection stores only minimal per-user status. It is not a copy of the
source row.

Example:

```js
{
  uid: "firebase-auth-uid",
  staffId: "T022",
  taskId: "tb-screening-2026",

  status: "incomplete",
  sourceType: "health_sheet",
  sourceSnapshotAt: Timestamp,
  syncedAt: Timestamp,

  dueDate: "2026-12-31",
  action: {
    type: "submit",
    submissionItemId: "tb"
  }
}
```

Privacy rules:

- Do not store training completion numbers by default.
- Do not store hospital names unless a later user-facing need is approved.
- Do not store detailed medical, screening, or memo fields.
- Keep file URLs in `staff_submissions`, not in the status projection.
- Do not copy entire external sheet rows.

## Staff Identity Strategy

The health-office `교직원명단` tab contains:

- `교직원ID`
- `제출대상`
- `직책`
- `성명`
- `소속부서`

Firebase contains:

- `users/{uid}`
- `user_assignments/{uid}_{schoolYear}_{semester}`

Recommended long-term mapping:

- Add or maintain a stable `uid <-> staffId` relationship.
- Use `staffId` for Sheet status matching where the health-office sheet has
  staff IDs.
- Use `uid` for Firebase access control and per-user reads.

Do not rely on name-only matching as the permanent identity strategy.

For the research department sheet, `교직원ID` may not exist. Initial matching may
use a conservative combination such as real name plus position, but this has
known risks:

- Same-name staff.
- Nicknames or different spelling across Google/Microsoft profiles.
- Department or position changes during the school year.
- Retired/transferred staff remaining in a source sheet.

Matching failures should result in `unknown`, not guessed completion.

## Task Completion Rules

### TB Screening

Source:

- `health_sheet`
- Sheet: `2026학년도 보건실 업무`
- Tab: `교직원 결핵검진현황`

Completion rule:

- `검진상태 == "검진완료"`

User display:

- `완료`
- `미완료`
- optionally screening type if it is already safe and useful

Not required in projection:

- hospital name
- detailed medical fields
- free memo

### CPR Training

Source:

- `health_sheet`
- Sheet: `2026학년도 보건실 업무`
- Tab: `교직원 심폐소생술 연수 이수`

Completion rule:

- `확인상태 == "확인완료"`

Training method such as school group training or external training may be shown
if it already exists in the health-office source and is useful for the user
action.

### Health-Related Legal Training

Source:

- `research_sheet`
- Sheet: `2026 세화여고 교직원 법정의무연수 이수 현황`
- Tab: `법정의무연수 묶음과정`

Completion rule:

- `이수상태 == "이수완료"`

온라인 보건실 should present this only as health-related legal training:

`감염병 · 4대폭력예방 · 아동학대예방 · 장애인학대예방`

Do not write to the research department sheet.

### File Submission Training Or Evidence

Source:

- `firestore_submission`
- Collection: `staff_submissions`

Completion rule examples:

- `status == "completed"` for admin-confirmed tasks.
- `status in ["submitted", "reviewing"]` maps to `pending` when completion still
  requires review.
- latest submission by `submitter.uid` is the representative record when a user
  submits multiple times.

### Manual Confirmation

Source:

- `manual`

Completion rule:

- Admin-created override sets `completed`, `not_applicable`, or `unknown`
  correction.

Manual override must not mutate `research_sheet` source rows.

## User Surface: `나의 제출·이수 현황`

The user page is login-based. It should not ask the user to type their name for
normal lookup.

Top summary example:

```text
박숙현 선생님 · 생활안전부

미완료 2   확인중 1   완료 4
```

Default order:

1. `incomplete`
2. `pending`
3. `completed`
4. `not_applicable`
5. `unknown`

Completed items may be collapsed or visually compact by default.

Example rows:

```text
교직원 결핵검진
미완료

심폐소생술 연수
완료

보건 관련 법정의무연수
완료
감염병 · 4대폭력예방 · 아동학대예방 · 장애인학대예방
```

### User Actions

Actions depend on task source and category.

- TB screening: `확인증 제출`, `안내 보기`.
- CPR: `이수증 제출` for external education; no action for school group
  completion when the source already confirms it.
- Health-related legal training: no online completion write; show an
  information or guidance link if needed.
- File submission: `제출하기`.
- Manual task: show status only unless an approved user action exists.

## Admin Surface: `교직원 제출·이수 현황`

Admin users need both task-first and person-first views.

### Task Summary

Example:

```text
결핵검진
대상 96 / 완료 63 / 미완료 33

CPR
대상 96 / 완료 85 / 미확인 11

보건 관련 법정의무연수
대상 N / 완료 N / 미완료 N
```

### View Modes

Task view:

- Select a task.
- Show target count, completed count, pending count, incomplete count,
  not-applicable count, and unknown count.
- Default list focuses on incomplete and pending staff.

Person view:

- Select or search a staff member.
- Show all task statuses for that person.

### Admin Filters

Minimum filters:

- task
- status
- department
- position
- name search

Default ordering should prioritize incomplete and pending work.

### Manual Handling

`health_teacher` and `admin` may need override actions:

- mark completed
- mark not applicable
- exception note
- require re-check

Recommended design:

- Store overrides in a separate Firestore layer such as
  `staff_submission_overrides`.
- Never write manual overrides back to `research_sheet`.
- Keep reviewer metadata minimal: reviewer uid/email/display name, reviewedAt,
  and a short reason when needed.

## Sync Policy

### `health_sheet`

Use the same operational style as student-care projection:

- installable `onEdit`
- five-minute correction batch
- nightly rebuild

Use for TB and CPR health-office source tabs once the source-field mapping has
been verified.

### `research_sheet`

Use a slower, safer read-only snapshot:

- daily automatic snapshot sync
- optional admin manual refresh
- no source trigger
- no source write
- no source schema change

Production automation:

- Vercel Cron calls `/api/cron/health-mandatory-training-sync` once daily at
  `30 20 * * *` UTC, which is 05:30 KST.
- The cron endpoint requires `CRON_SECRET` through the `Authorization: Bearer`
  header and reuses the same safe apply helper as the admin manual refresh.
- A failed cron run keeps the latest valid snapshot, does not delete orphan
  snapshots, and never writes to the research department Sheet.

### `firestore_submission`

Recalculate status immediately after submission creation or admin review status
changes.

### `manual`

Apply admin action immediately to the override layer and recalculate the
affected user's task status.

## Source Priority

Each task has exactly one primary source.

Examples:

- `tb-screening-2026` -> `health_sheet`
- `cpr-training-2026` -> `health_sheet`
- `health-mandatory-training-2026` -> `research_sheet`
- `external-training-cert` -> `firestore_submission`

Do not mix source priority ad hoc at read time. Manual overrides are explicit
overrides layered on top of a primary source, not silent source replacement.

## Fallback And Staleness

If source sync fails:

- Keep the latest valid snapshot.
- Do not change every affected user to `incomplete`.
- Use `unknown` or stale indicators when the result cannot be trusted.
- Show admins the last sync time, source type, and failure state.
- User-facing copy should avoid blaming a system component.

Example user-safe message:

`최근 상태 확인이 지연되고 있습니다. 보건실에 문의해 주세요.`

## Privacy Minimum

`staff_submission_status` should contain only what is required to answer task
status and action routing.

Do not store by default:

- training completion number
- hospital name
- detailed screening information
- medical details
- unnecessary free-form memo
- external sheet full rows
- source credentials or URLs

If an admin needs source detail, open the official source under the existing
authorized workflow rather than copying it wholesale to Firestore.

## Existing Structures To Reuse

Reuse:

- `users` for base account profile.
- `user_assignments` for current-term role and active status.
- `staff_submissions` for submitted evidence and admin review status.
- `submission_items` for visible submission entry cards.

Add only the minimum new collections needed for the status model:

- `staff_submission_tasks`
- `staff_submission_status`
- optional `staff_submission_overrides`
- optional `staff_source_sync_status`

Avoid creating a separate collection for every task unless a source demands a
different privacy boundary.

## Migration Plan

### Phase 0: Document Freeze

- Agree on this model.
- Decide the open questions at the end of this document.
- No data migration.

### Phase 1: Task Definition Model

- Create `staff_submission_tasks`.
- Add TB, CPR, health-related legal training, and existing file-submission task
  definitions.
- Do not expose a new UI until definitions are verified.

### Phase 2: Staff Identity Mapping

- Confirm or create `uid <-> staffId` mapping strategy.
- Compare Firebase `users` + `user_assignments` with `교직원명단`.
- Flag unmatched users and duplicate names as `unknown`.

### Phase 3: TB Status Projection

- Read `교직원 결핵검진현황`.
- Build `staff_submission_status` for the TB task.
- Compare target/completed/incomplete counts with the health-office sheet.

### Phase 4: CPR Status Projection

- Read `교직원 심폐소생술 연수 이수`.
- Build `staff_submission_status` for the CPR task.
- Compare counts and representative user statuses.

### Phase 5: User Page

- Add `나의 제출·이수 현황`.
- Read only the logged-in user's status projection.
- Show incomplete and pending first.

### Phase 6: Admin Page

- Add `교직원 제출·이수 현황`.
- Support task view, person view, filters, and search.
- Keep manual override behind health-teacher/admin access.

### Phase 7: Research Department Snapshot

- Add read-only daily sync for `보건 관련 법정의무연수`.
- Do not install triggers or write to the research sheet.
- Mark ambiguous matches as `unknown`.

### Phase 8: File Submission And Manual Integration

- Recalculate task status from `staff_submissions`.
- Add manual override layer if approved.
- Keep file URLs in `staff_submissions`.

### Phase 9: Operational Stabilization

- Run dual-read QA against Sheets and Firestore projections.
- Track sync status and stale states.
- Keep each phase rollbackable.

## Implementation Safety Lines

- Do not change the health-office Sheet workflow.
- Do not write to the research department Sheet.
- Do not copy full external rows into Firestore.
- Do not use name matching as the permanent identity key.
- Do not show research department work as if the health office owns all 23
  hours.
- Do not remove existing submission or upload routes during status model
  rollout.
- Do not mark users incomplete when source sync or identity matching is
  uncertain.

## Decisions Required Before Implementation

1. Whether to extend `submission_items` for task definitions or create
   `staff_submission_tasks`.
2. How to store and maintain the stable `staffId <-> Firebase uid` mapping.
3. How to match the research department sheet when `교직원ID` is missing.
4. Whether manual overrides are allowed for every source type or only selected
   tasks.
5. How much source detail the user page should show beyond status and action.
6. What time the daily research-sheet sync should run.
7. Whether completed items are collapsed by default on the user page.
8. How due dates are displayed and whether overdue state is separate from
   `incomplete`.
