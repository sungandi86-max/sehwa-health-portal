# ADMIN-UX-01 검증 결과

## 자동 테스트

| 항목 | 결과 |
|---|---|
| 내비게이션·라우트·대시보드 targeted | PASS, 16/16 |
| 전체 `npm test` | 707 PASS / 2 FAIL / 1 SKIP, 총 710 |
| Production build | PASS |
| `git diff --check` | PASS |
| API 함수 수 | 12 |
| `npm run lint` | NOT RUN, 스크립트 없음 |
| `npm run typecheck` | NOT RUN, 스크립트 없음 |

## 기존 Windows 하네스 실패

변경 브랜치와 변경 전 `origin/main` 기준 작업공간에서 아래 두 파일을 동일하게 재실행했다.

- `tests/qa-gas/isolation.test.js`
- `tools/firestore-rules/safety.test.js`

두 환경 모두 `35 PASS / 2 FAIL`로 동일했다.

1. QA GAS 생성물 비교가 Windows CRLF와 생성 hash 차이로 실패한다.
2. Rules 안전성 테스트가 절대경로 앞에 `C:\`를 다시 붙여 `C:\C:\...`를 생성한다.

두 실패 파일과 이번 관리자 UI 변경 파일은 겹치지 않는다. assertion은 수정하거나 완화하지 않았다.

## route 및 역할 회귀

- `App.jsx`의 45개 route 등록을 정적 회귀 테스트로 확인했다.
- 기존 `/admin/infections`, `/admin/infection-reports` redirect를 확인했다.
- 일반 관리자 화면은 기존 `FirebaseAdminRoleAccessGate`를 유지한다.
- 교육 관리 화면은 기존 `allowTrainingAdmin` 계약을 유지한다.
- `training_admin`에게 관리자 홈 링크를 제공하지 않는다.
- `health_teacher/admin`에게만 교육 상세의 관리자 breadcrumb와 복귀 경로를 제공한다.
- 메뉴 노출은 기존 서버 권한 검사를 대체하지 않는다.

## 합성 브라우저 검수

실제 공통 컴포넌트를 운영 데이터와 연결하지 않은 임시 로컬 하네스에서 렌더링했다. 검수 후 하네스와 개발 서버는 제거했다.

| 화면 | viewport | 결과 |
|---|---:|---|
| 관리자 그룹 내비게이션 | 1440×1000 | PASS |
| 관리자 모바일 메뉴 | 390×844 | PASS |
| 관리자 모바일 메뉴 | 360×800 | PASS |
| 교육 상세 내비게이션 | 1440×900 | PASS |

확인 결과:

- 페이지 수준 가로 오버플로 0
- 현재 `교육·연수` 그룹 자동 펼침
- 현재 `연구부 연수 원본 점검` 활성 표시
- 모바일 닫힌 메뉴에 현재 그룹과 화면명 표시
- 모바일 메뉴 이동 후 자동 닫힘
- breadcrumb와 교육 상세 복귀 경로 표시
- 한글 메뉴·버튼 잘림 없음
- 최소 48px 모바일 메뉴 터치 영역 적용

## 캡처

- `screenshots/01-admin-navigation-desktop.png`
- `screenshots/02-admin-navigation-mobile-390.png`
- `screenshots/02-admin-navigation-mobile-360.png`
- `screenshots/03-admin-navigation-mobile-390-closed.png`
- `screenshots/03-admin-navigation-mobile-360-closed.png`
- `screenshots/04-training-navigation-desktop.png`

모든 캡처는 합성 UI이며 실제 개인정보와 운영 데이터가 없다.
