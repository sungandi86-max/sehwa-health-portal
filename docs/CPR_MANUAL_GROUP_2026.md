# 2026 CPR 학교 단체교육 오프라인 일괄 등록

## 진입점과 업무 계약

기존 **교직원 교육 관리**의 `2026 CPR 단체교육 일괄 등록` 버튼을 사용한다. 새로운 상위 메뉴는 없다. 현재 학기 canonical assignment와 재직 명단으로 확인된 보건교사/최상위 관리자만 preview/commit API를 호출할 수 있다. 일반 교직원, 미인증 사용자 및 위임 `training_admin`은 호출할 수 없다.

학년도는 숫자 2026으로 고정된다. 교육명, 교육일(2026년의 유효한 과거/오늘 날짜), 시작·종료 시간, 오프라인 명부 대조 근거를 입력한다. 명단은 기존 교직원 조회 경로를 사용한다. 이름/ID 검색 및 부서 필터 후 전체 선택은 **현재 표시된 검색·부서 결과에만** 적용되고 다른 부서 선택은 유지된다. 한 요청은 최대 100명이다. 실제 미참석자는 선택 해제한다.

미리보기는 저장하지 않는다. 대상별 기존 이수·출석·계정 연결 상태를 확인한 후 관리자가 실제 오프라인 명부 대조를 최종 확인해야 commit할 수 있다. 기존 완료·불명확한 자료는 덮어쓰지 않고 이유를 표시한다. 2027 QR 자동 연동은 추가하지 않는다.

## 기존 원장 재사용

새 컬렉션/마이그레이션/Sheet 쓰기는 없다.

| 자료 | 기존 경로 | 이번 기록 |
| --- | --- | --- |
| 교육 이벤트 | `training_events_{qa,production}` | 명시적 `completionTaskId=cpr-training-2026`, `registrationMode=admin_offline_cpr_2026`, 비활성 QR 이벤트, 참석 대상 snapshot 및 요청 계획 |
| 출석 원본 | `training_signature_ledger_{qa,production}/{기존 event+staff 키}/signatures/{signatureId}` | 기존 완료 출석 계약, `sourceType=admin_offline_cpr_2026`, 변경 불가 `manualEvidence` |
| 원본 변경 이력 | 위 원본의 `history` | `offline_roster_confirmed`, 처리자·시각·원본 행 |
| CPR 통합 현황 | production `staff_submission_status`, QA `staff_submission_status_qa` | 기존 `{staffId}_cpr-training-2026`, 기존 group projection 생성 함수 및 revision |
| 중복 방지 | `training_attendance_locks_{qa,production}` | 완료 잠금, 동일 event/staff 연결 |

`서명일시`와 `서명파일ID`는 비워 둔다. QR 또는 본인 전자서명으로 표시하지 않는다. 실제 등록 시각·canonical 관리자 staffId·등록 근거·requestId는 별도 기록한다. 화면과 Excel/PDF 명부에도 **관리자 등록 (오프라인 명부 확인)**으로 표시한다. 기존 개별 이수증, 기존 출석 및 기존 관리자 승인·반려·무효 자료는 수정하지 않는다.

## 멱등성과 복구

