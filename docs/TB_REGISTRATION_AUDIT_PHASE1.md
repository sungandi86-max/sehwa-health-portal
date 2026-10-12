# TB 유형선택 접수 감사 원장: Phase 1

## 역할과 경계

- `staff_submission_status/{staffId}_tb-screening-2026`은 현재 검진 상태다. 과거 신청 이력의 원본이 아니다.
- `tb_registration_requests_qa`와 `tb_registration_requests_production`은 접수별 감사 기록이다. 문서 ID는 신규 접수의 UUID, 과거 행은 `legacy_{sheetId}_{rowNumber}`를 쓴다.
- QA 신규 접수는 고정 QA 배포에서만 audit ledger와 `staff_submission_status_qa`를 같은 Firestore transaction으로 기록한다. 실교직원 ID는 QA 신규 접수에서 거부한다. Production의 기존 Sheet append와 기존 상태 기록은 이번 단계에서 바꾸지 않는다.
- 관리자 감사 조회는 기존 `/api/health-room-status`의 `getTbRegistrationAudit` action을 재사용하며, 고정 QA 관리자에게만 필요한 필드만 반환한다. 일반 교직원 및 Production은 이 신규 action에 접근하지 못한다.

## 원본 매핑과 dry-run

운영 응답 Sheet의 유효 헤더는 `제출일시`, `성명`, `소속/부서`, `검진유형`, `비고`다. 2026-10-10 읽기 전용 조사에서 데이터 8행 중 7행을 현행 `교직원명단`의 성명+소속부서 정확히 한 행과 매칭했다. 7건의 `검진유형`은 모두 `단체검진 신청`이며 마지막 행은 시각·소속·유형이 없어 불완전하다. 동명이인 자동 확정은 허용하지 않는다.

| 원본 행 | canonical staffId | 분류 | 이관 판정 |
| --- | --- | --- | --- |
| 2 | T095 | matched | create |
| 3 | T035 | matched | create |
| 4 | T098 | matched | create |
| 5 | T011 | matched | create |
| 6 | T015 | matched | create |
| 7 | T006 | matched | create |
| 8 | T034 | matched | create |
| 9 | 없음 | incomplete | manual-review |

두 audit collection을 직접 조회했을 때 시작 건수는 각각 0건이었다. 따라서 운영 원본 기준 계획은 create 7 / skip 0 / conflict 0 / manual-review 1이다. 이는 **계획일 뿐이며 운영 이관을 실행하지 않았다**. 불완전 행에 staffId를 추정하거나 원본을 수정하지 않는다. 원본 추가 확인 후 별도 승인된 수동 검토 결과로만 처리한다.

## 문서 구조

신규/이관 문서는 `requestId`, `staffId`, `submittedAt`(UTC ISO), `selectedType`, `status`, `manualReview`, `source`, `environment`, `schemaVersion`을 갖는다. 이관 문서는 `sourceSheet`, `sourceSheetId`, `sourceRow`, `sourceTimestamp`, `sourceName`, `sourceDepartment`, `sourceNote`, `sourceFingerprint`, `migratedAt`을 추가한다. 신규 요청에서는 Sheet 출처 필드를 null로 두고 `createdAt`을 기록한다. fingerprint는 Sheet ID·행 번호·원본 5개 셀의 SHA-256이다. 이름/부서는 감사 원장에만 보존하며 관리자 조회 응답에서는 제외한다.

이관 도구의 dry-run은 기존 문서의 ID, staffId, environment, fingerprint를 대조한다. 동일하면 skip, 충돌/출처 불명이면 conflict로 멈춘다. 자동 덮어쓰기는 제공하지 않는다. 현재 상태 문서는 7건 모두 외부 `교직원 결핵검진현황`을 출처로 하며 이 응답 Sheet를 출처로 하지 않는다. T095는 과거 단체검진 신청 뒤 현재 `national/completed`로 바뀌었다. 과거 신청과 현 상태를 별개 사실로 유지한다.

## QA 검증과 Phase 2 조건

개인정보 없는 QA fixture `QA-TB-AUDIT-PHASE1-001` 1건을 QA collection에 create-only로 작성하고 읽어 확인했다. Production audit collection은 0건이며 운영 Sheet/상태/설정은 변경하지 않았다. 신규 API의 QA 제출·관리자 조회 경계는 mock API 테스트로 확인했다.

실제 인증된 QA TB 신청 E2E는 아직 수행하지 않았다. 현행 QA 합성 계정은 인바디 전용이고 TB guard가 이를 거부한다. 또한 현재 TB 신청 기간 외이므로 UI 제출도 닫혀 있다. QA 전용 TB 신원/기간 fixture를 별도 승인·준비하고, 감사 원장과 QA 상태 및 UI read-back을 실제 경로로 검증해야 한다. 이후 운영 7건 이관, 불완전 1행 수동 판정, Production 전환, Apps Script append 제거를 별도 Phase 2에서 진행한다. 이번 단계에서 원본 Sheet 삭제는 불가하다.
