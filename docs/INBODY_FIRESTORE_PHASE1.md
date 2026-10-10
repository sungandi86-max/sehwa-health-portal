# 인바디 신청 Firestore 전환 Phase 1

## 운영 원본과 필드 계약

`응답_인바디측정신청`은 2026-10-10 확인 시 헤더 5개, 데이터 0행이다. 원본 순서는 `제출일시`, `성명`, `소속/부서`, `희망날짜`, `희망시간대`이다. 기존 Apps Script는 파일 없이 이 순서로 행을 추가하고, 관리자 공통 접수 요약은 `제출일시`를 기준으로 전체·오늘·최근 접수를 계산한다. 기존 중복 신청 차단이나 처리 상태 갱신 규칙은 없다. 따라서 과거 행 migration은 0건이며 중복 제한을 새로 도입하지 않는다.

| Sheet 열 | 현재 요청 필드 | QA Firestore 필드 |
| --- | --- | --- |
| 제출일시 | 서버 접수 시각 | `submittedAt` |
| 성명 | `fields.name` | `name` |
| 소속/부서 | `fields.dept` | `department` |
| 희망날짜 | `fields.preferredDate` | `preferredDate` |
| 희망시간대 | `fields.preferredTime` | `preferredTime` |

`requestId`, canonical `staffId`, `status=received`, `environment`, `sourceType`, `schemaVersion`, `createdAt`, `updatedAt`은 신규 원장 metadata다. 이를 과거 Sheet 값으로 간주하지 않는다. 기존 입력의 성명·부서는 사용자가 제출한 값이고, `staffId`만 Firebase assignment 검증에서 확정된다.

## 단계별 backend

- 고정 `qa` Preview: `inbody_requests_qa`에 생성하고 같은 컬렉션에서 조회한다. `/api/submit`은 직원 인증과 역할·staffId 검증 후 Apps Script를 호출하지 않는다. 관리자 `getInbodyRequests`는 Firebase 관리자 assignment가 있어야 한다.
- `main` Production: 현재 signed `/api/submit` → Apps Script → `응답_인바디측정신청` 저장 및 기존 관리자 Sheet 요약을 그대로 유지한다. `inbody_requests_production`에는 Phase 1에서 쓰지 않는다.
- 그 외 Preview: 승인된 환경으로 분류되지 않아 Firestore와 Production Sheet 모두 접근을 거부한다.

QA 관리자 접수 화면은 Firestore 인바디 요약을 표시한다. 공통 요약 응답이 정상일 때는 인바디 항목·관리자 홈 합계·알림의 인바디 수치를 Firestore 집계로 치환하고 TB/CPR 수치는 유지한다. QA의 기존 공통 요약 경로가 설정 문제로 실패하더라도 인바디 전용 관리자 조회는 별도로 동작한다. Production 인바디 집계는 계속 Sheet 기반이다. 운영 Apps Script의 공통 요약에는 인바디 Sheet reader가 남으므로 이 탭은 아직 삭제할 수 없다.

QA 사전 확인에서 두 환경의 인바디 컬렉션은 모두 0건이었다. `inbody_requests_qa/QA-INBODY-SYNTHETIC-001` 한 건만 합성 fixture로 생성했고, read-back에서 `environment=qa`, `staffId=QA-INBODY-STAFF-001`, `status=received` 및 13개 필드를 확인했다. 그 직후 `inbody_requests_production`은 계속 0건이었다. fixture는 자동 삭제하지 않는다.

직접 Firestore REST API 확인 기록(2026-10-10, 접근 토큰·실사용자 데이터 미기록):

```text
GET  /documents/inbody_requests_qa?pageSize=100          → error=None, count=0
GET  /documents/inbody_requests_production?pageSize=100  → error=None, count=0
POST /documents/inbody_requests_qa?documentId=QA-INBODY-SYNTHETIC-001
                                                        → created=QA-INBODY-SYNTHETIC-001, error=None
GET  /documents/inbody_requests_qa/QA-INBODY-SYNTHETIC-001
                                                        → environment=qa, staffId=QA-INBODY-STAFF-001,
                                                          status=received, field_count=13, error=None
GET  /documents/inbody_requests_production?pageSize=100  → production_count=0, error=None
```

## Phase 2 전 확인할 것

1. Production Sheet 데이터가 여전히 0행인지 배포 직전에 재검사한다. 0행이 아니면 실제 행 기준 migration dry-run 및 충돌 검사를 다시 한다.
2. QA 합성 신청의 create/read-back/관리자 집계를 실제 고정 QA 환경에서 확인한다.
3. Production Firestore 컬렉션의 기존 문서·출처를 확인하고 migration marker 및 reader/writer 전환 순서를 설계한다.
4. Production 관리자 요약과 Apps Script의 마지막 Sheet reader/write를 제거한 뒤, 다른 Sheet 의존성과 backup 목록을 검사한다.
5. 그 전에는 `응답_인바디측정신청`을 삭제하거나 운영 신청을 시험 제출하지 않는다.
