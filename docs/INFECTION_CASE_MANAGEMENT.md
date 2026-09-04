# Infection Case Management Model

이 문서는 온라인 보건실의 감염병 보고와 사례 관리를 Firestore 중심으로 통합하기 위한 설계 기준이다. 이번 단계의 목표는 상태 모델, schema, 권한, migration 방향을 확정하는 것이며, React, Apps Script, Firestore Rules, Google Sheet 데이터는 변경하지 않는다.

## 1. 현재 구조 요약

| 영역 | 현재 route/API/data | 역할 | 비고 |
| --- | --- | --- | --- |
| v1 공개 제출 | `/upload` 감염병 발생 보고 | Apps Script `infectionReport` action으로 Sheet에 신규 보고 기록 | Google Sheet `학생 감염병 관리 현황`에 저장 |
| v1 관리자 | `/admin/infections`, `/admin/infection-reports` | Sheet 기반 감염병 목록 조회와 관리상태 변경 | `/api/health-room-status` bridge를 통해 Apps Script 호출 |
| v2 제출 | `/firebase-submit/infection` | Firestore `student_health_submissions`에 신규 보고 생성 | 담임 또는 보건교사 권한 필요 |
| v2 관리자 | `/firebase-admin/submissions?tab=infection` | Firestore 감염병 보고 처리 상태 관리 | 현재 일반 제출 관리 화면의 tab으로 포함 |
| dashboard | `/firebase-dashboard` | `report.status == "submitted"` 기준으로 미처리 감염병 집계 | 사례 관리 상태는 아직 별도 집계하지 않음 |

현재 신규 감염병 보고는 v1 Sheet와 v2 Firestore 양쪽으로 들어갈 수 있다. 따라서 신규 보고, 관리자 확인, 사례 종결의 기준이 두 저장소에 나뉘어 있고, `report.status` 하나가 제출 처리 상태와 사례 관리 상태를 동시에 표현하고 있다.

## 2. Source of Truth 원칙

신규 감염병 보고와 사례 관리는 Firestore `student_health_submissions`를 primary/master로 전환한다.

Google Sheet `학생 감염병 관리 현황`은 장기적으로 다음 역할로 축소한다.

- 기존 v1 과거 데이터 archive
- 보건교사용 export/reference
- migration 전환 기간 동안의 read-only 확인 자료

양방향 동기화는 원칙적으로 금지한다. 감염병 데이터는 학생 건강정보이므로, 같은 사례가 Sheet와 Firestore에서 서로 다른 상태로 수정되는 구조를 만들면 충돌과 개인정보 복제 위험이 커진다.

## 3. 상태 모델

### submissionStatus

`submissionStatus`는 "감염병 보고서가 접수되고 보건실에서 확인되었는가"만 표현한다.

| 값 | 한글 표시 | 의미 |
| --- | --- | --- |
| `submitted` | 접수 | 담임 또는 보건교사가 보고서를 제출했고 아직 보건교사 확인 완료 전 |
| `reviewed` | 확인완료 | 보건교사가 보고 내용을 확인함 |

이 축은 접수 workflow만 담당한다. 사례가 종결되었는지, 복귀 확인이 필요한지는 표현하지 않는다.

### caseStatus

`caseStatus`는 "학생 감염병 사례가 현재 어느 관리 단계인가"를 표현한다. v1 Sheet의 실제 운영 상태를 기준으로 5단계를 사용한다.

| 값 | 한글 표시 | 의미 |
| --- | --- | --- |
| `new` | 신규 | 새로 접수되어 아직 업무 확인이 시작되지 않은 사례 |
| `checking` | 확인 중 | 보건교사가 보고 내용을 확인하고 추가 확인 중인 사례 |
| `managing` | 관리 중 | 등교중지, 안내, 후속 확인 등 실제 관리가 진행 중인 사례 |
| `return_check_needed` | 복귀 확인 필요 | 등교중지 종료 또는 복귀 예정일이 지나 복귀 확인이 필요한 사례 |
| `closed` | 종결 | 필요한 확인과 조치가 끝난 사례 |

