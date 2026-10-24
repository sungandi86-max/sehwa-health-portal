# 학생 결핵 진료회신 중단: 배포 준비

2026-10-24. 준비 판정 CONDITIONAL. 이 문서는 실행 계획이며 배포 승인이 아니다.

## 보존 범위와 현재 기준

- 브랜치 `fix/retire-student-tb-reply`, 기준 SHA `de6a4066a88e3bd2469183e51bb0845569a15e98`.
- 원격 `sungandi86-max/sehwa-health-portal`은 PUBLIC이다. 합성 테스트와 코드·정제된 요약만 공개 보존한다. `.omo/`, 원문 로그, 인증정보, 학생자료는 stage하지 않는다.
- 읽기 전용 재조회한 Production: `dpl_DBnbpevK2vsGYcDx4ayUUc7EuWYz`, SHA `de6a4066a88e3bd2469183e51bb0845569a15e98`, READY. alias `sehwa-health-portal.vercel.app`. 실제 실행 직전에 다시 조회해야 한다.
- Production Apps Script의 실제 deployment ID·현재 version 번호는 미확인이다. 로컬 clasp project 식별만으로 배포 버전을 판단하지 않는다. QA 배포 버전도 미확인이다. 이 둘의 읽기 전용 확인과 복구 가능 버전 확보가 배포 선행 조건이다.
- Node 로컬 v22.23.3 / package engines 22, Vercel 조회값 24.x. 실제 빌드의 적용 런타임과 의존성 호환성을 승인된 사전검증에서 확인한다. 이번에 설정을 바꾸지 않는다.
- 다른 main/worktree는 수정하지 않는다. main 병합, PR, Production/QA 배포, 환경변수·DB·Drive 변경은 실행하지 않는다.

자동 배포 예방을 위해 vercel.json에 **이 브랜치만** `git.deploymentEnabled=false`로 지정한다. 미지정 브랜치 기본값은 true이며 main의 정책은 바꾸지 않는다. 일반 push 후 해당 SHA의 배포 목록을 확인한다. 이는 수동 배포를 승인하거나 차단하는 설정이 아니다. 근거: [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration).

## 변경 영향

| 영역 | 변경과 영향 | 별도 배포/데이터 변경 |
|---|---|---|
| 웹 공개 화면 | 학생 카드 제외, 과거 URL·modal 입력폼 대신 종료 안내 | 웹 배포 필요 |
| 서버 API | 학생 별칭 410/STUDENT_TB_REPLY_RETIRED, GAS·감사 원장 이전 차단 | 웹/API 함께 배포 |
| Production GAS | raw/signed 학생 요청 조기 거부 및 최종 저장 방어 | 기존 Web App deployment의 새 version 필요 |
| QA GAS | QA entry guard 및 생성 Shared.gs 갱신 | 별도 QA 승인·배포 필요, Production과 혼합 금지 |
| Firestore·Sheets·Drive | 기존 원장/제출자료/관리자 조회 보존, 신규 학생 쓰기만 차단 | 스키마·규칙·자료 변경 및 이전 불필요 |
| CPR·건강검진 | 공통 인증·검증·저장 유지, 교직원 2개 카드·마감일 유지 | mock 회귀 통과, 운영 제출 검증 미수행 |
| 감염병 보고 | 기존 카드 및 별도 보고 경로 유지 | 로컬 경로/자동 회귀 통과, 운영 제출 미수행 |

## 로컬 검증과 재현

구현 단계 브라우저·HTTP 검증 범위와 한계는 `STUDENT_TB_REPLY_RETIREMENT.md`에 기록했다. 실제 계정 및 운영 저장 E2E는 미수행이다. 배포 준비 단계에서는 집중 테스트·전체 테스트·빌드·기존 실패 기준선을 다시 실행한다.

```sh
node --test src/studentReplyRetirement.test.js server/lib/submissionConfig.test.js server/lib/studentSubmissionAuditApi.test.js server/lib/submissionWorkflows.test.js server/lib/studentSubmissionAuditStore.test.js tests/qa-gas/isolation.test.js
node tools/qa-gas/shared.mjs --check
npm test
npm run build
git diff --check
```