- 클라이언트 요청 ID는 제출 전에 생성하고 확인 이후에는 교육 정보·선택 명단과 함께 고정한다. 인증 UID별 sessionStorage로 같은 브라우저의 새로고침 복구를 지원한다. 이름/서명/파일/credential은 저장하지 않는다. 등록 근거에는 명부의 개인정보를 붙여 넣지 않는다.
- 서버 eventId와 signatureId는 요청 ID 및 canonical staffId에서 결정적으로 생성된다. 서버 fingerprint는 교육 내용·전체 선택·실제 관리자도 포함한다. 같은 요청 ID를 다른 내용/관리자로 재사용하면 거절한다.
- 새 요청은 최신 미리보기 fingerprint가 일치해야 실행된다. 먼저 불변 이벤트/계획을 transaction으로 확보한다.
- 각 참석자의 **출석 원본 + history + CPR 현황 + 완료 잠금**을 하나의 transaction으로 저장한다. 이 단계의 실패는 원본까지 rollback된다. 업로드/Drive 저장 단계는 존재하지 않는다.
- 일부 실패 시 성공한 참석자는 유지된다. 같은 요청 재시도는 이미 저장된 원본을 확인해 건너뛰고 아직 없는 원본만 처리한다. 응답 단절·중복 클릭·동시 요청도 같은 계약을 사용한다.
- 재시도 시 현재 assignment/UID/활성, 기존 원본, 잠금 및 projection revision을 다시 확인한다. 기존 개인·단체 이수 완료 또는 새 관리자 처리가 있으면 덮어쓰지 않는다. 취소된 원본은 자동 복원하지 않는다. 수동 검토가 필요한 상태는 자동 재등록하지 않는다.
- 성공·건너뜀·실패와 이 요청 등록 확인 수를 별도로 표시한다. 실패가 없을 때에만 `다른 교육·명단 새로 등록`으로 새 요청을 시작할 수 있다.
- 이벤트의 대상·내용은 일반 교육 수정 API로 변경하지 못한다. 기존 출석 취소/CPR 재계산은 최상위 관리자에게만 허용하고 기존 계약을 사용한다. 일반 `mark-attended` 보정이나 QR로 이 오프라인 이벤트에 새 서명을 만들 수 없다.

## 보안·운영 호환성·비용

P0-1/P0-3 실제 DB 프로젝트 guard와 명시적 training environment를 재사용한다. 주입 DB/QA 프로젝트 불일치 및 unknown 환경은 DB 읽기 전에 거절한다. 명단 조회는 P0-2 QA Sheet 정책을 통과해야 한다. QA 원장은 운영 원장으로 fallback하지 않는다. production은 기존 collection명·상태 구조를 유지한다. API Functions를 늘리지 않고 기존 staff-directory dispatcher의 preview/commit resource를 추가했다.

현재 학기 선택은 기존 `CURRENT_SCHOOL_YEAR/CURRENT_SEMESTER`를 재사용하며 assignment의 UID·경로·숫자형 학년도/학기·active·역할을 엄격히 검사한다. 불명확한 다중 연결·QA 전용 합성 assignment·미연결·비활성은 건너뛴다. 학년도는 이번 기능에서 2026만 허용한다.

준비된 기존 signature ledger marker가 필수다. marker가 없으면 503이며 자동 migration/bootstrap하지 않는다. 실제 운영 marker 준비 여부는 이번 작업에서 조회하지 않았다. Admin SDK는 Rules를 우회하므로 서버 권한 검사와 Emulator Rules 회귀 결과는 별도로 해석한다. Rules는 수정하지 않았다.

preview는 5명씩 제한 병렬 조회하며 staff별 assignment/pair query를 최대 101개까지만 읽는다. 100개 초과나 모호한 원본은 자동 처리하지 않는다. 새 복합 인덱스는 추가하지 않았다(기존 단일 필드 인덱스 전제). commit은 참석자별 transaction으로 처리한다. 실제 배포의 요청 제한시간/지연/비용은 live QA에서 확인해야 한다. 중간 timeout도 같은 요청 ID로 재시도한다. 기존 명부 출력 최대 인원 제한은 유지된다.

## 로컬 검증과 미검증 경계

