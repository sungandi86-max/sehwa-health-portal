# 관리자 메뉴 UX 최소 개선 — 로컬 검증 기록

기준: `feature/cloud-qa-firebase-guard-p0` / `dcc69f0d3bdb823dfb11e1ee5a45aa080701acbb`.
이번 작업은 화면·라우팅·읽기 연결만 변경한다. 기존 서버 transaction/승인/무효/복구 원장, 권한, CPR 멱등성 및 QR 검증을 새로 구현하지 않는다.

## 수정 전후 동선

| 업무 | 수정 전 | 수정 후 |
| --- | --- | --- |
| TB 접수 검토 | 정확한 접수 → 별도 교직원 현황 메뉴의 연도별 패널 → 증빙 확인 | 정확한 접수 → 같은 카드에서 기존 검진 패널 펼치기 → 교직원/연도/자료유형 확인 → 자료 링크 검토 → 기존 확인/무효 API → 해당 접수만 재조회 |
| 접수/업무현황 왕복 | 한 방향 접수 링크, 다른 메뉴에서 다시 대상 찾기 | 접수 → 선택 교직원·해당 업무·학년도 현황 → 원래 접수 또는 저장된 evidenceSubmissionId로 정확한 접수 확인 |
| 제출 현황 복귀 | 접수 확인 후 검색을 다시 입력 | 검색/자료 종류/상태를 URL과 내부 returnTo로 유지한 복귀 링크 |
| CPR 관리자 진입 | 교육 관리로 이동한 뒤 일괄 등록 버튼 찾기 | 기존 업무현황 및 개별 CPR 접수 카드의 링크 → 기존 교육 관리의 일괄 등록 패널 자동 열기 → 통합 이수현황 |
| 홈/헤더 | 서로 다른 목록, 교육센터·학생관리·건강정보 등이 헤더에서 빠짐 | 같은 portalMenuItems 사용, 8개 기존 메뉴의 이름·경로 통일, 하위 교육 경로도 현재 메뉴 표시 |
| 교직원 교육 | 교육 상세의 오래된 추후 안내, 일반 교직원에게 대시보드 링크 노출 | 유효한 현장 QR 스캔 안내, 직접 출석 버튼 없음, 학습자 화면의 관리자 대시보드 링크 숨김 |

TB 검토 중 다른 관리자 화면으로 이동하는 횟수는 **1회 → 0회**다. 기존 CPR 패널은 다른 화면에서 교육 관리에 진입한 뒤 여는 추가 클릭을 줄였다. 다른 흐름의 전체 클릭 수·실사용 소요시간은 운영 데이터로 측정하지 않았다. 파일 열기/실제 검토 작업은 그대로 필요하다.

## 화면과 상태 구분

- **제출 현황**: 개별 자료의 접수·검토 상태를 계정 명단과 비교. `현재 페이지 제출 계정`으로 표기를 명확히 한다. 전체 접수 건수, 전체 대상 계정, 현재 페이지 상태 집계를 기존대로 구분한다. 고유 교직원 수/최종 완료 인원으로 바꾸어 표시하지 않는다.
- **교직원 제출·이수 현황**: 기존 canonical staff별 업무 완료 projection. 개인 이수증과 학교 단체교육을 구분한다. 기존 evidenceSubmissionId가 있을 때만 정확한 접수 링크를 제공하고 ID를 추측하지 않는다.
- 업무현황은 URL의 task/staffId 및 필터/검색 문맥을 유지한다. 요청 학년도와 업무 원장이 맞지 않거나 원장이 없으면 다른 학년도로 대체하지 않고 안내한다.
- 접수↔업무현황 연결은 선택한 staffId를 유지한다. 전체 교직원 현황으로 돌아가는 명시적 링크를 제공한다. 권한은 URL 값이 아니라 기존 클라이언트 gate와 서버 검사가 결정한다.
- 기존 관리자 메뉴를 삭제·통합·신설하지 않았다. 교육 로컬 사이드바의 `연수 운영관리` 명칭만 `교직원 교육 관리`로 맞췄다.
- 학습자 교육센터/상세/출석/내 현황은 대시보드 링크를 숨긴다. 관리자는 공통 헤더의 기존 역할 검사를 통과한 관리자 진입을 이용한다.

## TB 증빙 경계

기존 HealthScreeningTypeAdminPanel을 재사용한다. 접수번호, canonical staffId, 숫자형 학년도, 자료유형을 표시하고 증빙 값과 일치할 때만 처리 버튼을 허용한다. 해당 접수를 찾지 못하면 다른 자료로 대신 처리하지 않는다.

