# 제출기록 Firestore 감사 원장 Phase 1

## 운영 원본 (2026-10-12, 읽기 전용)

운영 workbook의 숨김 `제출기록`(sheetId 310103)은 35개 헤더와 데이터 3행(row 2–4)이다. 헤더는 다음과 같다.

`제출일시`, `제출항목`, `구분`, `성명`, `소속부서`, `이수일자`, `파일명`, `파일URL`, `처리상태`, `비고`, `제출ID`, `제출항목ID`, `제출명_정규화`, `교직원ID`, `파일ID`, `파일MIME`, `AI처리상태`, `AI_이수번호`, `AI_기관명`, `AI_이수일자`, `AI_연수명`, `AI_연수시간`, `AI검증결과`, `관리자확인`, `AI추출메모`, `최종수정일`, `제출항목명`, `제출유형`, `학년`, `반`, `번호`, `학생명`, `진료일`, `의료기관명`, `저장폴더ID`.

| 원본 행 | 경로 | 원본 학생 필드 | Drive 증빙 | 신원 분류 | 이관 판정 |
| --- | --- | --- | --- | --- | --- |
| 2 | 과거 `student-file` | 학년·반·번호·학생명 있음 | URL에서 ID 추출, PDF 메타데이터 조회 | unmatched | manual-review |
| 3 | 과거 `student-file` | 학년·반·번호·학생명 있음 | URL에서 ID 추출, PDF 메타데이터 조회 | unmatched | manual-review |
| 4 | signed `student_tb_reply` QA 보안 테스트 | 원본 학생 필드 없음 | 명시 fileId와 URL ID 일치, PDF 메타데이터 조회 | incomplete | manual-review |

서로 다른 fileId는 3개이며 중복/재사용은 없었다. Drive 메타데이터의 파일명은 Sheet 파일명과 3/3 일치한다. 메타데이터 조회 성공은 파일 내용 열람이나 공유/쓰기 권한 확인을 뜻하지 않는다. 파일·폴더는 변경하지 않았다. 익명 학생 진료회신용 canonical 학생 명단/학생 ID는 현재 포털에 없다. 보건실 입실현황이나 학년·반·번호·이름만으로 학생 신원을 자동 확정하지 않는다. `student_health_submissions`는 별도 감염병 보고이며 이 원본의 current status가 아니다. 현재 학생 TB reply용 Firestore 상태/감사 문서는 발견되지 않았다.

## 감사 원장 계약

환경별 `student_submission_audit_qa` / `student_submission_audit_production`을 사용한다. 원장에는 `submissionId`, `canonicalStudentKey`(확정 전 null), `studentIdentity`, `submissionType`, `submittedAt`, `source`, `environment`, `originalRowNumber`, `originalRowFingerprint`, `originalSubmissionId`, `originalFields`, `evidenceFiles[]`, `matchStatus`, `manualReview`, `manualReviewReasons`, `status`, `schemaVersion`, `migration`, `createdAt`, `updatedAt`을 보존한다. 원본 URL과 명시 fileId가 다르면 둘 다 남기고 수동 검토한다. 실제 Drive 파일을 이동·복사·삭제하지 않는다. 원장은 접수 이력이며 향후 현재 처리 상태와 분리한다.

기존 운영 ledger는 직접 API 조회 시 0건이었다. 3행 dry-run은 **canonical create 0 / manual-review 3 / skip 0 / conflict 0**이다. 이 단계에서 원본 3행을 운영 Firestore에 쓰지 않았다. QA에는 `QA-STUDENT-AUDIT-PHASE1-SIGNED`, `QA-STUDENT-AUDIT-PHASE1-LEGACY` 두 synthetic metadata-only fixture만 create-only로 기록하고 read-back했다. 이는 실제 서명 검증이나 Drive 업로드의 증거가 아니다. 운영 collection은 재조회에서도 0건이다.

## runtime 경계와 배포 전제

현재 운영 익명 제출은 `/upload?mode=public&type=tbreply` → `/api/submit`의 3MiB·PDF/JPEG/PNG 검사 및 HMAC/visitor/replay 보호 → Apps Script의 고정 Drive 폴더 업로드 → `제출기록` append다. 신규 QA 코드에서는 고정 QA 배포에만 서버 소유 `QA_STUDENT_REPLY_DRIVE_FOLDER_ID`를 요구한다. 값이 없으면 Apps Script 호출 전에 실패한다. signed envelope에 QA 전용 폴더·`recordMode=firestore`가 포함되고 Apps Script는 QA 전용 `QA_SUBMISSION_PROXY_SECRET`으로 검증한 뒤 QA 폴더에만 업로드한다. Sheet를 열거나 append하지 않고 fileId를 반환한다. Vercel은 fileId를 QA 감사 원장에 create-only 기록한다. 다른 Preview는 거부하고 Production은 기존 저장 경로를 유지한다. 관리자는 기존 resource router의 `student-submission-audit`으로 제한된 QA 원장 메타데이터만 읽으며, 일반 교직원·Production에는 신규 조회를 허용하지 않는다.

운영 Apps Script v99에는 아직 이 QA 전환 코드가 배포되지 않았고 QA 전용 Drive 폴더 설정도 이 단계에서 변경하지 않았다. 따라서 실제 QA 익명 제출 E2E는 아직 실행할 수 없으며 **코드·mock 경계와 QA metadata fixture만 검증**했다. 기존 익명 제출 방문자 제한은 `X-Forwarded-For` 기반이므로 이 헤더가 플랫폼에서 신뢰 가능하게 덮어써지는지 확인하기 전에는 실제 QA 업로드를 열지 않는다. Drive 업로드 후 Firestore create가 실패하면 파일을 자동 삭제하거나 같은 requestId를 자동 재시도하지 않는다. 운영자가 fileId와 로그를 대조해 수동 복구해야 하며, 별도 orphan/replay 운영 절차가 Phase 2 전 필요하다. 운영 원본 Sheet는 유지한다.
