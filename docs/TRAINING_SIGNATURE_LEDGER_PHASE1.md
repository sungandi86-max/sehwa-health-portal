# 교직원 교육 서명 원장 Phase 1

## 현재 원본과 13개 필드

운영 `교직원교육전자서명`은 숨김 탭이며 헤더만 있고 데이터 행은 0건이다. 분리된 QA 탭에는 기존 감사 행 4건이 있다. Phase 1에서는 QA만 Firestore 원장을 쓰고, Production은 기존 Sheet를 계속 읽고 쓴다. `교직원교육대상`은 변경하지 않는다.

| Sheet 필드 | 분류 | 현재 사용 |
| --- | --- | --- |
| `signatureId` | identity/audit | 중복 검사, append 결과 재확인, 잠금의 `signatureIds` |
| `eventId` | event relation | 대상·이벤트 조인, 출석·PDF·복구 범위 |
| `eventGroupId` | event relation | 그룹 QR 출석 행의 묶음 식별 |
| `교직원ID` | staff relation | 대상·재직자 조인, 중복·복구·정정 |
| `서명일시` | timestamp | 출석 결과, 연수등록부 표시 |
| `출석방식` | attendance/audit | QR 또는 관리자 정정, 연수등록부 표시 |
| `서명파일ID` | Drive relation | 비공개 PNG 조회 및 PDF/XLSX 렌더링 |
| `상태` | attendance state | `완료`일 때만 활성 서명 |
| `취소여부` | cancellation state | 취소된 서명 제외 및 재서명 판정 |
| `취소사유` | correction/audit | 관리자 정정 사유 기록 |
| `정정자` | correction/audit | 관리자 정정 주체 기록 |
| `정정일시` | correction/audit timestamp | 취소/정정 시각 기록 |
| `createdAt` | audit timestamp | 생성 시각 보존 |

## 의존성

`TrainingCenterStore.readSource()`가 서명 행을 읽어 출석 가능 여부, 중복 확인, 관리자 출석 현황, 정정, stale recovery, 연수등록부 미리보기·PDF로 전달한다. `appendSignatures()`는 단일/그룹 QR과 관리자 출석 정정에서 호출된다. 취소는 `cancelSignature()`를 통한다. Drive 읽기는 원장에 저장된 `서명파일ID`를 포인터로 사용한다. Firestore `training_attendance_locks_*`는 예약·중복·복구 조정용이며 최종 원장이 아니다.

## Firestore 구조

- QA: `training_signature_ledger_qa`; Production 예약 이름: `training_signature_ledger_production`.
- 최상위 문서 ID는 `sha256(JSON.stringify([eventId, staffId]))`로, 한 교육·교직원의 활성 서명 ID를 보유한다.
- `signatures/{signatureId}`는 13개 원본 값을 손실 없이 보존하고 `environment`, `identityKey`, `signedAt`, `signatureFileId`, `attendanceStatus`, `active`, 취소 메타데이터, 출처 메타데이터, Firestore 생성·수정 시각을 별도 필드로 둔다.
- `signatures/{signatureId}/history/{actionId}`는 생성·이관·취소 이벤트의 불변 감사 이력이다. 취소 시 원본 서명 엔트리의 활성 상태는 바꾸되, 취소 전후 값과 사유·행위자를 이력에 남긴다. 재서명은 새 `signatureId` 엔트리로 보존된다.
- 그룹 QR은 이벤트별 엔트리를 원자적으로 생성하고 같은 비공개 Drive `signatureFileId`를 참조한다. 원장 변경은 Drive 파일 삭제·공개 권한 변경을 자동 수행하지 않는다. orphan 파일 탐지·stale recovery는 기존 requestId 기반 Drive 검색 및 잠금 조정 로직을 유지한다.

QA reader는 Firestore 원장만 조회하며 Sheet fallback이 없다. 이관 read-back 뒤 `__migration` 준비 표식이 없으면 QA 원장 조회를 거부해 빈 원장으로 전환되는 사고를 막는다. QA append/취소는 Firestore transaction으로 활성 ID 충돌과 중복 서명 ID를 거부한다. 원자적 쓰기 실패 후에는 강한 read-back에서 행 0건을 확인했을 때만 출석 잠금을 `failed`로 전환하고, 재확인이 불가능하면 기존처럼 보수적으로 보류한다. Production reader/writer와 Production 원장 쓰기는 Phase 1에서 변경·허용하지 않는다. 공개 교육 이벤트는 기존 Firestore event store를, 교육 대상은 기존 Sheet를 사용하며 조인 키는 `eventId` 그대로다.

## 이관 및 검증

QA 이관 도구는 기본 dry-run이다. `node scripts/migrateTrainingSignaturesQa.mjs --qa-workbook=<분리된 QA workbook ID>`를 실행해 `create/update/skip/conflict`를 확인한다. 이 Phase의 원본 4행과 다르면 중단하며, 빈 원장은 준비 표식으로 만들 수 없다. 충돌 0건에서만 같은 명령에 `--apply --confirm-qa-signature-ledger`를 추가한다. 실행 후 재실행 dry-run이 `create 0 / update 0 / conflict 0`이고 기존 행 수만큼 `skip`이어야 한다. 이 결과에서만 QA 준비 표식을 만든다. 도구는 운영 workbook ID를 거부하고 QA collection에만 접근한다.

Production 이관은 별도 Phase 2의 preflight·dry-run·승인 후 수행한다. 이 Phase에서는 운영 출석·서명/Drive/Sheet 쓰기, Production 원장 쓰기, Sheet 삭제, main/Production 배포를 하지 않는다.