## 4. 상태 전이

기본 흐름은 다음과 같다.

```text
new -> checking -> managing -> return_check_needed -> closed
```

단 모든 사례가 반드시 모든 단계를 거칠 필요는 없다. 보건교사 업무 판단에 따라 다음 전이를 허용하는 방향이 적절하다.

| 상황 | 허용 전이 |
| --- | --- |
| 경미하거나 등교중지가 없는 사례 | `new -> checking -> closed` |
| 이미 등교중지 종료 뒤 늦게 보고된 사례 | `new -> return_check_needed` |
| 보고 확인과 관리가 동시에 시작된 사례 | `new -> managing` |
| 복귀 확인이 불필요하게 확인된 사례 | `managing -> closed` |
| 잘못 종결한 사례 재확인 | `closed -> checking` 또는 `closed -> managing` |

상태 전이는 health_teacher가 직접 변경할 수 있어야 한다. 상태 모델은 업무 누락을 줄이는 도구이지, 보건교사의 실제 판단을 막는 자동 workflow가 되어서는 안 된다.

## 5. 자동 추천과 수동 확정

권장 방식은 "자동 추천 + health_teacher 수동 확정"이다.

| 방식 | 판단 |
| --- | --- |
| 완전 자동 | 날짜 계산 오류나 입력 누락으로 실제 저장 상태가 잘못 덮일 수 있어 부적합 |
| 완전 수동 | 업무 누락 방지 효과가 약함 |
| 자동 추천 + 수동 확정 | 복귀 확인 필요 사례를 놓치지 않으면서 최종 상태는 보건교사가 결정 |

예시:

- `infection.exclusionEndDate`가 오늘보다 이전이고 `caseStatus`가 `closed`가 아니면 `return_check_needed`를 추천한다.
- 추천값은 `suggestedCaseStatus` 또는 UI 계산값으로 표시하고, 저장된 `caseStatus`를 자동으로 덮어쓰지 않는다.
- 자동 batch가 필요해지더라도 저장 상태를 바꾸는 작업과 단순 추천 집계는 분리한다.

## 6. Firestore Schema 제안

현재 문서 구조는 `student`, `infection`, `report`, `submittedBy`, `submittedAt`, `updatedAt`으로 구성되어 있다. 최소 변경 원칙에 따라 `report` 아래에 새 상태 필드를 추가하는 방향을 권장한다.

```js
{
  type: "infection",
  schoolYear: 2026,
  semester: 2,
  student: {
    grade: number,
    classNo: number,
    number: number,
    name: string
  },
  infection: {
    diseaseName: string,
    diagnosisDate: string | null,
    exclusionStartDate: string | null,
    exclusionEndDate: string | null
  },
  report: {
    status: "submitted" | "reviewing" | "completed",
    submissionStatus: "submitted" | "reviewed",
    caseStatus: "new" | "checking" | "managing" | "return_check_needed" | "closed",
    note: string | null,
    reviewedAt: timestamp | null,
    reviewedBy: string | null,
    caseUpdatedAt: timestamp | null,
    caseUpdatedBy: string | null,
    caseNote: string | null
  },
  submittedBy: {
    uid: string,
    email: string,
    displayName: string
  },
  submittedAt: timestamp,
  updatedAt: timestamp
}
```

`report.status`는 즉시 삭제하지 않는다. 전환 기간에는 기존 화면, dashboard, Rules compatibility를 위해 유지하고, 새 화면은 `submissionStatus`와 `caseStatus`를 우선 읽는다.

병원명, 상세 증상, 진료 내용 같은 현재 없는 민감정보는 새 schema에 추가하지 않는다.

## 7. 신규 문서 기본값

신규 감염병 보고 생성 시 기본값은 다음과 같이 둔다.

```js
report: {
  status: "submitted",
  submissionStatus: "submitted",
  caseStatus: "new",
  note: note || null,
  reviewedAt: null,
  reviewedBy: null,
  caseUpdatedAt: null,
  caseUpdatedBy: null,
  caseNote: null
}
```

