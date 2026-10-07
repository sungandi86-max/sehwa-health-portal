# 교직원 교육센터 Phase 2 운영 준비

이 문서의 초기 준비 절차와 QA handoff는 작성 당시의 기록이다. 현재 QA 종료 상태와 main 병합 전 조건은 맨 아래의 `Phase 2 QA 종료 및 main 병합 검토`를 따른다. 운영 워크북에 QA 교육 샘플 행을 쓰지 않았다.

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
- `TRAINING_DRIVE_OAUTH_CLIENT_ID`, `TRAINING_DRIVE_OAUTH_CLIENT_SECRET`, `TRAINING_DRIVE_OAUTH_REFRESH_TOKEN`은 서버 환경에만 설정한다. refresh token과 client secret을 브라우저, Sheet, Firestore, 로그에 노출하지 않는다.
- Google Sheet 읽기·쓰기는 기존 Firebase Admin service account와 Sheets API를 계속 사용한다. Drive OAuth credential은 전자서명 파일에만 사용한다.
- Drive OAuth scope는 `https://www.googleapis.com/auth/drive.file`만 사용한다. 앱이 만든 전용 폴더와 PNG만 탐색·읽기·삭제하며 사용자의 다른 My Drive 파일에 접근하지 않는다.
- 현재 Phase는 관리자가 별도로 발급한 offline refresh token을 Vercel encrypted env에 넣는 single-school bootstrap까지만 지원한다. 향후 연결 UI는 서버가 만든 일회성 state를 HttpOnly/SameSite 세션과 대조하고 authorization code를 서버에서만 교환해야 하며, token을 브라우저 응답이나 Firestore 평문으로 저장하지 않는다.
- 최초 storage-only QA에서 명시적 bootstrap을 실행해 My Drive에 `온라인보건실_연수서명_임시` root를 만든다. read-only preflight는 root가 없으면 `needsBootstrap`만 반환하며 폴더를 만들지 않는다. root는 폴더명이 아니라 `appOwner=sehwa-health-portal`, `purpose=training-signatures-root` appProperties로 식별하고, 2개 이상이면 무결성 오류로 중단한다.
- bootstrap은 기존 Firebase 관리자 인증이 적용된 `training-signature-storage-bootstrap` POST resource로만 실행한다. 응답에는 생성 여부만 포함하고 Drive folder ID는 노출하지 않는다.
- 전자서명은 앱이 만든 private root의 `<year>/requests/<requestId>.png`에 임시 저장한다. year, requests, PNG에도 appProperties marker를 두며 이름, staffId, UID, 부서, 직위, eventId는 파일명이나 appProperties에 넣지 않는다.
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

1. 이 schema, 전용 Drive OAuth client와 server-only env 설정을 사용자에게 확인받는다.
2. 새 탭을 숨김 상태로 생성하고 헤더만 넣는다. 샘플 교직원·교육 데이터는 넣지 않는다.
3. QA 환경에서 OAuth auth를 read-only 점검하고, 명시적 bootstrap으로 app 전용 private root를 만든 뒤 synthetic PNG로 storage-only save/read/idempotency를 확인한다.
4. feature branch fixture 테스트와 관리자 UI를 검증한 다음 사용자 승인 후 `qa`에 병합한다.
5. 실제 운영 교육과 교직원 대상 행은 관리자가 별도로 등록한다. 이 작업에서 자동 생성하거나 이관하지 않는다.

현재 구현은 Phase 1 목록·상세와 기존 제출·법정의무연수 로직을 변경하지 않는다. 외부연수 이수증과 법정의무연수 UI 통합은 포함하지 않는다.

## QA handoff (2026-10-07)

- 검증 branch: `feature/training-center-phase2`
- 검증 commit: `dff11643e18d056d4e405dee917b4dbca135a837`
- Preview deployment: `https://sehwa-health-portal-h8usdawbm-sungandi86-maxs-projects.vercel.app`
- Preview branch 전용으로 `TRAINING_DRIVE_OAUTH_CLIENT_ID`, `TRAINING_DRIVE_OAUTH_CLIENT_SECRET`, `TRAINING_DRIVE_OAUTH_REFRESH_TOKEN`, `FIREBASE_SERVICE_ACCOUNT_BASE64` 키를 설정했다. 값은 문서, Git, 로그에 남기지 않았다.
- Firebase Authentication authorized domain에 위 Preview hostname을 추가했고, `health_teacher` 세션에서 관리자 교육관리 화면의 read-only 런타임 점검을 실행했다.
- 관리자 API 인증과 Firebase Admin 초기화는 성공했다.
- Google Drive OAuth 인증은 성공했다. 앱 전용 root가 아직 없어 `needsBootstrap=true`, `rootReady=false`로 확인됐다.
- root가 없으므로 `서명 저장소 초기화`, `서명 폴더 비공개`, `서명 읽기 준비`는 아직 미완료다. 이는 bootstrap 전의 예상 상태다.
- feature Preview에는 `TRAINING_QR_SECRET`이 아직 설정되지 않아 QR secret 설정/유효성 점검은 실패 상태다.
- 이 점검까지 Drive create/write/delete, Sheet write, Firestore write는 모두 0건이다. Production, `qa`, `main`에는 변경이 없다.

