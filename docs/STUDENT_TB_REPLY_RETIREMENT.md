# 학생 결핵 진료회신 신규 제출 중단 검증

검증일: 2026-10-24. 판정: CONDITIONAL. 기능 변경 및 집중 로컬 검증은 PASS이며, 전체 테스트에는 기존 Windows 경로 실패가 남아 있다. 배포는 수행하지 않았다.

## A. 변경 요약

- 작업 브랜치: `fix/retire-student-tb-reply`
- 기준 HEAD: `de6a4066a88e3bd2469183e51bb0845569a15e98`. 이 보고서는 구현 단계 검증 기록이다. 이후 승인된 checkpoint 보존 및 배포 준비는 `STUDENT_TB_REPLY_DEPLOYMENT_PLAN.md`를 따른다.
- 시작 시 Production alias: `dpl_DBnbpevK2vsGYcDx4ayUUc7EuWYz`, 동일 SHA, READY.
- 원래 main 작업본: `c1eabb11b0ac670d3555d30b7b72a755e12a2594`, clean. 원래 작업본은 수정하지 않았다.
- 별도 worktree: 이 문서가 있는 저장소 루트 `student-reply-retirement`.

변경 파일과 역할:

| 파일 | 변경 |
|---|---|
| common/studentReplyRetirement.js | 종료 코드·안내·학생 별칭 판별 |
| api/submit.js | 학생 요청에 410/STUDENT_TB_REPLY_RETIRED 조기 반환 |
| server/lib/submissionWorkflows.js | 학생 workflow 비활성 및 validator의 종료 응답 |
| server/lib/submissionConfig.js | 공개 projection에서 학생 카드 제외. DB 설정은 그대로 보존 |
| src/pages/UploadPage.jsx | 과거 학생 URL에서 활성 페이지 대신 종료 안내 |
| src/components/UploadCenter.jsx | 오래된 카드 데이터에서도 학생 항목 제외 |
| src/components/SubmitModal.jsx | 학생 modal 직접 호출도 입력 컴포넌트 렌더링 차단 |
| src/components/StudentReplyRetiredNotice.jsx | 기존 디자인 primitive를 재사용한 종료 안내 |
| apps-script/Code.gs | 학생 raw/signed 요청 조기 거부, preflight 및 최종 학생 저장 함수 차단 |
| apps-script-qa/Code.gs | 별도 QA 진입점도 동일 학생 별칭 차단 |
| apps-script-qa/Shared.gs | 기존 오프라인 생성기로 source hash·저장 함수 방어 갱신 |
| server/lib/submissionWorkflows.test.js | 학생 신규 저장 성공 기대를 종료·무부작용 검증으로 변경; 교직원 성공 검증 유지 |
| server/lib/studentSubmissionAuditStore.test.js | 학생 API 변형·재시도 차단, 과거자료 처리·조회 검증 유지 |
| server/lib/submissionConfig.test.js | 기존 교직원 공개 카드 3개 기대 |
| src/studentReplyRetirement.test.js | 실제 컴포넌트 렌더링으로 폼 미생성·기존 카드 문구 검증 |
| tests/qa-gas/isolation.test.js | QA raw/signed 학생 요청 차단 및 교직원 격리 회귀 |

## B. 기능 중단 결과

| 검증 항목 | 결과 | 근거 |
|---|---|---|
| 공개 카드 제거 | PASS | 공개 projection 및 stale card 렌더링 테스트 |
| 직접 URL 차단 | PASS | 별칭·대소문자·공백 변형 렌더링, 실제 로컬 브라우저에서 종료 안내 및 입력 0개 |
| 서버 신규 접수 차단 | PASS | 정상 합성 파일·불완전 요청·resume 우회, QA/Production mock matrix, 실제 localhost HTTP 410 |
| Apps Script 호출 방지 | PASS | API postScript spy 0회 |
| Drive 신규 저장 방지 | PASS | Production/QA GAS raw/signed 거부, Drive/Sheet I/O 0회, 최종 학생 저장 helper 차단 |
| Firestore 신규 원장 방지 | PASS | 차단 API에서 audit read/lookup/create spy 모두 0회 |
| 개인정보 로그 방지 | PASS | 차단 요청의 console error/warn/log 0회, 정적 종료 응답 |
| 기존 자료 보존 | PASS(변경 없음) | Drive·DB·Sheets 접근/변경 도구 실행 없음. 과거 원장·관리자 GET 구현 diff 없음 |

지원하던 `student_tb_reply`, `student-file`, `student_file`와 UI 별칭 `studentfile`, `tbreply`를 공백·대소문자 정규화 후 차단한다. 잘못된 형식·과대 요청도 기존 공통 검증에 따라 거부되며 저장되지 않는다.

## C. 기존 기능 회귀 결과

