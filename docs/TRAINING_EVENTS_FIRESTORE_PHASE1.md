# 교직원교육 이벤트 Firestore 전환 Phase 1

> 이 문서는 Phase 1 당시의 QA 전용 구현과 Production 전환 전 조건을 기록한 이력이다. 현재 runtime 계약은 `TRAINING_CENTER_PHASE2.md`를 따른다. Phase 2에서 Production 이벤트 1건을 `training_events_production`에 이관한 뒤 QA/Production 모두 Firestore 이벤트 store로 전환하며, 대상·전자서명 Sheet와의 `eventId` 조인은 유지한다. 이 문서의 “Production은 Sheet 원본” 문구는 Phase 1 시점에만 적용된다.

## 범위

- 승인된 `preview + qa`에서만 `training_events_qa`를 교육 이벤트 원본으로 읽고 쓴다.
- `production + main`은 계속 `앱_교직원교육` Sheet를 읽고 관리자 저장도 해당 Sheet에 수행한다. `training_events_production`에는 Phase 1 코드가 쓰지 않는다.
- 다른 Preview는 기존 교육센터 배포 gate에서 거부한다. QA Firestore가 비어 있어도 Production으로 fallback하지 않는다.
- `교직원교육대상`, `교직원교육전자서명`, Drive 서명 저장소, 출석 lock은 변경하지 않는다. 세 데이터의 연결 키는 `eventId`다.

## 문서 계약

문서 ID는 변경 불가능한 `eventId`다. Sheet 17개 헤더는 `server/lib/trainingEventSchema.js`의 매핑으로 보존한다. `enabled`와 원본 `사용여부` 문자열을 분리하고, `sortOrder` 숫자와 원본 정렬 문자열도 분리해 역변환 손실을 막는다. `trainingYear`, 일자, 시각, 장소, 담당 정보, 이수기준, 그룹 ID와 서명 시간창을 유지한다.

`sourceType`, `sourceSheet`, `sourceRow`, `sourceFingerprint`, `migratedAt`은 이관 출처다. `firestoreCreatedAt`과 `firestoreUpdatedAt`은 Firestore 기록 시각이며 Sheet의 생성·수정 시각으로 해석하지 않는다. 대상자·서명, QR secret/token은 이벤트 문서에 넣지 않는다. QA 문서에는 `environment: qa` marker를 둔다.

## QA mirror

관리자 교육 화면의 `QA 이벤트 mirror`는 먼저 읽기 전용 점검을 수행한다. 결과는 `create / update / skip / conflict`로 분류한다. 현재 정책에서 기존 문서가 다른 내용이면 `update`를 자동 적용하지 않고 `conflict`로 처리한다. 출처가 불명확하거나 환경 marker가 다른 문서도 충돌이다. 충돌이 0건일 때에만 관리자 확인 후 QA에 `create`를 원자적으로 적용한다. 동일 원본 재실행은 `skip`이어야 하며 기존 문서 overwrite는 없다.

QA 관리자 신규 교육은 `QA-TR-` ID로 생성된다. 실제 교직원이나 대상자 데이터를 넣지 않은 `[QA]` fixture로 공개 목록·상세와 QR/출석 판정의 read 경로를 검증할 수 있다. 실제 출석·서명 파일 생성은 Phase 1의 필수 검증이 아니다.

## Production 전환 전 조건

`training_events_production`의 기존 문서 직접 재조회, Production Sheet dry-run/parity, 관리자 write 전환, 공개·QR·출석·PDF 회귀, QA/Production namespace 격리 검증이 모두 통과하기 전까지 Production reader를 전환하거나 `앱_교직원교육` 탭을 삭제하지 않는다.
