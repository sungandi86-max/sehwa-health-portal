# Portal UI Governance

## 1. Core Rule

디자인 리팩터링은 기능 변경이 아니다.

BOGUNON 스타일로 화면을 정리하더라도 기존 메뉴의 의미, 권한, route, 데이터 범위, API/query, legacy fallback, 사용자 동선을 임의로 변경하지 않는다. 화면이 더 깔끔해 보인다는 이유만으로 업무 기능을 삭제하거나 합치지 않는다.

UI 단순화는 업무 기능 단순화가 아니다.

## 2. Menu Meaning Must Be Preserved

비슷해 보이는 메뉴라도 업무 목적이 다르면 별도 기능으로 유지한다.

| 메뉴 | 업무 목적 | 유지 원칙 |
|---|---|---|
| 학급별 월별 입실현황 조회 | 특정 학급의 월별 보건실 이용 기록 확인 | 담임 조회와 보건교사 학급 선택 조회를 유지한다. |
| 관리자용 보건실 입실 통계 | 학교 전체 보건실 이용 현황 집계 | 학급별 조회와 합치거나 대체하지 않는다. |
| 보건실 소재 확인 | 수업 중 학생의 현재 소재와 복귀 여부 확인 | role mode tab 없이 Firebase role로 접근 여부만 판단한다. |

`학급별 월별 입실현황 조회`와 `관리자용 보건실 입실 통계`는 모두 월별 정보를 다루지만 업무 목적과 데이터 범위가 다르다. 디자인 작업에서 두 기능을 하나로 합치거나 한 기능으로 다른 기능을 대체하지 않는다.

## 3. Design Phase Prohibitions

디자인 Phase에서는 다음을 하지 않는다.

- 기존 메뉴 삭제
- 기존 메뉴 숨김
- 메뉴명 의미 변경
- 클릭 route 변경
- 기능 통합
- 기능 분리
- 권한 축소
- 권한 확대
- API/query 교체
- legacy fallback 제거
- 관리자 기능을 "중복"으로 판단하여 삭제

위 변경이 필요하면 디자인 작업에 섞지 않고 별도 기능/권한 Phase로 분리한다.

## 4. Administrator Access Principle

`health_teacher`와 `admin`은 관리자 역할이다. 특별한 개인정보 최소화 정책이 있는 경우를 제외하고, 관리자가 필요한 하위 실무 기능보다 기능 범위가 좁아지지 않도록 설계한다.

단, `admin`이라고 모든 학생 건강정보 상세 접근을 자동 허용하지 않는다. 기능 접근 범위와 건강정보 상세 접근 권한은 구분한다.

## 5. Role Philosophy

| Role | 기본 철학 |
|---|---|
| staff | 일반 교직원에게 필요한 최소 업무 기능을 제공한다. |
| homeroom | staff 기능에 더해 자기 학급 관련 기능을 제공한다. |
| health_teacher | 보건실 운영과 관리에 필요한 기능을 제공한다. |
| admin | 시스템 관리 기능을 제공하되, 학생 건강정보 상세 접근은 별도 privacy policy를 따른다. |

role hierarchy를 단순한 상하관계로만 해석하지 않는다. 실제 업무 범위와 개인정보 최소화 기준을 함께 본다.

## 6. Fixed `/student-care` Policy

디자인 작업에서 다음 기능을 임의로 삭제, 통합, 대체하지 않는다.

| Role | 표시 기능 |
|---|---|
| health_teacher/admin | 학급별 월별 입실현황 조회, 관리자용 보건실 입실 통계, 보건실 소재 확인 |
| homeroom | 자기 학급 월별 입실현황 조회, 보건실 소재 확인 |
| staff | 보건실 소재 확인 |
| signed-out | login gate |

### 학급별 월별 입실현황 조회

homeroom:

- 자기 학급 고정
- 월 선택
- 자기 학급 조회

health_teacher/admin:

- 학년 선택
- 반 선택
- 월 선택
- 선택 학급 조회

staff:

- 기본 미노출

이 기능은 `관리자용 보건실 입실 통계`와 별도 기능으로 유지한다.

### 관리자용 보건실 입실 통계

- 학교 전체 보건실 이용 현황 집계
- health_teacher/admin 대상
- 학급별 월별 조회와 합치지 않음

