# Student Care Firestore Projection

This document fixes the intended data architecture for improving `/student-care`
read performance before implementation.

## Core Principles

- Google Sheet `학생 보건실 입실현황` is the operational master.
- The health teacher continues to enter and update records directly in the
  school Google Sheet in real time.
- Firestore is not the master. It is a read projection/cache for staff lookup.
- The Sheet input workflow must not change.
- Student health records must not be copied wholesale to Firestore.
- Firestore projections must not expose more information than the current
  Apps Script role-based responses already expose.
- Projection sync failure must never block the health teacher's Sheet work.
- Projection data is disposable and must be rebuildable from the Sheet master.

## Phase 1 Scope

The first Firestore projection should include only these read models.

### `student_care_presence_public`

Purpose: health-room presence lookup for general staff and subject teachers.

This projection mirrors the current Apps Script `subject` response scope only.
It is intended for fast "where is the student now?" lookup, not health-detail
review.

### `student_care_presence_homeroom`

Purpose: homeroom teacher lookup for their own class, including current
presence and monthly attendance-reference checks.

This projection mirrors the current Apps Script homeroom response scope.

### `student_care_monthly_aggregates`

Purpose: anonymous monthly statistics for `health_teacher` and `admin`.

This projection should allow the admin monthly statistics screen to avoid
reading student-level rows at request time.

### Explicitly Excluded From Phase 1

Do not create `student_care_admin_details` in Phase 1.

Do not copy symptom, treatment, or detailed result fields into Firestore for
admin detail lookup yet. Health-teacher detailed lookup should remain on the
secure Apps Script + Sheet source path until a separate privacy review approves
that projection.

## Public Presence Schema

Collection: `student_care_presence_public`

Example document:

```js
{
  schoolYear: 2026,
  semester: 2,
  date: "2026-09-04",
  month: "2026-09",

  grade: 2,
  classNo: 3,
  number: 12,

  maskedName: "김*현",
  enteredAt: "10:20",
  returnedAt: "",
  status: "현재 이용중",

  sourceRef: {
    spreadsheetId: "...",
    sheetName: "학생 보건실 입실현황",
    rowNumber: 123
  },
  syncedAt: Timestamp
}
```

Field mapping from the Sheet:

| Sheet field | Projection field | Notes |
| --- | --- | --- |
| 날짜 | `date`, `month` | Normalize to `yyyy-MM-dd` and `yyyy-MM`. |
| 학년 | `grade` | Number. |
| 반 | `classNo` | Number. |
| 번호 | `number` | Number. |
| 이름 | `maskedName` | Store only the same masked name currently returned by Apps Script. |
| 입실시각 | `enteredAt` | Display text is acceptable for Phase 1. |
| 복귀시각 | `returnedAt` | Empty means current/pending return. |
| 상태 + 복귀시각 + 결과 | `status` | Same normalized status currently returned by Apps Script. |
| 원본 행 | `sourceRef` | Row-based reference only; see source identity caveat. |

Do not store:

- original student name
- symptom
- treatment
- result detail
- diagnosis or disease name
- protected-student notes
- guardian/contact information
- free memo fields

## Homeroom Presence Schema

Collection: `student_care_presence_homeroom`

Example document:

```js
{
  schoolYear: 2026,
  semester: 2,
  date: "2026-09-04",
  month: "2026-09",

  grade: 2,
  classNo: 3,
  number: 12,
  maskedName: "김*현",

  enteredAt: "10:20",
  returnedAt: "10:42",
  duration: "22분",

  resultCategory: "질병결과",
  attendanceNote: "출결 참고 필요",
  homeroomConfirmed: false,

  sourceRef: {
    spreadsheetId: "...",
    sheetName: "학생 보건실 입실현황",
    rowNumber: 123
  },
  syncedAt: Timestamp
}
```

Field mapping from the Sheet:

| Sheet field | Projection field | Notes |
| --- | --- | --- |
| 날짜 | `date`, `month` | Normalize to `yyyy-MM-dd` and `yyyy-MM`. |
| 학년 | `grade` | Must match current homeroom assignment in rules/query. |
| 반 | `classNo` | Must match current homeroom assignment in rules/query. |
| 번호 | `number` | Number. |
| 이름 | `maskedName` | Store only masked name. |
| 입실시각 | `enteredAt` | Display text is acceptable for Phase 1. |
| 복귀시각 | `returnedAt` | Display text. |
| 체류시간 | `duration` | Existing Sheet-calculated value. |
| 결과 | `resultCategory`, `attendanceNote` | Keep category/attendance note, not detailed health text. |
| 담임확인 | `homeroomConfirmed` | Boolean. |
| 원본 행 | `sourceRef` | Used for Sheet-origin confirmation writes. |

Do not store:

- original student name
- disease name
- symptom
- treatment
- diagnosis detail
- protected-student information
- free memo fields

## Monthly Aggregate Schema

Collection: `student_care_monthly_aggregates`

Document ID: `{schoolYear}_{semester}_{month}`, for example
`2026_2_2026-09`.

Example document:

```js
{
  schoolYear: 2026,
  semester: 2,
  month: "2026-09",

  summary: {
    totalVisits: 42,
    returned: 38,
    earlyLeave: 1,
    hospital: 0,
    diseaseCount: 12,
    periodCount: 4,
    noResultCount: 26,
    uncheckedCount: 3
  },

  gradeStats: [
    { grade: 1, total: 14 },
    { grade: 2, total: 13 },
    { grade: 3, total: 15 }
  ],

  classStats: [
    {
      grade: 2,
      classNo: 3,
      total: 4,
      diseaseCount: 1,
      periodCount: 0,
      noResultCount: 3,
      uncheckedCount: 1
    }
  ],

  syncedAt: Timestamp
}
```

This collection must contain aggregate counts only. It must not contain student
names, student numbers, symptoms, treatment text, diagnosis names, or row-level
notes.

## Source Identity Strategy

Phase 1 does not add a new `sourceId` column to the operational Sheet.

Use a row-based source reference at first:

```js
sourceRef: {
  spreadsheetId,
  sheetName: "학생 보건실 입실현황",
  rowNumber
}
```

Document IDs may use the same basis, for example:

- `2026_2_2026-09-04_row_123`
- `sheetRow_123`

Risk:

- Row insertion or deletion can make row-based identity unstable.
- Deleted rows can leave orphan projection documents.
- A full rebuild must be able to remove orphans and restore consistency.

Future option:

- Add a hidden stable `sourceId` column to the Sheet.
- This is intentionally not part of Phase 1 because preserving the current
  master Sheet structure is more important than perfect identity tracking at
  the first projection step.

## Sync Policy

Use a mixed sync strategy.

### 1. Installable `onEdit`

- Sync only the edited row.
- Purpose: near-real-time reflection after the health teacher edits the Sheet.
- Expected freshness: almost immediate when the trigger succeeds.

### 2. Five-Minute Correction Batch

- Re-scan recent operational ranges, especially today and recent rows.
- Purpose: recover missed trigger events and normalize derived fields.
- Stale target: no more than about 5 minutes for ordinary staff lookups.

### 3. Nightly Rebuild

- Rebuild the active projection window from the Sheet master.
- Remove orphan projection documents caused by row deletion or row movement.
- Purpose: restore consistency after edits, deletions, insertions, trigger
  misses, or partial sync failures.

## Update And Delete Handling

- Sheet edits should upsert the corresponding projection documents.
- Sheet row deletion is not reliably detected by a simple edit trigger.
- Orphan projection documents should be removed by the five-minute correction
  batch or the nightly rebuild.
- Firestore projection data must always be disposable and rebuildable from the
  Sheet master.

## Homeroom Confirmation Writes

`homeroomConfirmed` is a user action, but the Sheet remains the master.

Phase 1 write path:

1. Homeroom teacher clicks confirm.
2. Browser sends Firebase ID token to the authenticated Vercel API.
3. Vercel API verifies current `user_assignments`.
4. Vercel API sends a protected request to Apps Script.
5. Apps Script updates the original Sheet row.
6. Projection sync updates Firestore after the Sheet write.

Do not introduce a two-way model where the browser writes Firestore first and
then syncs backward into the Sheet.

## Permission Model

Permissions continue to come from current-term `user_assignments`.