기존 API `tb-screening-workflow`의 confirm/invalidate, expectedRevision 및 기존 transaction/confirmationHistory를 사용한다. pending 확인자료만 확인 완료할 수 있고 pending/confirmed 자료만 무효 처리 진입을 제공한다. 무효 자료를 재확인하거나 복구시키는 새 동작은 구현하지 않는다. 기존 서버의 복구·과거 완료 이력 보존 규칙은 변경하지 않았다.

검진 유형 선택, 단체검진 신청, 결과서 접수, 증빙 확인, 실제 검진 완료, 자료 무효를 안내에서 구분한다. 저장 성공 후 검진 workflow와 정확한 접수만 다시 읽는다. 재조회 실패는 처리 저장 실패로 오인하지 않도록 별도 안내한다.

Preview/QA의 확인·무효 차단 조건과 productionOnly 서버 API는 변경하지 않았다. QA에서는 합성 자료 조회/화면 동선만 검사한다. production 정책을 모사한 **로컬 전용 fixture**에서 확인·무효 UI 계약을 별도로 검사하며 실제 운영 API 성공이라고 해석하지 않는다.

## 교육센터/CPR 보존

이미 구현된 출석 완료 후 `내 이수현황` 링크와 CPR projection 대기 안내는 그대로 재사용했다. 상세의 오래된 안내만 현재 QR 출석 계약에 맞췄으며 challenge 없는 출석 경로를 만들지 않았다. 이미 서명한 사용자 재진입, 전자서명, projection 재계산은 기존 회귀로 확인한다.

CPR 일괄 등록의 원장·권한·offline 증빙·중복 방지·부분 실패 복구 코드는 변경하지 않았다. 기존 100명 중 80명 선택, 부분 실패/재시도 및 통계 시나리오를 다시 실행했다. 2027 자동 연동은 구현하지 않았다.

## 로컬 검증

- 일반 테스트: **652/652 PASS** (기준 649 + 내부 복귀/TB 문맥 경계 2 + 공통 메뉴 1).
- Firestore Rules Emulator: **220/220 PASS**, 합성 demo-project, checksum 검증 JAR, loopback; 종료 후 정리.
- 신규 실제 Chromium: **7/7 시나리오 PASS**, PC 1440px / 모바일 390px. 검색 유지 왕복, 정확한 접수/업무, TB 인라인 Preview 차단, CPR 기존 패널 진입, 홈/헤더 동등성/현재 위치, 교육 QR/서명/대기/내 현황, 일반 교직원 거절·동일 SPA 계정 전환·로그아웃·직접 URL·새로고침, production-policy 합성 confirm/invalidate UI를 포함한다.
- 기존 Chromium: 권한/교육센터 **53**, 기존 fixture/신원 **7**, 제출/페이지네이션/CPR/TB **7**, CPR 일괄 등록 **4**, 합계 **71 PASS**. 신규와 합계 78개 보고 단위이며 각 단위의 내부 assertion 수와 혼동하지 않는다.
- 일반/명시적 production 빌드 PASS. 기존 Vite chunk 크기 경고는 남아 있다.
- lint/typecheck: package.json에 스크립트가 없어 **N/A**.
- diff/신규 파일 공백 검사 PASS. 신규 secret/credential/실 개인정보 패턴 유입 발견 0.

브라우저는 실제 React 화면과 synthetic SDK/HTTP를 사용하며 non-loopback 요청을 차단한다. production-policy fixture도 인증·messaging·Firestore SDK를 테스트 모듈로 대체하고 실제 credential을 사용하지 않는다. 별도 loopback 4180 정책은 테스트 서버에만 존재하며 production Vite/app 설정에는 fixture 분기나 기능 활성화 스위치를 추가하지 않는다.

재현: Node 22의 기존 `tools/browser/serve.mjs`를 QA 합성 설정으로 시작하고 `python tools/browser/check_admin_ux.py`를 실행한다. 이 신규 검사는 별도로 `BROWSER_FIXTURE_ENV=production BROWSER_FIXTURE_PORT=4180`을 지정한 같은 fixture 서버도 필요하다. 나머지 기존 browser scripts는 기존 QA loopback 서버에서 각각 실행한다. 실제 환경 변수값/credential은 추가하지 않는다.

## 미검증 및 후속 조건

- 실제 Firebase 인증, Vercel Preview/Production 라우팅, 운영 TB 확인·무효 transaction의 실자원 실행, Drive 파일 열기/권한, 실제 학교 업무 소요시간은 **BLOCKED/미실시**다.
- 기존 운영 assignment/증빙 schema와 기존 인덱스의 실프로젝트 준비 여부는 이번에 조회하지 않았다. 실제 운영 적용에는 기존 별도 비파괴적 호환성 감사와 승인 절차가 필요하다.
- URL은 검색/대상 문맥을 보존하지만 Firestore DocumentSnapshot 페이지 cursor는 보존하지 않는다. 제출 현황에 복귀하면 첫 25계정 페이지부터 조회하며 필터·집계도 계속 현재 페이지 기준이다. 무제한 전체 조회나 새 실시간 구독은 추가하지 않았다.
- 원본에 evidenceSubmissionId가 없는 과거 자료는 정확한 접수 링크를 추측해서 생성하지 않는다. 기존 수동 검색 경로는 유지한다.
- 운영 Firebase/Google/학교 데이터 접근, migration/sync/dry-run, Sheet 4개 탭 수정/삭제, GAS·Drive 설정, Rules·인덱스·서버 원장·배포 설정 변경은 0이다. commit/push/PR/배포도 수행하지 않았다.