- `node --test server/lib/cprManualBatch.test.js server/lib/trainingFinalSheet.test.js`: 100명 합성 명단, 80명 선택, 기존 개인/단체 완료 보호, 비활성/미연결, 권한, 동시 중복, rollback/재시도, 원본 취소/최신 상태 보호, QA/production mock 경계, 실제 출력 함수.
- 기존 loopback browser runner에 실제 React 화면과 실제 API/service를 합성 Admin DB로 연결했다. `python tools/browser/check_manual_cpr.py`는 PC/모바일 선택·미리보기·확정·결과·중복·부분 실패·새로고침을 검증한다. 기존 browser 검사와 독립 실행한다.
- browser runner 실행 시 Node 22 및 합성 환경 `APP_ENV=qa`, `QA_FIREBASE_PROJECT_ID=isolated-health-qa`, `QA_STAFF_ROSTER_SOURCE_SPREADSHEET_ID=QA_WORKBOOK_TEST_ONLY`를 사용한다. 이 값은 테스트 전용이며 실제 자원 식별자가 아니다. 서버는 `127.0.0.1:4179`만 listen한다. browser는 non-loopback 요청을 차단한다. production 앱에는 테스트 SDK/fixture 진입점이 없다.
- 전체 `npm test`, checksum 검증된 demo-project Firestore Emulator, 일반/명시적 production build를 별도로 실행한다. lint/typecheck 스크립트는 없다.
- 실제 OAuth/Firebase/Google/학교 데이터/운영 또는 QA 배포는 수행하지 않는다. 실제 Vercel timeout, 기존 운영 문서 호환성, 운영 signature ledger 준비 상태, live 동시성·부하와 비용은 아직 BLOCKED/미검증이다. 이번 구현의 로컬 PASS는 운영 사용 승인을 의미하지 않는다.

## 이번 로컬 실행 결과

- 일반 테스트 **649/649 PASS** (기준 636개에서 13개 추가).
- 일괄 등록/출력 관련 테스트 **21/21 PASS** (전체 테스트에 포함).
- Firestore Rules Emulator **220/220 PASS**, 합성 demo-project/loopback, 실행 후 정리.
- 신규 실제 Chromium **4/4 시나리오 PASS**: 100명 중 80명 선택, 79+1 부분 실패/복구, 중복·새로고침·통계·새 요청, 모바일 기존 완료 보존, 일반 교직원 거절.
- 기존 Chromium **53 + 7 + 7 = 67 PASS** (권한/교육센터, 기존 fixture/신원, 제출/CPR/TB).
- 일반 및 명시적 production 빌드 PASS. lint/typecheck는 미정의로 N/A.
- `git diff --check` 및 신규 파일 공백 검사 PASS. 변경 파일의 새 private key/API key/token/service account JSON/실 GAS·Sheet URL 패턴 0.
- 기존 명부 Excel/PDF 출력 한도 **95명** 유지. 이번 80명 시나리오는 한도 이내이며 96~100명 명부 출력 확장은 별도 범위다.
- 실제 Firebase/Google/학교 데이터 접근·로그인·배포·migration·commit·push는 0. 테스트 서버와 Emulator는 종료했다.

## 변경 파일 (22개)

```text
server/lib/cprManualBatch.js
server/lib/cprManualBatch.test.js
server/lib/trainingCenter.js
server/lib/trainingCenterPhase2.js
server/lib/trainingCenterPhase2Api.js
server/lib/trainingCenterPhase2Resources.js
server/lib/trainingEventStore.js
server/lib/trainingSignatureLedger.js
server/lib/trainingFinalSheet.js
server/lib/trainingFinalSheet.test.js
server/lib/trainingRosterPdf.js
src/components/ManualCprBatchPanel.jsx
src/lib/trainingAttendancePresentation.js
src/lib/trainingCenterPhase2.js
src/pages/FirebaseTrainingAdminPage.jsx
src/pages/FirebaseTrainingAttendanceAdminPage.jsx
tests/fixtures/manualCprDb.js
tools/browser/entry.jsx
tools/browser/serve.mjs
tools/browser/manualCprServer.mjs
tools/browser/check_manual_cpr.py
docs/CPR_MANUAL_GROUP_2026.md
```

## 재요청 점검 및 실제 로컬 Admin SDK 보강 검증