| 기능 | 결과 | 검증 범위 |
|---|---|---|
| 개별 건강검진 확인서 | PASS(로컬/mock) | 기존 카드·12월 30일 안내·폼 열림, mock Drive/Firestore 접수 및 상태 회귀 |
| 심폐소생술 이수증 | PASS(로컬/mock) | 기존 카드·11월 30일 안내·폼 열림, mock 접수·서명·파일 검증 회귀 |
| 감염병 발생 보고 | PASS(로컬/mock) | 기존 카드·수시 안내, /firebase-submit/infection 이동 및 기존 자동 회귀 |
| 로그인·권한 | PASS(자동 회귀) | 기존 인증·권한 테스트. 실제 계정 로그인 NOT RUN |
| 운영·QA 분리 | PASS(자동 회귀) | 기존 정책 모듈 변경 없음, Production/QA 자원·GAS 격리 테스트 |
| 관리자·감사 조회 | PASS(mock) | 과거 원장 관리자 조회·비관리자 거부 테스트; 실제 문서 조회 NOT RUN |

집중 검증: 74/74 PASS. 전체 `npm test`: 총 697, PASS 695, FAIL 1, SKIP 1. `npm run build` PASS, 기존 500kB chunk 경고 존재. `git diff --check` PASS.

전체 실패는 변경하지 않은 `tools/firestore-rules/safety.test.js`의 `new URL(...).pathname`을 Windows Node 경로로 전달하면서 `C:\\C:\\...`와 URL 인코딩 문자가 남는 문제다. HEAD 원본 파일을 별도 로컬 위치에 복사하여 같은 실패를 재현했다. 테스트를 삭제·완화하거나 관련 없는 runner를 수정하지 않았다. Firestore Rules emulator 실행은 이번 검증에서 수행하지 않았다.

실제 브라우저는 인증·fetch가 합성 mock인 로컬 fixture에서 실제 UploadPage/UploadCenter/SubmitModal 컴포넌트와 빌드 CSS를 사용했다. 390px 모바일, 768px 태블릿, 1440px PC에서 확인했으며 학생 안내 입력 요소 0개·가로 넘침 없음, 교직원 3개 카드 및 기존 버튼을 확인했다. CPR/TB 폼 열기와 감염병 기존 URL 이동까지 확인했다. 실제 로그인·클라우드 저장 E2E 검증은 아니다.

독립 검토: 목표·제약, 품질, 보안, 연관 경로, 실행 QA 모두 PASS. 시각 검토 A(구조·기능), B(한국어·레이아웃) PASS. 독립 Chrome viewport override의 한계는 모바일 장치 전체 에뮬레이션으로 해석하지 않았다.

## D. 한계·잔여 위험·승인

- 현재 Production은 시작 시 확인한 기존 배포다. 이 변경이 반영되었다고 선언하지 않는다.
- 실제 Apps Script 배포 버전·설정은 바꾸거나 쓰기 호출로 확인하지 않았다. 웹 배포만으로 GAS 직접 경로까지 중단되었다고 선언할 수 없다.
- API/웹과 Production 및 별도 QA GAS의 승인된 배포·확인이 각각 필요하다. GAS 전체나 인증 비밀을 제거하면 안 된다.
- 기존 Drive 폴더 `1hUmRQ8kK0OYx_h4IxzFy8GXv9Ilm1w63` 및 기존 PDF 3개, 파일 ID, Sheets, 원장, QA 증빙은 보존한다. 본문 열람 없음.
- 과거 학생자료는 RETIRED_DATA, 코드 참조는 LEGACY_REFERENCED로 관리한다. 개인정보 보존·폐기 기준 검토 전 이동·삭제·이름 변경 금지.
- 구현 검증 당시 commit·push도 미승인이었다. 이후 사용자가 해당 브랜치의 checkpoint commit·일반 push를 승인했다. PR, 병합, 배포, 환경변수·DB 변경은 여전히 미승인이다.

## 재현·증빙

Node v22.23.3. 잠금 의존성을 격리 worktree에 설치했다. 추가 개발 의존성이나 package/lockfile 변경은 없다.

```sh
node --test src/studentReplyRetirement.test.js server/lib/submissionConfig.test.js server/lib/studentSubmissionAuditApi.test.js server/lib/submissionWorkflows.test.js server/lib/studentSubmissionAuditStore.test.js tests/qa-gas/isolation.test.js
node tools/qa-gas/shared.mjs --check
npm test
npm run build
git diff --check
```

로컬 비추적 증빙: `.omo/retirement-focused-final.log`, `.omo/retirement-full-final.log`, `.omo/retirement-build-final.log`, `.omo/retirement-baseline-safety.log`, `.omo/retirement-qa.mjs`. 로컬 fixture 실행은 `node .omo/retirement-qa.mjs`이며 loopback 4175만 사용한다. 이 비추적 증빙은 다른 PC에 자동 전달된다고 가정하지 않는다.

## E. 최종 판정

CONDITIONAL: 요청한 신규 제출 차단과 기존 기능 보호는 코드·집중 로컬 검증에서 PASS. 전체 테스트의 기존 Windows 실패, emulator NOT RUN 및 실제 인증·운영 배포 검증 한계를 명시한다. Production 및 GAS 배포는 별도 승인 후 수행한다.
