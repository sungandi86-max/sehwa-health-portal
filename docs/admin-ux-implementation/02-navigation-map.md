# 관리자 내비게이션 지도

## 관리자 홈

| 메뉴 | 목적지 |
|---|---|
| 관리자 홈 | `/firebase-dashboard` |

## 제출·검토

| 메뉴 | 목적지 | 의미 |
|---|---|---|
| 접수자료 검토 | `/firebase-admin/submissions` | 실제 제출 문서와 첨부파일 검토 |
| 대상자별 제출 현황 | `/firebase-admin/submission-status` | 제출 대상자별 제출 여부 |
| 업무별 완료 현황 | `/firebase-admin/staff-submission-status#completion-status` | 업무 기준 최종 완료 상태 |

## 검진·검사

| 메뉴 | 목적지 | 비고 |
|---|---|---|
| 건강검진 유형·경로 확인 | `/firebase-admin/staff-submission-status?view=screening-types` | 건강검진 유형 view에서 기존 패널 재사용 |
| 결핵검진 완료 현황 | `/firebase-admin/staff-submission-status?view=tb-completion&task=tb-screening-2026` | 기존 task projection 재사용 |
| 검진 확인자료 접수 | `/firebase-admin/submissions?tab=staff` | 기존 교직원 접수 탭 재사용 |
| 별도검사 운영 도우미 | 링크 없음 | `연동 예정` 비활성 상태 |

향후 `/firebase-checkups/live`가 구현되기 전에는 별도검사 항목에 route나 권한을 부여하지 않는다.

## 교육·연수

| 메뉴 | 목적지 |
|---|---|
| 교육 운영 관리 | `/firebase-admin/trainings` |
| CPR 개별 이수증 검토 | `/firebase-admin/submission-status?item=cpr` |
| CPR 학교 단체교육 등록 | `/firebase-admin/trainings?mode=manual-cpr-2026#manual-cpr-batch` |
| CPR 통합 완료 현황 | `/firebase-admin/staff-submission-status?view=cpr-completion&task=cpr-training-2026` |
| 연구부 연수 원본 점검 | `/firebase-admin/staff-submission-status?view=research-check#training-source-check` |
| 연수 현황 새로고침 | `/firebase-admin/staff-submission-status?view=research-check#training-source-refresh` |
| 법정의무연수 예외 관리 | `/firebase-admin/staff-submission-status?view=training-exceptions` |
| 법정의무연수 보고서 | `/firebase-admin/training-reports` |

## 계정·권한

| 메뉴 | 목적지 |
|---|---|
| 권한 신청 처리 | `/firebase-admin/access-requests` |
| 교직원 계정·권한 관리 | `/firebase-admin/users` |

## 감염병

| 메뉴 | 목적지 | 의미 |
|---|---|---|
| 감염병 보고 접수 | `/firebase-admin/submissions?tab=infection` | 제출된 보고 문서 접수·검토 |
| 감염병 사례관리 | `/firebase-admin/infections` | 접수 후 사례 상태 관리 |

## 대시보드 빠른 이동

1. 접수자료 검토
2. 대상자별 제출 현황
3. 건강검진 확인
4. 연구부 연수 원본 점검
5. CPR 교육 관리
6. 법정의무연수 보고서

## 교육 상세 breadcrumb

- `health_teacher/admin`: `관리자 홈 > 교육·연수 > 교육 운영 > 현재 교육 업무`
- `training_admin`: `교직원 교육센터 > 현재 교육 업무`

교육 상세의 대상자, QR, 출석, 연수등록부 메뉴와 기존 권한은 변경하지 않았다.
