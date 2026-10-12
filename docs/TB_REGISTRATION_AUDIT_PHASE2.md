# 교직원 결핵검진 유형선택 감사원장 Phase 2

`tb_registration`의 현재 상태와 접수 이력을 분리한다. 현재 상태는 기존
`staff_submission_status`의 `tb-screening-2026` 문서가 담당하고, 접수 이력은
환경별 `tb_registration_requests_qa` / `tb_registration_requests_production`이
담당한다. 신규 요청은 Firebase 인증과 canonical `staffId`, 신청 기간 검증을
통과한 뒤 Firestore 감사원장과 현재 상태를 기록한다. Apps Script 및
`응답_교직원결핵검진유형선택` Sheet로는 더 이상 읽거나 쓰지 않는다.

운영 legacy 원본 8행 중 7행은 canonical `staffId`가 확정된 요청으로 이관한다.
불완전한 row 9는 `staffId`를 설정하지 않고 `candidateStaffId=T043`,
`manualReview=true`, `status=manual_review`인 별도 감사 문서로 보존한다. 원본의
빈 timestamp, department, selectedType은 그대로 유지하며 현재 TB 상태 문서는
변경하지 않는다. 모든 legacy 문서는 source row, 원본 fingerprint, 환경 및
migration metadata를 보존한다.

이관은 deterministic request ID와 Firestore create-only batch를 사용한다. 기존
문서를 덮어쓰지 않으며 conflict가 하나라도 있으면 apply를 거부한다. 이관 후
재실행 dry-run은 canonical skip 7, manual-review skip 1, conflict 0이어야 한다.

관리자 감사 조회는 기존 staff-directory resource router의
`tb-registration-audit`을 사용하며 health_teacher/admin만 접근할 수 있다.
canonical 요청과 manual-review 요청을 별도 상태로 반환한다. 기존 TB 현황과
본인 조회는 계속 현재 상태 문서를 사용한다.

원본 Sheet는 Phase 2에서 삭제하지 않는다. Production 배포와 운영 read-back,
Apps Script 기존 deployment 갱신, workbook formula/named range/data validation 및
`#REF!` 검사를 마친 뒤 별도 승인 단계에서만 삭제한다.