집에서 재개할 첫 단계는 관리자 인증 상태에서 `training-signature-storage-bootstrap`을 명시적으로 한 번 실행해 앱 전용 private root를 생성하는 것이다. bootstrap 직후 root marker와 private permission을 확인한 다음에만 synthetic PNG로 storage-only save/read/idempotency QA를 진행한다. 운영 서명, 교육 행사, Sheet/Firestore 데이터를 사용하는 전체 E2E는 storage-only QA가 모두 통과할 때까지 금지한다.

## 연수등록부 출력

공식 XLSX 템플릿 기반 XLSX 생성은 병합, 열 너비, 행 높이, 인쇄 영역과 전자서명 이미지 위치를 보존한다. PDF는 Apps Script나 LibreOffice 같은 외부 런타임 없이 Vercel에서 동작하도록 `pdf-lib`와 내장 Noto Sans KR font asset으로 A4 문서를 생성한다. 동일한 최종 roster model과 Google Drive OAuth로 읽은 private PNG를 사용하며 A~E의 연번·직위·성명·서명·연수일자를 출력한다. Excel 고유 렌더링과 픽셀 단위로 동일한 변환은 보장하지 않으므로 QA에서 페이지 나눔, 한글, 서명 크기와 인쇄 결과를 수동 확인한다.

향후 다학교 확장은 `schoolId → encrypted OAuth credential → private root folder` tenant 설정으로 분리한다. refresh token은 KMS 또는 암호화된 credential store에 보관하고 이번 Phase의 단일 env token을 그대로 확장하지 않는다. client direct upload와 공개 Drive URL은 제공하지 않는다.

## Phase 2 QA 종료 및 main 병합 검토 (2026-10-07)

- `qa`와 `feature/training-center-phase2`는 QA 종료 시점에 `edf64cdf6a377b75bca5ed485b54aa6845fcb261`로 일치한다. `main`과 Production 배포는 변경하지 않았다.
- 고정 QA Preview에서 승인된 QA 관리자 본인의 정상 출석·전자서명 흐름을 여러 차례 실제로 검증했다. 단일·묶음 QR, 중복 제출 차단, 관리자 현황·보정, 연수등록부 PDF와 서명 표시는 수행한 QA 범위에서 확인했다.
- stale lock 복구와 원본 requestId의 orphan PNG 재사용 계약은 fixture 기반 자동 테스트로 검증했다. 실제 stale 상태를 강제로 만드는 재현은 추가 수행하지 않았다. 의도적 실패 상태 생성은 추가 검증 실익에 비해 QA 데이터·잠금·Drive 잔여물의 운영 리스크가 크기 때문이다. 따라서 실환경 stale recovery 성공은 확인된 사실로 간주하지 않는다.
- 분리된 QA 워크북에는 `[QA]` 교육 5건, 승인된 관리자 본인 대상 행 5건, 전자서명 감사 행 4건이 남아 있다. 교육 4건은 `사용`·`진행중`, stale recovery 확인용 교육 1건은 `미사용`이다. QA 화면의 혼동을 막기 위해 활성 QA 교육 4건을 `미사용`으로 전환하는 것은 후속 정리 후보이며, 감사 행·비공개 PNG·잠금은 자동 삭제하지 않는다. QA 전자서명 탭은 숨김 상태이고 임시 보호 규칙은 남아 있지 않다.
- QA 워크북, Drive `qa` namespace, Firestore `training_attendance_locks_qa`는 Production 데이터와 분리되어 있다. 이번 종료 점검에서는 외부 데이터를 수정하지 않았다.
- main 병합 전에는 Production의 서버 전용 `TRAINING_DRIVE_OAUTH_CLIENT_ID`, `TRAINING_DRIVE_OAUTH_CLIENT_SECRET`, `TRAINING_DRIVE_OAUTH_REFRESH_TOKEN` 설정이 필요하다. QA Preview의 값을 문서나 Git에 복제하지 않는다. 현재 Production에는 이 세 키가 없으므로 병합 준비 검토는 가능하지만 실제 main 병합은 안전하지 않다.
