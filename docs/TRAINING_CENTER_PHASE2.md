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
| G | 서명파일ID | 비공개 Google Drive file ID, 관리자 보정이면 공란 |
| H | 상태 | `완료` 또는 `취소` |
| I | 취소여부 | `Y` 또는 `N` |
| J | 취소사유 | 관리자 정정 사유 |
| K | 정정자 | 관리자 canonical 교직원ID |
| L | 정정일시 | ISO 8601 시각 |
| M | createdAt | 최초 기록 시각 |

논리 unique는 **취소되지 않은** `(eventId, 교직원ID)` 1건이다. 취소된 원본 행은 삭제하지 않으며 관리자 보정은 새 기록으로 추가한다. `signatureId`는 기록별 UUID다. 이름·부서·이메일은 이 탭에 복제하지 않는다.

## 서버 설정과 권한

- `TRAINING_QR_SECRET`: 32바이트 이상의 임의 비밀값을 서버 환경에만 설정한다. QR HMAC 검증에 사용한다. 브라우저의 `VITE_` 변수에 두지 않는다.
- `TRAINING_DRIVE_OAUTH_CLIENT_ID`, `TRAINING_DRIVE_OAUTH_CLIENT_SECRET`, `TRAINING_DRIVE_OAUTH_REFRESH_TOKEN`, `TRAINING_SIGNATURE_DRIVE_FOLDER_ID`는 서버 환경에만 설정한다. refresh token과 client secret을 브라우저, Sheet, Firestore, 로그에 노출하지 않는다.
- Google Sheet 읽기·쓰기는 기존 Firebase Admin service account와 Sheets API를 계속 사용한다. Drive OAuth credential은 전자서명 파일에만 사용한다.
- 고정된 기존 My Drive 폴더를 env ID로 bootstrap하고 그 하위 파일을 검색·검증해야 하므로 현재 OAuth scope는 `https://www.googleapis.com/auth/drive`다. `drive.file`은 OAuth 앱이 생성했거나 사용자가 Picker로 선택한 파일에 한정되므로 현재 고정 폴더 계약에는 충분하지 않다. 향후 앱이 폴더를 직접 생성·선택하는 연결 UI를 도입하면 `drive.file`로 축소를 재검토한다.
- 현재 Phase는 관리자가 별도로 발급한 offline refresh token을 Vercel encrypted env에 넣는 single-school bootstrap까지만 지원한다. 향후 연결 UI는 서버가 만든 일회성 state를 HttpOnly/SameSite 세션과 대조하고 authorization code를 서버에서만 교환해야 하며, token을 브라우저 응답이나 Firestore 평문으로 저장하지 않는다.
- 전자서명은 configured private root의 `<year>/requests/<requestId>.png`에 저장한다. 이름, staffId, UID, 부서, 직위는 파일명이나 appProperties에 넣지 않는다.
- 서명 root와 파일에 `anyone` 또는 `domain` permission이 있으면 fail closed한다. 공개 링크와 `webContentLink`는 생성하거나 반환하지 않는다.
- Firestore `training_attendance_locks`는 Admin SDK만 사용한다. 현행 `firestore.rules`의 최종 deny 규칙으로 클라이언트 직접 읽기·쓰기는 허용되지 않는다.
- `api/firebase/staff-directory.js`의 기존 함수에 resource를 추가했으므로 Vercel function 수는 증가하지 않는다.

## 쓰기와 실패 처리

Firebase ID token, 현재 학기 활성 assignment, canonical 교직원ID 및 재직상태를 서버에서 재검증한다. QR에는 교육 ID 또는 묶음 ID와 15분 유효 HMAC challenge만 들어간다. 이름, staffId, UID는 포함하지 않는다. Challenge는 외부 공유를 완전히 막는 위치 증명이 아니므로 현장에서 짧은 시간에 생성·표시한다.

출석 제출은 각 `(eventId, staffId)`의 Firestore 예약을 단일 transaction으로 선점한다. 그룹의 모든 교육에 대해 대상·제외·시간창·중복을 확인한 다음 Vercel 서버가 Google 사용자 OAuth credential로 private My Drive에 PNG를 저장하고, Sheets `spreadsheets.batchUpdate`의 한 `appendCells` 요청으로 모든 행사 행을 함께 기록한다. Sheets의 이 요청은 원자적으로 적용된다. 그룹 QR도 requestId 기준 파일 하나를 만들고 여러 행사 row가 같은 Drive file ID를 참조한다. 미반영이 확실해도 Drive 파일은 자동 영구 삭제하지 않고 orphan 후보로 보존한다. 결과가 불명확하면 file ID와 잠금을 보존하고 관리자 확인을 요구한다. 진행 중 잠금은 시간이 지나도 자동 재선점하지 않는다.