로컬 checkpoint 준비: **YES**. 실제 운영 사용/배포 승인과는 별개다.

## 변경 파일 (24개)

```text
docs/ADMIN_WORKFLOW_UX_FINAL.md
src/components/AdminWorkspaceLayout.jsx
src/components/Header.jsx
src/components/HealthScreeningTypeAdminPanel.jsx
src/components/TrainingAdminLayout.jsx
src/data/portalNavigation.js
src/data/portalNavigation.test.js
src/lib/staffSubmissionStatusAdmin.js
src/lib/submissionNavigation.js
src/lib/submissionNavigation.test.js
src/pages/FirebaseAdminSubmissionsPage.jsx
src/pages/FirebaseStaffSubmissionStatusAdminPage.jsx
src/pages/FirebaseSubmissionStatusPage.jsx
src/pages/FirebaseTrainingAdminPage.jsx
src/pages/HomePage.jsx
src/pages/MySubmissionStatusPage.jsx
src/pages/TrainingAttendancePage.jsx
src/pages/TrainingCenterPage.jsx
tools/browser/check_admin_ux.py
tools/browser/check_submissions.py
tools/browser/entry.jsx
tools/browser/fixtureFirebase.js
tools/browser/serve.mjs
tools/browser/submissionFixture.js
```

## f113122 기준 최종 동선 보완

기존 접수 카드의 TB 인라인 확인·무효, 교직원 업무현황 왕복 링크, CPR 일괄 등록 진입점,
유효 QR 출석 및 출석 완료 후 내 이수현황 링크를 재사용한다. 서버 처리와 원장은 변경하지 않는다.

- 이전: 교직원 업무현황 링크는 staffId·학년도를 전달해도 연도별 검진 패널이 전체 명단을 표시해 재검색이 필요했다.
  이후: 접수 문맥이 없는 교직원 링크에서도 정확한 staffId·학년도로 패널을 좁힌다.
  접수 문맥이 있는 경우 submissionId·자료유형까지 기존 검증을 유지하며, 잘못된 문맥은 다른 대상/학년도로 대체하지 않는다.
- 이전: 같은 화면에서 URL·뒤로가기 이동 시 로컬 필터 상태가 남거나 URL을 덮어쓸 수 있었다.
  이후: 검색·상태·업무 필터의 단일 기준을 URL로 통일해 직접 접근·새로고침·뒤로가기에 복원한다.
- CPR 통합 현황 직접 링크는 기본적으로 전체 상태를 보여 완료된 대상도 숨기지 않는다.
  사용자가 업무 카드를 직접 선택할 때의 기존 기본 상태 필터는 유지한다.
- 업무 전체 집계와 선택 교직원/필터 명단, 검진 패널 전체 조회 인원과 표시 인원을 구분한다.
- 미등록 업무·학년도 링크를 다른 업무로 조용히 대체하지 않는다.

이 변경은 UI 조회 문맥만 지정한다. canonical staffId와 증빙 일치·권한 검증,
TB transaction/confirmationHistory·무효 계약, CPR 원본/projection 복구는 기존 코드 그대로다.
QA/Preview의 운영 TB 확인·무효 API 차단도 유지한다.
새 쿼리·전체 다운로드·실시간 구독·Rules·인덱스·메뉴·운영 GAS 변경은 없다.
페이지 커서는 URL에 저장하지 않으므로 화면 재진입 시 첫 페이지부터 조회하는 기존 제한은 남는다.

검증: 일반 테스트 654/654, Emulator 221/221, 관리자 PC·모바일 Chromium synthetic 9/9,
제출·페이지네이션 Chromium 7/7, CPR 일괄 등록 Chromium 4/4, 기존 권한·교육 Chromium 53/53 및 추가 회귀 7/7,
총 Chromium 80/80, 일반/production 명시 빌드 PASS.
lint/typecheck는 미정의로 N/A다. 브라우저 SDK/HTTP는 합성 mock이고 Emulator는 loopback demo 프로젝트다.
실제 Firebase 로그인·Vercel Preview·Drive 증빙 열람·운영 TB 완료 처리는 검증하지 않았다.
실제 외부 자원 접근·commit·push·배포는 수행하지 않는다.
