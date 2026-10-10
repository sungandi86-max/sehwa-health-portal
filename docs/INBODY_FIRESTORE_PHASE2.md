# 인바디 신청 Firestore 원장 Phase 2

2026-10-10 운영 사전 점검에서 `응답_인바디측정신청`은 헤더 5개(`제출일시`, `성명`, `소속/부서`, `희망날짜`, `희망시간대`)와 데이터 0행이었다. Firestore API 직접 조회에서 `inbody_requests_production`은 0건, `inbody_requests_qa`는 QA 표식 문서 2건이었다. 원본 0행의 dry-run은 create/update/skip/conflict = 0/0/0/0이다. 신청 원장으로 옮길 과거 데이터는 없고, QA 문서는 운영 컬렉션에 복제하지 않는다.

운영 전환 gate는 `inbody_request_readiness_production/state`이다. `environment=production`, `status=ready`, `schemaVersion=1`, `migratedCount=0`, `source=response_sheet_zero_row_migration`, `activatedAt`을 저장한다. 저장·조회 시 환경, 상태, schemaVersion, 이관 건수를 검증하며 표식이 없거나 불일치하면 Sheet로 fallback하지 않는다. `source`와 `activatedAt`은 이관 감사 메타데이터다. QA는 기존 `inbody_requests_qa`를 유지한다.

신규 운영 신청은 기존 UI → `/api/submit` 경로를 유지한다. 서버의 현행 교직원 인증·역할·canonical staffId 검증 후 `inbody_requests_production`에 `create`로 저장한다. 문서에는 requestId, staffId, submittedAt, 성명·부서, 희망날짜·시간, received 상태, environment/sourceType/schemaVersion 및 생성·수정 시각을 기록한다. 관리자 전용 `getInbodyRequests`와 공통 접수 요약의 인바디 건수는 같은 컬렉션에서 계산한다. 신청 중복 차단이나 실제 운영 시험 제출은 이번 단계에서 추가하지 않는다.

Apps Script의 인바디 destination, append, 응답 헤더 계약 및 관리자 Sheet 요약을 제거한다. CPR·결핵검진·단체검진·학생 진료회신의 저장 경로와 raw/audit Sheet는 그대로 둔다. `응답_인바디측정신청` 탭 자체는 이 단계에서 삭제하지 않는다. 삭제는 운영 Vercel과 기존 URL의 Apps Script 배포본 모두 Sheet read/write 0, 관리자 조회 정상, workbook 수식·named range·data validation·`#REF!` 0을 확인한 뒤 별도 단계에서 진행한다.

기존 workbook 복사 백업은 이 Firestore 원장을 포함하지 않는다. 인바디 신청의 운영 복구는 Firebase/Google Cloud의 Firestore 백업·복원 정책을 따라야 한다. 이번 전환에서는 백업 리소스나 정책을 새로 생성·변경하지 않는다.
