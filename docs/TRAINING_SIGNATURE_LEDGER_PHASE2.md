# 교직원 교육 서명 원장 Phase 2

Production 서명 원본을 `교직원교육전자서명` Sheet에서 환경별 Firestore
`training_signature_ledger_production`으로 전환한다. 이 단계에서 Sheet를 삭제하지 않는다.
`교직원교육대상`은 계속 Sheet 원본이며 교육 이벤트는 기존 Firestore 원본이다.

## 이관 안전 조건

- 운영 Sheet의 A:M 헤더 13개가 정확하고 canonical 서명·취소·정정 행이 0건이어야 한다.
- Production ledger의 pair, `signatures`, `history` 및 attendance lock이 모두 0건이어야 한다.
- 운영 Drive 서명 루트의 orphan PNG가 없어야 한다. 출처 불명 파일이 발견되면 자동 원장 생성·삭제 없이 중단한다.
- `node scripts/migrateTrainingSignaturesProduction.mjs`의 실제 운영 데이터 dry-run이
  `create 0 / update 0 / skip 0 / conflict 0`이어야 한다.
- 위 검사가 통과한 경우에만 `--apply --confirm-empty-production-ledger`를 지정해
  `__migration` readiness marker 1건을 만든다. 기존 문서는 덮어쓰지 않는다.

Marker는 `environment=production`, `status=ready`, `schemaVersion=1`, migration source,
source count/fingerprint, migrated count 및 활성 시각을 보존한다. 원본 0건을 명시적으로
허용하는 Production marker이며, 기존 QA marker의 4건 이상 확인 계약은 유지한다.
운영 코드가 marker를 확인하지 못하면 Sheet로 fallback하지 않고 교육 서명 원장을
`not ready`로 처리한다.

## 런타임 계약

`TrainingCenterStore`의 서명 조회, append, 취소, 관리자 출석, 중복 검사, stale recovery,
서명 파일 조회, 연수등록부 미리보기/PDF는 같은 ledger backend를 사용한다. QR·서명 쓰기는
대상 자격 확인 → attendance lock → private Drive PNG → Firestore pair/signature/history
transaction → lock completed 순서를 유지한다. 원장 정정/취소 시 Drive PNG는 자동 삭제하지
않는다. Lock은 동시성·재시도 조정 상태이지 최종 출석 원장이 아니다.

Production 서명/QR 실사용 write 검증은 이 단계에서 수행하지 않는다. 이전 QA 합성 서명
E2E와 transaction 회귀 테스트를 writer 근거로 사용한다. 운영 배포 후에는 읽기 전용으로
서명 0건, 관리자 출석 0건, 연수등록부, 대상자 join, QA 분리, marker 및 Sheet runtime
read/write 0건을 재확인한다. `교직원교육전자서명` 삭제는 별도 단계에서만 판단한다.

## 2026-10-10 Production 이관 기록

운영 Sheet는 A:M 13개 헤더와 데이터 0행을 재확인했다. Production ledger pair,
signature entry, history, attendance lock은 각각 0건이었다. 운영 Drive 서명 루트는
존재하고 그 안의 파일은 0건이어서 확인 범위에서 orphan PNG가 없었다. 실제 운영
workbook/Firestore를 사용한 직전 dry-run은 create/update/skip/conflict 모두 0이었다.
그 결과에 한해 Production `__migration` marker 1건을 생성했고 즉시 read-back에서
`ready=true`, 재비교 create/update/skip/conflict 모두 0을 확인했다. 서명·대상·Drive
파일을 생성하거나 수정하지 않았다.

다른 9개 workbook 탭의 수식 270셀, 데이터 검증 5,074셀과 named range를 검사한
결과, 대상 Sheet 참조 및 `#REF!`은 모두 0건이었다. 이관 시점의 marker 생성은
구 Sheet writer를 원자적으로 멈추는 기능이 아니므로, 실제 배포 직전과 직후에
Sheet/ledger/lock의 0건 상태를 다시 확인해야 한다.