시작 HEAD `67e4fbec50386ced063b81f59870b44abf596b74`, working tree clean에서 기존 구현을 확인했다. 요청한 일괄 등록 기능은 이미 포함되어 있어 중복 구현하지 않았다. 업무 코드는 저장 결과의 CPR 현황 링크가 기본 TB 업무를 열지 않도록 `?task=cpr-training-2026`을 명시한 것만 수정했다. 등록 원장·서버 권한·증빙·이수 보호 계약은 그대로 유지한다.

기존 Chromium 100명/80명 검사에 정확한 CPR 현황 링크 검증을 추가했다. PC·모바일에서 검색/부서별 범위 선택/미참석자 제외, 미리보기/최종 확인, 79+1 부분 실패/재시도, 중복 클릭/동일 요청 재전송, 새로고침 복구, 기존 개인·단체 완료 보존, 통계, 일반 교직원 차단을 다시 실행한다.

기존 Emulator 권한 행렬 끝에 실제 `firebase-admin/firestore` transaction을 사용하는 로컬 통합 검사 1개를 추가했다. 기존 합성 fixture의 100명과 assignment/readiness marker만 demo-project에 seed한다. 이 marker는 테스트용 합성 자료이며 운영 migration이나 readiness 변경을 뜻하지 않는다.

- 기존 runner의 checksum 검증 JAR, demo-project ID 고정, loopback 주소 검사를 사용한다.
- credential이 없는 임시 HOME/환경에서 실행하며 서비스 계정이나 실계정은 사용하지 않는다. 선택적 ADC/universe metadata 탐색을 막기 위해 테스트 Firestore client의 universeDomain을 명시한다. SDK endpoint는 기존 Emulator 환경변수로 loopback에 고정된다.
- 실제 server `runManualCprBatch`, 기존 event store/signature ledger/CPR projection을 사용한다. mock DB로 성공을 반환하는 검사가 아니다.
- 미리보기 80명, 쓰기 0을 확인한다. 한 명의 projection write를 transaction 안에서 의도적으로 실패시켜 원본/잠금/현황이 함께 rollback되는지 검사한다.
- 79명 성공/1명 실패 후 같은 요청을 동시에 두 번 재시도한다. 새 원본은 합계 1개만 추가되고 최종 완료/원본은 80개, 이벤트는 1개, 미참석자 기록은 0개여야 한다.
- 각 실제 원본의 감사 history 1개, 관리자/근거 보존, 빈 본인 서명 시각/서명 파일을 검사한다.
- Admin SDK는 Rules를 우회한다. 이 새 검사만으로 API 인증·Rules 권한을 검증했다고 해석하지 않으며 기존 서버 mock와 220개 Rules 권한 검사를 함께 유지한다.
- runner 종료 시 client/Emulator/임시 데이터는 정리한다. 실제 Firebase·Sheets·Drive·GAS 호출, 인덱스/Rules 배포, commit/push는 하지 않는다.

이번 변경 파일은 `src/components/ManualCprBatchPanel.jsx`, `tools/browser/check_manual_cpr.py`, `tools/firestore-rules/matrix.mjs`, 이 문서의 4개다. Live QA/실제 원장 준비 상태/실프로젝트 인덱스/운영 처리 시간 및 비용은 여전히 미검증이다. 기존 명부 출력 최대 95명 제한도 유지한다.

재실행 결과: 일반 테스트 **652/652 PASS**, 기존 Rules 220개 + 실제 로컬 Admin SDK 일괄 등록 통합 1개 = Emulator **221/221 PASS**, 실제 Chromium PC·모바일 **4/4 PASS**, 일반/명시적 production 빌드 PASS, `git diff --check` PASS. 최종 Emulator 실행에는 MetadataLookup 경고가 없었다. Checkpoint 준비 YES이며 실제 운영 사용/배포 승인은 별개다.
