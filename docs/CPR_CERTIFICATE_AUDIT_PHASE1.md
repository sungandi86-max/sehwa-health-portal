# CPR Certificate Audit Ledger Phase 1

`응답_심폐소생술이수증`은 현재 CPR 이수 상태의 원본이 아니라 과거 접수·증빙 감사 자료다.
현재 상태는 `staff_submission_status/{staffId}_cpr-training-2026`, 접수 이력은 환경별
`cpr_certificate_submissions_qa`와 `cpr_certificate_submissions_production`으로 역할을 분리한다.

## Legacy audit

- 운영 Sheet 데이터 6행은 `교직원명단`의 유일 성명 일치로 canonical staffId 6/6 매칭된다.
- row 2의 PNG 1개는 연결 계정에서 존재·비공개·`image/png`로 확인됐다.
- row 3~7은 Firebase v2 테스트 행이며 필수 원본 필드가 비어 있다. 링크의 fileId는 추출되지만
  Drive 파일은 `NOT_FOUND`이므로 canonical staffId를 유지한 `manual_review` 및
  `evidenceMissing=true`로 보존한다.
- fileId 중복은 0건이다. Drive 파일의 이동·복사·삭제·권한 변경은 수행하지 않았다.
- Production dry-run은 create 1, manual-review 5, skip 0, conflict 0이다. Production write는 0건이다.

## QA runtime contract

QA의 CPR 제출은 기존 Firebase canonical staff 인증, 3MiB 파일 제한, PDF/JPEG/PNG magic-byte
검증을 유지한다. Apps Script는 기존 CPR Drive 폴더에 파일만 저장하고 Sheet append를 생략한다.
Vercel은 반환된 fileId를 QA audit ledger에 기록한 뒤 기존 QA CPR status를 갱신한다.
관리자 read는 기존 `staff-directory` resource router의 `cpr-certificate-audit`을 사용한다.

Production은 Phase 2 승인 전까지 기존 Drive 저장, `응답_심폐소생술이수증` append, Production CPR
status 갱신을 그대로 유지한다. Sheet 삭제와 Production ledger migration은 Phase 1 범위가 아니다.

## Phase 2 gate

Production migration 전에는 6행 mapping과 5개 missing evidence를 명시적으로 승인해야 한다.
승인 후 migration read-back, idempotent dry-run, Production runtime 전환, Apps Script 기존 deployment
갱신, 관리자 smoke, workbook dependency 0을 모두 확인해야 Sheet 삭제를 검토할 수 있다.