`report.status`는 transitional compatibility용으로 당분간 `submitted`를 함께 저장한다.

## 8. 기존 상태값 Mapping

### v2 `report.status`

| 기존 값 | submissionStatus | caseStatus | 판단 |
| --- | --- | --- | --- |
| `submitted` | `submitted` | `new` | 아직 접수 확인 전으로 보는 것이 가장 보수적 |
| `reviewing` | `reviewed` | `checking` | 보건교사가 확인을 시작한 상태 |
| `completed` | `reviewed` | `closed` | 현재 v2 의미상 처리 완료에 가장 가까움 |

`reviewing`은 "확인완료"와 "확인 중"의 의미가 섞여 있다. migration 시에는 `submissionStatus = reviewed`, `caseStatus = checking`으로 두고, 보건교사가 필요한 경우 `managing` 또는 `closed`로 조정한다.

### v1 Sheet 관리상태

| v1 관리상태 | caseStatus |
| --- | --- |
| 신규 | `new` |
| 확인 중 | `checking` |
| 관리 중 | `managing` |
| 복귀 확인 필요 | `return_check_needed` |
| 종결 | `closed` |

v1에서 가져오는 기록은 이미 Sheet에 접수된 기록이므로 `submissionStatus`는 기본적으로 `reviewed`로 보는 것이 운영상 자연스럽다. 단 단순 import 직후 보건교사가 아직 보지 않은 미종결 건을 구분해야 한다면 migration dry-run에서 별도 플래그를 산출한다.

## 9. 권한 설계

감염병 데이터는 학생 건강정보이므로 `admin` role이라고 해서 상세 접근을 자동 허용하지 않는다.

| role | 권장 권한 | 이유 |
| --- | --- | --- |
| `health_teacher` | 전체 상세 read/write | 실제 보건 업무 담당자 |
| `homeroom` | 자기 학급 create, 자기 학급 최소 정보 read | 보고 접수와 필요한 조치 확인 목적 |
| `staff` | 기본 접근 없음 | 담임 배정이 없는 교직원에게 학생 건강 상세를 노출하지 않음 |
| `admin` | dashboard summary 중심, 상세는 기본 미허용 | 시스템 관리자 권한과 학생 건강정보 접근 권한을 분리 |

현재 Firestore Rules도 `student_health_submissions`에 대해 health_teacher 전체 접근, homeroom 자기 학급 접근을 기준으로 한다. 최종 Rules 수정 시에도 이 개인정보 최소화 원칙을 유지한다.

`admin`에게 상세 접근이 필요한 학교 운영 사유가 있으면 별도 decision으로 확정하고, 단순 admin role 대신 health_teacher 겸임 또는 명시적 health data permission을 검토한다.

## 10. 담임 UX

담임에게 관리자 내부 5단계를 그대로 설명형으로 노출할 필요는 없다. 다만 업무 행동을 판단할 수 있는 최소 상태는 보여야 한다.

| 내부 caseStatus | 담임 표시 |
| --- | --- |
| `new` | 접수됨 |
| `checking` | 보건실 확인 중 |
| `managing` | 관리 중 |
| `return_check_needed` | 복귀 확인 필요 |
| `closed` | 처리 완료 |

담임 화면에는 관리자 메모와 내부 case note를 기본 숨김으로 둔다. 필요 안내는 별도 공개용 안내 필드가 생길 때만 표시한다.

## 11. Dashboard 집계

새 상태 모델 적용 후 dashboard는 다음 기준으로 전환한다.

| dashboard 항목 | 권장 query/filter |
| --- | --- |
| 신규/미확인 감염병 | `report.submissionStatus == "submitted"` |
| 확인 필요 | `report.caseStatus in ["new", "checking"]` |
| 활성 관리 | `report.caseStatus in ["new", "checking", "managing", "return_check_needed"]` |
| 복귀 확인 필요 | `report.caseStatus == "return_check_needed"` |
| 종결 | `report.caseStatus == "closed"` |

Firestore composite index가 필요할 수 있으므로 실제 구현 Phase에서 route별 query를 확정한 뒤 index 필요성을 점검한다.