### `staff`

- May read `student_care_presence_public`.
- Must not read homeroom-only documents.
- Must not read monthly aggregates unless explicitly promoted to admin roles.

### `homeroom`

- May read `student_care_presence_public`.
- May read `student_care_presence_homeroom` only where:
  - `schoolYear` and `semester` match the current assignment.
  - `grade` and `classNo` match the current assignment.
- Must not choose another grade/class in the client and have it trusted.

### `health_teacher` / `admin`

- May read public and homeroom projections as needed for operations.
- May read `student_care_monthly_aggregates`.
- Detailed student health lookup remains on the secure Apps Script source path
  for Phase 1.

Do not rely on Firestore field-level redaction for privacy. Split collections
by access surface so each document contains only fields safe for its readers.

## Privacy Rules

The default projection collections must not contain:

- student real names
- disease names
- primary symptoms
- treatment details
- diagnosis names
- protected-student status or reasons
- contact numbers
- guardian information
- counseling content
- free-form health memo text

If Apps Script does not currently show a field to staff or homeroom users, do
not put that field in the corresponding Firestore projection.

## Failure And Fallback

Projection sync failure must not affect Sheet input.

Required behavior:

- The health teacher can keep using the Sheet master.
- Sync failures are logged for administrators.
- The next correction batch or nightly rebuild can repair stale data.
- Staff/homeroom UI must not silently show stale projection failure as "0
  records".
- Show a clear state such as: "최근 동기화가 지연되고 있습니다."
- `health_teacher` may use the existing secure Apps Script fallback when
  projection data is stale or unavailable.

## Apps Script Role After Projection

Current pattern:

- User lookup request
- Vercel API
- Apps Script
- Google Sheet runtime read

Target pattern:

- Sheet edit or scheduled sync
- Apps Script writes Firestore projection
- User lookup reads Firestore projection

Apps Script should remain responsible for:

- maintaining the master Sheet workflow
- projection sync
- homeroom confirmation writes to the Sheet master
- health-teacher detail lookup fallback
- correction batch and full rebuild jobs

Runtime reads to reduce:

- general staff health-room presence lookup
- homeroom presence lookup
- homeroom monthly lookup
- admin monthly statistics

Runtime reads to keep in Phase 1:

- health-teacher detailed lookup that includes symptom, treatment, or result
  detail
- emergency fallback while projection sync is stale

## Migration Plan

### Phase 0: Document And Schema Freeze

- Freeze this document as the implementation reference.
- Do not change Sheet workflow or existing Apps Script read endpoints.

### Phase 1: Monthly Aggregates

- Generate `student_care_monthly_aggregates`.
- Compare aggregate counts with the current Apps Script admin stats response.
- Keep UI on the current path until counts match.

### Phase 2: Public Presence Projection

- Generate `student_care_presence_public`.
- Compare staff/subject lookup count and visible fields against Apps Script.
- Verify no symptom/treatment/result detail fields exist in documents.

### Phase 3: Homeroom Projection

- Generate `student_care_presence_homeroom`.
- Compare homeroom current lookup and monthly lookup against Apps Script.
- Verify assignment-based grade/class filtering in queries and rules.

### Phase 4: Firestore-First Reads

- Switch `/student-care` staff/homeroom/admin aggregate reads to Firestore
  first.
- Keep health-teacher detail lookup on Apps Script.
- Keep secure Apps Script fallback for stale/error states.

### Phase 5: Dual-Read QA

- For a limited period, compare Firestore projection results with Apps Script
  results.
- Compare counts and visible fields, not sensitive full row content in logs.

### Phase 6: Runtime Read Reduction

- After stable dual-read QA, reduce normal user-facing Apps Script runtime
  reads for the projected surfaces.
- Keep rebuild, fallback, and source write paths.

Every phase must be rollbackable without changing or deleting the Sheet master.

## Implementation Safety Lines

- Do not change the operational Sheet input workflow.
- Do not delete operating data.
- Do not copy the full student health record into Firestore.
- Treat Firestore projection as a rebuildable read model.
- Keep existing Apps Script fallback until projection has passed dual-read QA.
- Do not remove existing working endpoints before the replacement surface is
  observed in production.