관리자 전용 `training-attendance-recovery-candidates`는 오래된 pending 후보를 최대 500개 조회하고 더 있으면 `truncated`를 표시한다. `training-attendance-recovery-check`와 `training-attendance-recovery-apply`는 eventId·교직원ID를 지정해 확인한다. 15분 이상 갱신되지 않은 pending의 Sheet 활성 서명 기록을 재조회해 행사별 정확히 1건이면 completed, 전부 0건이면서 append 시작 전이면 failed로 복구하여 재시도를 허용한다. append가 이미 시작됐는데 결과가 0건이면 지연된 Sheet 반영 위험 때문에 자동 복구하지 않는다. 30분 이상 지난 경우 관리자가 함수 종료와 Sheet 상태를 직접 확인한 뒤 `confirmedNoInflight: true`와 정정 사유를 명시해야 재시도 가능 상태로 전환된다. 중복, 묶음 일부 기록, 공개 orphan 파일에는 이 수동 해제를 허용하지 않는다. 상태 전환 전 Firestore transaction에서 requestId·상태·updatedAt·append 시작 표시를 재확인한다. 일반 교직원은 복구 API에 접근할 수 없다. 실패한 시도의 orphan 이력은 다음 예약에도 보존하며 관리자 조회에는 실제로 존재하는 파일 ID와 비공개 여부만 제공한다. 파일은 자동 영구 삭제하지 않는다.

## 임시 서명 보관과 삭제 감사

교직원은 교육마다 새로 서명하며 이전 교육의 PNG를 재사용하지 않는다. PDF 생성 중 실제로 읽힌 file ID가 최종 roster의 활성 서명 file ID와 모두 일치하고 PDF magic 검증이 통과한 경우에만 lock에 `rosterPdfVerifiedAt`, `rosterPdfVerifiedBy`를 기록한다. 그룹 request는 연결된 모든 event lock에 PDF 검증 시각이 기록되어야 `signatureCleanupState=eligible`이 된다. PDF 생성 실패, 이미지 누락, lock/file 불일치 상태에서는 cleanup eligible로 전환하지 않는다.

현재 PDF는 다운로드 응답으로만 전달되고 서버에 영구 보관되지 않는다. 생성 직후 PNG를 삭제하면 재다운로드가 불가능하므로 이번 단계에서는 자동 hard delete를 실행하지 않는다. Drive adapter의 삭제 primitive는 root boundary와 private permission을 재검증하지만, 실제 삭제 연결은 최종 PDF 영구 보관 또는 관리자의 최종 보관 확인 절차가 추가된 뒤에만 허용한다. 삭제를 연결할 때에는 `eligible → deleting → deleted/failed` 상태와 시각·수행자를 lock에 남겨야 한다.

## 적용 순서

1. 이 schema, 전용 Drive OAuth client, private root 폴더와 server-only env 설정을 사용자에게 확인받는다.
2. 새 탭을 숨김 상태로 생성하고 헤더만 넣는다. 샘플 교직원·교육 데이터는 넣지 않는다.
3. QA 환경에서 OAuth auth, root 접근과 private permission을 read-only 점검한 뒤 synthetic PNG로 storage-only save/read/idempotency를 확인한다.
4. feature branch fixture 테스트와 관리자 UI를 검증한 다음 사용자 승인 후 `qa`에 병합한다.
5. 실제 운영 교육과 교직원 대상 행은 관리자가 별도로 등록한다. 이 작업에서 자동 생성하거나 이관하지 않는다.

현재 구현은 Phase 1 목록·상세와 기존 제출·법정의무연수 로직을 변경하지 않는다. 외부연수 이수증과 법정의무연수 UI 통합은 포함하지 않는다.

## 연수등록부 출력

공식 XLSX 템플릿 기반 XLSX 생성은 병합, 열 너비, 행 높이, 인쇄 영역과 전자서명 이미지 위치를 보존한다. PDF는 Apps Script나 LibreOffice 같은 외부 런타임 없이 Vercel에서 동작하도록 `pdf-lib`와 내장 Noto Sans KR font asset으로 A4 문서를 생성한다. 동일한 최종 roster model과 Google Drive OAuth로 읽은 private PNG를 사용하며 A~E의 연번·직위·성명·서명·연수일자를 출력한다. Excel 고유 렌더링과 픽셀 단위로 동일한 변환은 보장하지 않으므로 QA에서 페이지 나눔, 한글, 서명 크기와 인쇄 결과를 수동 확인한다.

향후 다학교 확장은 `schoolId → encrypted OAuth credential → private root folder` tenant 설정으로 분리한다. refresh token은 KMS 또는 암호화된 credential store에 보관하고 이번 Phase의 단일 env token을 그대로 확장하지 않는다. client direct upload와 공개 Drive URL은 제공하지 않는다.