## 12. 관리자 화면 구조

장기적으로 감염병은 일반 제출 처리와 분리된 사례 관리 화면이 필요하다.

권장 최종 route:

```text
/firebase-admin/infections
```

이유:

- 감염병은 "제출 처리"보다 "학생 사례 관리"의 성격이 강하다.
- 복귀 확인, 활성 관리, 종결, 메모, 날짜 추천이 필요하다.
- `/firebase-admin/submissions?tab=infection`에 계속 두면 교직원 제출 상태와 감염병 사례 상태가 다시 섞인다.

`/firebase-admin/submissions?tab=infection`은 전환 기간 동안 read-only 또는 redirect 안내 후보로 둔다.

## 13. Legacy Route 처리

| route | 최종 권장 |
| --- | --- |
| `/admin/infections` | `/firebase-admin/infections`로 redirect |
| `/admin/infection-reports` | `/firebase-admin/infections`로 redirect |
| `/admin/infections/archive` 또는 별도 archive route | 필요 시 Sheet 과거 자료 read-only 조회 |

archive 화면을 제공하는 경우 상태 변경 버튼은 제거한다. Sheet archive와 Firestore 신규 사례는 시각적으로 명확히 구분한다.

## 14. v1 신규 감염병 제출 정리

현재 `/upload`의 legacy infection form은 신규 이중 master의 원인이다. 최종적으로 감염병 제출만 `/firebase-submit/infection`으로 이동한다.

다른 legacy 제출 기능은 별도 판단 전까지 유지한다.

전환 시 권장 방식:

1. `/upload`에서 감염병 보고 카드 또는 modal 진입을 숨긴다.
2. 기존 감염병 링크 접근 시 `/firebase-submit/infection`으로 안내 또는 redirect한다.
3. Apps Script `infectionReport` 신규 write는 사용 로그 확인 뒤 disable한다.
4. 과거 Sheet 기록 조회는 archive로만 유지한다.

## 15. 기존 데이터 Migration 전략

과거 Sheet 감염병 기록을 전부 Firestore로 복제하지 않는다. 개인정보 복제를 최소화한다.

| 대상 | 권장 처리 |
| --- | --- |
| 이미 종결된 과거 사례 | Sheet archive 유지 |
| 현재 미종결 사례 | selective migration 후보 |
| 현재 학년도 최근 종결 사례 | 운영 필요가 있을 때만 선택 migration |
| 오래된 통계 목적 데이터 | Sheet archive 또는 aggregate만 검토 |

기본 selective migration 기준은 다음 중 하나를 만족하는 건으로 둔다.

- v1 관리상태가 `종결`이 아님
- 현재 학년도 현재 학기 사례
- 보건교사가 최근 N개월 내 확인이 필요하다고 지정한 사례

N개월 범위는 실제 운영 데이터 규모를 보고 결정한다.

## 16. Duplicate 방지

v1 Sheet와 v2 Firestore에 같은 사례가 이미 존재할 수 있으므로 migration 전 dry-run에서 duplicate report를 먼저 만든다.

권장 match key:

```text
schoolYear + semester + grade + classNo + studentNumber + diagnosisDate + normalizedDiseaseName
```

학생 이름은 보조 확인값으로만 사용한다. 이름은 띄어쓰기, 개명, 오타 가능성이 있어 canonical key로 쓰지 않는다.

동일 key 후보가 여러 건이면 자동 병합하지 않고 review list에 남긴다.

## 17. 데이터 안전 원칙

모든 migration은 다음 조건을 만족해야 한다.

- dry-run 먼저 실행
- Sheet 원본 write 금지
- migration 대상 count와 skipped duplicate count 산출
- Firestore write 전 preview CSV 또는 JSON summary 확인
- import batch id 또는 source row reference 저장
- rollback 가능한 doc id 전략 사용
- 민감 학생정보가 console이나 로그에 과도하게 남지 않게 제한
- migration 후 Sheet 원본은 archive로 보존

## 18. Phase Plan

### Phase 0. 상태/schema 문서 확정

