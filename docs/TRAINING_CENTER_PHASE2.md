# 교직원 교육센터 Phase 2 운영 준비

이 문서는 feature branch의 구현 계약이다. 현재 운영 워크북에는 교육 샘플 행을 쓰지 않았고, 새 탭도 만들지 않았다. 관리자 UI를 운영 데이터에 연결하기 전에 아래 준비와 승인이 필요하다.

## Sheet schema

기존 `2026학년도 보건실 업무` 워크북의 `앱_교직원교육`, `앱_교직원교육자료`, `교직원교육대상` 탭은 그대로 사용한다. 신규 backend 탭 `교직원교육전자서명`은 기본 숨김으로 생성하고 A1:M1에 아래 헤더를 순서대로 둔다. 샘플 데이터는 입력하지 않는다.

| 열 | 헤더 | 용도 |
|---|---|---|
| A | signatureId | 기록별 고유 ID |
| B | eventId | `앱_교직원교육.eventId` |
| C | eventGroupId | 묶음 교육 ID, 단일 교육이면 공란 가능 |
| D | 교직원ID | 기존 canonical `교직원명단.교직원ID` |
| E | 서명일시 | ISO 8601 시각 |
| F | 출석방식 | `qr` 또는 `correction` |
| G | 서명파일ID | 비공개 Drive PNG ID, 관리자 보정이면 공란 |
| H | 상태 | `완료` 또는 `취소` |
| I | 취소여부 | `Y` 또는 `N` |
| J | 취소사유 | 관리자 정정 사유 |
| K | 정정자 | 관리자 canonical 교직원ID |
| L | 정정일시 | ISO 8601 시각 |
| M | createdAt | 최초 기록 시각 |

논리 unique는 **취소되지 않은** `(eventId, 교직원ID)` 1건이다. 취소된 원본 행은 삭제하지 않으며 관리자 보정은 새 기록으로 추가한다. `signatureId`는 기록별 UUID다. 이름·부서·이메일은 이 탭에 복제하지 않는다.

## 서버 설정과 권한

- `TRAINING_QR_SECRET`: 32바이트 이상의 임의 비밀값을 서버 환경에만 설정한다. QR HMAC 검증에 사용한다. 브라우저의 `VITE_` 변수에 두지 않는다.
- `TRAINING_SIGNATURE_DRIVE_FOLDER_ID`: 서비스 계정이 파일을 만들 수 있는 **비공개 공유 드라이브(Shared Drive) 폴더** ID. 서비스 계정의 `canAddChildren` 권한과 폴더·상위 경로의 비공개 ACL을 확인한다. 비공개 My Drive 폴더는 권한 검사에는 통과할 수 있어도 서비스 계정 업로드 저장소로는 지원하지 않는다. 사용자 OAuth 위임 업로드는 현재 구현되지 않았다.
- Firebase Admin 서비스 계정은 해당 워크북 편집 권한과 이 Drive 폴더의 파일 생성/읽기 권한이 필요하다. 실제 권한은 운영 승인 후 별도 확인한다.
- Firestore `training_attendance_locks`는 Admin SDK만 사용한다. 현행 `firestore.rules`의 최종 deny 규칙으로 클라이언트 직접 읽기·쓰기는 허용되지 않는다.
- `api/firebase/staff-directory.js`의 기존 함수에 resource를 추가했으므로 Vercel function 수는 증가하지 않는다.

## 쓰기와 실패 처리

Firebase ID token, 현재 학기 활성 assignment, canonical 교직원ID 및 재직상태를 서버에서 재검증한다. QR에는 교육 ID 또는 묶음 ID와 15분 유효 HMAC challenge만 들어간다. 이름, staffId, UID는 포함하지 않는다. Challenge는 외부 공유를 완전히 막는 위치 증명이 아니므로 현장에서 짧은 시간에 생성·표시한다.

출석 제출은 각 `(eventId, staffId)`의 Firestore 예약을 단일 transaction으로 선점한다. 그룹의 모든 교육에 대해 대상·제외·시간창·중복을 확인한 다음 PNG를 비공개 Drive에 만들고, Sheets `spreadsheets.batchUpdate`의 한 `appendCells` 요청으로 모든 행사 행을 함께 기록한다. Sheets의 이 요청은 원자적으로 적용된다. PNG 파일명과 비공개 `appProperties`에는 requestId를 남기고, 업로드 전후 파일·폴더·공유 드라이브 권한을 확인한다. 파일 자체에 직접 부여된 공개 권한을 발견하면 즉시 철회하고 Sheet 기록을 막는다. 상속된 공개 권한 등 차단에 실패하면 관리자 즉시 확인 오류를 반환한다. 실패 시 `signatureId`로 재조회해 반영 여부를 확인한다. 미반영이 확실해도 Drive 파일은 자동 영구 삭제하지 않고 orphan 후보로 보존한다. 결과가 불명확하면 파일과 잠금을 보존하고 관리자 확인을 요구한다. 진행 중 잠금은 시간이 지나도 자동 재선점하지 않는다.

관리자 전용 `training-attendance-recovery-candidates`는 오래된 pending 후보를 최대 500개 조회하고 더 있으면 `truncated`를 표시한다. `training-attendance-recovery-check`와 `training-attendance-recovery-apply`는 eventId·교직원ID를 지정해 확인한다. 15분 이상 갱신되지 않은 pending의 Sheet 활성 서명 기록을 재조회해 행사별 정확히 1건이면 completed, 전부 0건이면서 append 시작 전이면 failed로 복구하여 재시도를 허용한다. append가 이미 시작됐는데 결과가 0건이면 지연된 Sheet 반영 위험 때문에 자동 복구하지 않는다. 30분 이상 지난 경우 관리자가 함수 종료와 Sheet 상태를 직접 확인한 뒤 `confirmedNoInflight: true`와 정정 사유를 명시해야 재시도 가능 상태로 전환된다. 중복, 묶음 일부 기록, 공개 orphan 파일에는 이 수동 해제를 허용하지 않는다. 상태 전환 전 Firestore transaction에서 requestId·상태·updatedAt·append 시작 표시를 재확인한다. 일반 교직원은 복구 API에 접근할 수 없다. 실패한 시도의 orphan 이력은 다음 예약에도 보존하며 관리자 조회에는 실제로 존재하는 파일 ID와 비공개 여부만 제공한다. 파일은 자동 영구 삭제하지 않는다.

## 적용 순서

1. 이 schema와 서버 설정을 사용자에게 확인받는다.
2. 새 탭을 숨김 상태로 생성하고 헤더만 넣는다. 샘플 교직원·교육 데이터는 넣지 않는다.
3. 비공개 Drive 폴더와 서비스 계정 권한, QA branch 전용 secret을 확인한다.
4. feature branch fixture 테스트와 관리자 UI를 검증한 다음 사용자 승인 후 `qa`에 병합한다.
5. 실제 운영 교육과 교직원 대상 행은 관리자가 별도로 등록한다. 이 작업에서 자동 생성하거나 이관하지 않는다.

현재 구현은 Phase 1 목록·상세와 기존 제출·법정의무연수 로직을 변경하지 않는다. 외부연수 이수증과 법정의무연수 UI 통합은 포함하지 않는다.