이번 재실행 결과: 집중 74/74 PASS, 전체 697 중 695 PASS / 1 FAIL / 1 SKIP, build PASS. 단일 실패는 변경하지 않은 `tools/firestore-rules/safety.test.js`의 Windows URL.pathname 경로 문제이다. 기준 HEAD의 safety.test.js와 run.mjs를 별도 임시 디렉터리에 원문 그대로 복사해 `node --test <임시경로>/safety.test.js`로 8 PASS / 1 FAIL을 재현했다. 두 원본과 복사본의 SHA-256 일치도 재확인했다. Firestore emulator는 NOT RUN이다. 이 실패를 성공 처리하거나 테스트를 완화하지 않는다.

보안: 공식 release의 checksum을 검증한 Gitleaks v8.30.1로 명시된 변경 파일 전체 패키지를 검사하여 탐지 0건이었다. stage 이후 diff도 같은 도구로 다시 검사한다. 변경 내용을 직접 검토하여 학생 이름·실제 제출파일명·연락처·인증정보가 새로 들어가지 않았고 테스트는 QA 합성 식별자임을 확인했다. 개인정보 검토는 수작업 최선 노력이며 비밀 탐지 0건이 모든 개인정보 부재의 수학적 증명은 아니다. 원문 로그·.env·.clasp 인증 파일·빌드 결과·node_modules는 공개 패키지에 포함하지 않는다.

로컬 원문 증빙은 `.omo/checkpoint-focused.log`, `checkpoint-full.log`, `checkpoint-build.log`, `checkpoint-baseline.log` 및 이전 `retirement-*` 로그다. 공개 패키지에는 이 요약만 포함하며 원문은 미전송이다. 다른 PC에서 원문 증빙·브라우저 fixture가 자동 복원된다고 가정하지 않는다.

## 승인 후 안전한 실행 순서

1. 실행 직전 Production alias/SHA, GAS Production·QA 각각의 script/deployment/version·실행 주체·접근 정책을 읽기 전용 확인한다. 기존 `/exec` URL과 연결 환경변수의 **이름**만 기록하고 비밀 값은 출력하지 않는다. 알려진 복구 버전과 변경 source hash를 확보한다. 버전 미확인 상태에서는 진행하지 않는다.
2. 별도 승인된 QA에서 QA GAS 먼저, QA 웹/API 다음 순서로 합성·mock 검증한다. QA 설정·리소스가 Production과 분리됐는지 확인한다. 실제 운영 저장 제출은 하지 않는다.
3. Production GAS에 종료 guard를 먼저 반영한다. 기존 deployment ID와 URL·접근 정책을 유지하며 새 version을 지정한다. 다른 프로젝트로 clasp push하거나 새 URL로 갈아끼우지 않는다. 학생 차단이 검증되기 전 웹/API 단계로 넘어가지 않는다.
4. 검증된 고정 commit으로 웹/API를 배포한다. main의 최신 변경을 임의로 합치지 않는다. main 병합은 배포와 별도 승인이다. 선택된 빌드 SHA·node runtime·최종 alias를 재확인한다.
5. 아래 비쓰기 점검을 마친 뒤 결과를 기록한다. QA·Production 각각 독립적으로 기록한다.

호환성: 구 웹/API + 새 GAS에서는 학생 업로드가 GAS에서 거부되고 기존 교직원 경로는 유지된다. 새 웹/API + 구 GAS는 API만 막고 GAS 직접 접근은 남길 수 있으므로 완전 중단으로 승인하지 않는다. GAS 차단을 유지한 상태에서 웹/API를 순차 반영한다. 현재 남아 있는 노출을 없애는 배포이며, 준비 단계만으로 운영 차단이 적용됐다고 주장하지 않는다.

## 배포 후 비쓰기 검증