이 문서를 기준으로 `submissionStatus`, `caseStatus`, 권한, route, migration 범위를 결정한다.

### Phase 1. Firestore schema compatibility layer

신규 생성 문서에 `submissionStatus`와 `caseStatus`를 추가한다. 기존 `report.status`는 유지한다. 읽기 로직은 새 필드가 없으면 mapping으로 fallback한다.

### Phase 2. v2 관리자 감염병 case management UI

`/firebase-admin/infections`를 추가하고 사례 관리 중심 UI를 만든다. 보건교사는 접수 상태, 사례 상태, 복귀 확인 필요 여부, 관리자 메모를 관리한다.

### Phase 3. Dashboard 새 상태 모델 전환

dashboard 집계를 `submissionStatus`와 `caseStatus` 기준으로 바꾼다. 특히 `return_check_needed` count를 별도 노출한다.

### Phase 4. Legacy Sheet 미종결 건 selective migration

dry-run, duplicate detection, count parity를 거쳐 미종결 또는 최근 사례만 Firestore로 가져온다. Sheet 원본은 수정하지 않는다.

### Phase 5. 신규 감염병 제출 Firestore 일원화

`/upload` legacy infection entry를 제거하거나 v2 제출로 redirect한다. 다른 legacy upload 기능은 유지한다.

### Phase 6. Legacy infection Sheet write disable

사용 로그와 운영 확인 뒤 Apps Script `infectionReport` 신규 write를 disable 또는 deprecated 처리한다. 기존 archive read는 별도 유지한다.

### Phase 7. Legacy route redirect/archive

`/admin/infections`, `/admin/infection-reports`는 `/firebase-admin/infections`로 redirect한다. 과거 Sheet 조회가 필요하면 read-only archive route만 남긴다.

### Phase 8. `report.status` compatibility 제거

충분한 운영 기간 후 모든 query와 UI가 새 상태 모델을 사용하면 `report.status` 의존을 제거한다.

## 19. Legacy Sheet Write 제거 조건

`updateAdminInfectionReportStatus`를 장기적으로 제거하려면 다음 조건이 충족되어야 한다.

- 신규 감염병 보고가 Firestore로만 생성됨
- 보건교사 관리 workflow가 `/firebase-admin/infections`에서 동등하거나 더 좋게 제공됨
- 미종결 v1 사례가 Firestore로 selective migration됨
- 과거 Sheet 자료는 read-only archive로 조회 가능함
- dashboard가 새 상태 모델 기준으로 정상 집계됨
- 운영자가 일정 기간 Sheet 상태 변경 없이 업무를 완료함

조건 충족 전에는 endpoint를 바로 삭제하지 않는다.

## 20. Decision List

구현 Phase로 넘어가기 전에 다음 결정을 확정해야 한다.

1. `admin` role에 감염병 상세 read/write를 허용할지, summary만 허용할지
2. `/firebase-admin/infections` 별도 route를 만들지
3. `caseStatus` 자동 추천을 UI 계산으로만 둘지, 별도 저장 필드로 둘지
4. 과거 데이터 migration 범위를 미종결만으로 할지, 현재 학년도 최근 사례까지 포함할지
5. `/upload` legacy infection form 종료 시점
6. legacy Sheet archive UI가 필요한지
7. `report.status` compatibility 유지 기간
8. 담임에게 보여줄 상태를 내부 상태와 1:1로 둘지, 더 단순한 표시값으로 둘지

## 21. 다음 구현 Phase의 정확한 작업

다음 구현 Phase는 Phase 1로 시작한다.

- `student_health_submissions` 생성 schema에 `report.submissionStatus`와 `report.caseStatus` 추가
- 기존 문서를 읽을 때 fallback mapping 적용
- Firestore Rules에 새 `report` shape 허용
- dashboard와 관리자 화면은 아직 기존 `report.status` compatibility를 유지
- migration, Apps Script disable, legacy route redirect는 수행하지 않음

이 순서가 가장 안전하다. 상태 모델을 먼저 병행 저장하면 이후 UI, dashboard, migration을 작게 나누어 검증할 수 있다.
