# 제출 설정 Firestore 전환 — Phase 2

## 데이터 경계

- `submission_public_config_qa`와 `submission_public_config_production`에는 공개 카드 6건과 이관 완료 표시 문서 1건만 둔다. `제출항목관리`의 저장폴더ID·시트명·링크 원문은 복제하지 않는다.
- `submission_admin_config_qa`와 `submission_admin_config_production`에는 단체검진 신청 기간 설정 1건, 보류·기존 제출항목 metadata 3건, 이관 완료 표시 1건을 둔다. 보류 중인 AI 추출 설정은 runtime 기능으로 승격하지 않는다.
- 실제 인증·파일 정책·응답 시트·Drive 폴더는 `server/lib/submissionWorkflows.js`와 Apps Script의 고정 destination allowlist가 결정한다. Firestore 관리자 설정은 이 보안 경계를 바꾸지 못한다.
- `앱_제출센터` 원본의 `링크` 중 공개 HTTPS 또는 포털 내부 경로가 아닌 값은 공개 카드의 `publicUrl`에 이관하지 않는다.

## 이관 gate

1. 운영 Sheet 두 탭을 읽기 전용으로 가져온다. 정확한 6행·3행과 헤더를 재확인한다.
2. QA/Production 대상 컬렉션을 직접 읽고 `npm run migrate:submission-config -- --qa` 및 `--production` dry-run을 각각 실행한다. 충돌이 있으면 쓰지 않는다.
3. QA만 `--qa --apply --confirm-submission-config`로 이관하고 read-back 7개 공개 문서·5개 관리자 문서와 재실행 `skip 12`를 확인한다.
4. QA Preview의 `/upload`, `/firebase-submissions`, `/checkup`, 관리자 제출 설정을 검증한다. QA 테스트 카드는 운영 원본 6건을 건드리지 않고 최종 비활성·비노출로 남긴다.
5. QA 원본 12개 문서의 parity가 유지될 때에만 Production을 `--production --apply --confirm-submission-config`로 이관한다. Production Vercel과 Apps Script는 이 단계에서 배포하지 않는다.

## 이후 별도 출시 단계의 순서

1. 운영 `앱_제출센터`와 Firestore 단체검진 기간의 enabled·시작일·종료일이 동일한지 확인하고, QA 실화면 검증을 완료한다.
2. main/Production Vercel을 먼저 갱신한다. 이때 운영 Apps Script v94는 기존 Sheet 기간 확인을 유지하므로 구·신 경로 모두 기간을 확인한다.
3. signed `/api/submit`과 공개 카드가 Firestore 설정으로 정상 동작하는 것을 확인한다.
4. 그 뒤 운영 Apps Script를 갱신한다. 기존 deployment ID·URL을 유지하고 `SUBMISSION_PROXY_TRANSITION_UNTIL=0`인 strict mode를 확인한다.
5. 이 전환에는 Phase 1의 15분 unsigned 호환 모드를 다시 열지 않는다. 새 Apps Script는 unsigned `tb_registration`을 임시 호환 모드에서도 거부한다. 단체검진 기간은 Vercel의 Firestore gate가 통제한다.
6. 두 원본 설정 탭은 Production 회귀와 의존성 검사를 통과할 때까지 삭제하지 않는다. 응답·감사 탭은 이 단계의 삭제 대상이 아니다.

이 절차는 Phase 1의 최초 signed-envelope 전환 절차와 다르다. 이미 운영이 strict signed mode인 상태에서 설정 source만 옮긴다.