| 항목 | 방법과 합격 기준 |
|---|---|
| 학생 카드 | 공개 목록 및 오래된 설정 캐시에서도 미노출 |
| 직접 URL | 기존 학생 경로/지원 별칭에서 종료 문구, 학생 input·file·submit form 없음; PC·모바일 확인 |
| API | 개인정보·파일 없는 `{"type":"student_tb_reply"}` 및 지원 별칭을 POST /api/submit, HTTP 410 + STUDENT_TB_REPLY_RETIRED. GAS 호출·감사 쓰기 전 반환하는 배포 source와 함께 확인 |
| GAS 직접 접근 | 배포 version의 조기 guard 확인 후에만 학생 type 단독 합성 요청. HTTP 410을 요구하지 않고 정적 종료 error code 확인(GAS 응답 형식). 학생정보·파일·서명 비밀을 요청/로그에 넣지 않음 |
| 교직원 카드 | 건강검진 12월 30일, CPR 11월 30일, 감염병 수시; 기존 폼/보고 경로까지 확인하되 제출하지 않음 |
| 환경 분리 | 배포 target·연결 script·환경 정책을 값 노출 없이 대조; QA가 운영 자원 참조하면 중단 |
| 기존자료 | 승인된 metadata-only 인벤토리와 폴더·3개 파일 ID/개수/수정시각 대조, 원장/Sheets 구조 유지. 본문·개인식별 파일명은 보고서에 옮기지 않음 |
| 버전 | Vercel deployment ID/SHA/alias와 GAS 각 deployment ID/version/source hash를 기록. 로컬 파일 일치만으로 운영 일치 판정 금지 |

실제 CPR·건강검진·감염병의 운영 제출, 파일 생성, 원장 생성 검증은 **별도 승인** 대상이다. 비쓰기 점검만으로 운영 저장 E2E PASS를 선언하지 않는다. 기존자료 보존은 이번 변경 도구가 쓰기를 하지 않았다는 사실과 metadata 비교를 구분한다.

## 롤백과 장애 대응

- 웹/API 복구 후보는 위 Production deployment ID이다. 승인 후 Vercel에서 대상·SHA·alias를 확인하고 해당 배포로 rollback/promote하는 절차를 사용한다. 환경변수·GAS를 동시에 원복하지 않는다. **구 웹/API는 학생 화면과 API 접수를 다시 열 수 있다.** GAS guard는 반드시 유지하고, 공개 학생 경로가 다시 보이는 문제 때문에 가능하면 종료 guard를 유지한 수정 배포를 우선한다. 구 배포로의 무조건 복구는 안전한 완전 복구로 간주하지 않는다.
- GAS는 실행 전에 확보한 기존 deployment의 version을 복구 후보로 기록한다. Apps Script Deploy > Manage deployments에서 같은 deployment를 편집해 version 선택·확인하는 것이 개별 복구 절차다. 단, **guard 없는 구 version 선택은 GAS 직접 학생 접수를 재개할 위험이 있어 실행 금지**다. 교직원 기존 로직 + 학생 guard를 유지한 호환 복구 version을 먼저 만들어 승인 후 지정한다. QA/Production을 각각 수행하고 URL·권한을 유지한다.
- CPR/건강검진 장애 시 신규 학생 차단을 유지한 채 교직원 분기 변경을 비교하고 수정 배포한다. 감염병은 별도 경로·권한·연결 상태를 확인한다. 공통 API/GAS 전체 삭제·비밀키 해제·환경 혼합으로 우회하지 않는다. 안전한 복구가 없으면 영향을 받는 제출의 사용 중단 안내와 보건실 대체 접수 절차를 사용자와 결정한다. 원장·파일 삭제로 재시도를 강제하지 않는다.
- 배포/복구는 모두 새 승인 범위에 따른다. 이전 버전 확인 전에는 실행 가능한 롤백 준비 완료라고 판정하지 않는다.

## 최종 승인 항목

현재 승인: 이 브랜치 checkpoint commit 및 일반 push, 로컬 점검·계획. 미승인: QA 배포, Production GAS·웹/API 배포, main 병합/PR, 실제 운영 제출·저장 테스트, 데이터 이동·삭제. 다음 승인에는 대상 고정 commit, 두 GAS deployment/version, 순서, 비쓰기 점검, guard 보존 롤백 조건을 명시한다. 개인정보 보존·폐기 검토는 별도이며 과거 자료는 계속 보존한다.