### 보건실 소재 확인

허용:

- staff
- homeroom
- health_teacher
- admin

비로그인:

- login gate

UI에서 교과교사용/보건교사용 role mode tab으로 나누지 않는다. Firebase role로 접근 여부만 판단한다.

## 7. Fixed `/upload` Policy

디자인 작업 시 다음을 유지한다.

- 제출 항목 route 유지
- infection -> Firebase submit redirect 유지
- CPR/TB/student_tb_reply 등 기존 기능 유지
- 카드/list 표현만 변경 가능

제출 항목이 오래돼 보이거나 비슷해 보인다는 이유로 route나 submit target을 바꾸지 않는다.

## 8. Fixed Admin Screen Policy

디자인 작업으로 다음 기능을 삭제하거나 통합하지 않는다.

| Route | 보존 기능 |
|---|---|
| `/firebase-admin/users` | user edit, staffId linking, account management |
| `/firebase-admin/staff-submission-status` | TB, CPR, 보건 관련 법정의무연수, research dry-run, manual refresh |
| `/firebase-admin/infections` | 감염병 case management |

## 9. BOGUNON Design Scope

디자인 Phase에서 허용되는 변경:

- spacing
- typography
- radius
- shadow
- color
- density
- card/list 표현
- button hierarchy
- form style
- empty state
- visual grouping

디자인 Phase에서 금지되는 변경:

- 기능 의미
- route
- 권한
- data source
- data scope
- business logic
- API/query
- legacy fallback

## 10. Pre-Refactor Checklist

디자인 수정 전 route별로 반드시 확인하고 기록한다.

1. 메뉴 목록
2. 메뉴명
3. 클릭 route
4. role별 표시 조건
5. API/query
6. legacy fallback
7. 실제 데이터 범위
8. 현재 Production 동작

기록 없이 바로 UI 구조를 바꾸지 않는다.

## 11. Post-Refactor Checklist

디자인 수정 후 반드시 before/after를 비교한다.

- 메뉴 수
- 메뉴 의미
- route
- role별 노출
- API/query
- 데이터 범위
- 사용자 동선

하나라도 디자인 변경 전과 다르면 기능 회귀 가능성으로 보고한다. 의도한 기능 변경이 필요하면 별도 Phase로 분리하고 사용자 승인을 받는다.

## 12. Menu Removal Or Merge Conditions

메뉴 삭제/통합은 다음 조건을 모두 충족할 때만 가능하다.

- 사용자 명시 승인
- 기존 기능 대체 확인
- 실제 caller 확인
- 권한 차이 없음
- 데이터 범위 차이 없음
- rollback 가능

디자인 Phase에서는 메뉴 삭제/통합을 수행하지 않는다.

## 13. Legacy Feature Policy

legacy UI/API가 오래돼 보인다는 이유만으로 삭제하지 않는다.

삭제 전 필수 확인:

- caller audit
- Production usage 확인
- 대체 기능 확인
- 권한 차이 확인
- 데이터 범위 차이 확인
- rollback 계획

legacy fallback 제거도 기능 변경이다. 디자인 작업에 섞지 않는다.

## 14. Production QA Rule

디자인 변경은 가능하면 실제 로그인 세션에서 확인한다.

최소 확인 role:

- health_teacher
- homeroom
- staff

실계정 QA가 불가능하면 `정적 검증`이라고 명확히 기록한다. 실계정으로 확인하지 않은 항목을 `정상 확인`이라고 단정하지 않는다.

## 15. AI Coding Assistant Instructions

AI coding assistant가 디자인/리팩터링 작업을 할 때는 다음을 따른다.

작업 전:

1. `docs/PORTAL_UI_GOVERNANCE.md`를 먼저 읽는다.
2. 현재 route/menu/role/API/query/fallback을 audit한다.
3. 기능 변경 금지 범위를 확인한다.

작업 후:

1. before/after 기능 비교를 기록한다.
2. 가능한 범위에서 Production QA를 수행한다.
3. 확인한 role과 확인하지 못한 role을 구분해 보고한다.
4. 메뉴 의미, route, 권한, 데이터 범위 회귀 여부를 보고한다.

모든 디자인 관련 작업 프롬프트는 `docs/PORTAL_UI_GOVERNANCE.md`를 먼저 읽도록 명시한다.
