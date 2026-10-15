# 교직원 교육센터 Phase 2 운영 준비

이 문서의 초기 준비 절차와 2026-10-07 QA handoff는 작성 당시의 기록이다. **현재 학교 PC 재개 기준은 맨 아래의 `2026-10-14 학교 PC handoff`를 따른다.** 운영 워크북에 QA 교육 샘플 행을 쓰지 않았다.

## Sheet schema

교육 이벤트는 환경별 Firestore `training_events_qa`/`training_events_production`을 원본으로 사용한다. 이관 원본인 `앱_교직원교육`은 별도 승인 단계에서 제거했다. `교직원교육대상`은 기존 Sheet 원본으로 유지하며 eventId로 조인한다. 전자서명 원장은 Phase 2에서 환경별 Firestore `training_signature_ledger_qa`/`training_signature_ledger_production`으로 전환하며, 기존 `교직원교육전자서명` 탭은 별도 삭제 승인 전까지 보존하되 runtime에서 읽거나 쓰지 않는다. 데이터가 없던 `앱_교직원교육자료`의 runtime reader는 제거했으며 교육 상세 응답은 `materials: []`를 유지한다. 아래 전자서명 Sheet 헤더 설명은 과거 이관 원본 schema 기록이다.

2026-10-10 이벤트 원본 전환: Production 원본 17컬럼 1행을 직접 재조회했고, `training_events_production` 기존 문서 0건을 확인했다. 이관 dry-run은 create 1/update 0/skip 0/conflict 0이었으며, 고정 eventId·원본 지문 검증 후 Firestore 문서 1건만 생성했다. 즉시 read-back은 skip 1/conflict 0, 별도 재실행 dry-run은 create 0/update 0/skip 1/conflict 0이었다. 해당 이벤트의 `미사용` 상태를 보존했다. 원본 Sheet는 삭제하지 않았고 대상·전자서명 Sheet는 변경하지 않았다. Production runtime smoke 결과는 배포 후 별도 기록한다.

| 열 | 헤더 | 용도 |
|---|---|---|
| A | signatureId | 기록별 고유 ID |
| B | eventId | `training_events_<environment>.eventId` |
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

## Phase 2 QA 종료 및 main 병합 검토 (2026-10-08)

- 최종 QA 종료 시점에 `qa`와 `feature/training-center-phase2`는 `8064718e739c444fc146fd2c344be300d8ad2125`로 일치한다. 최신 fail-closed 보완, QA workbook 격리와 runtime preflight를 확인했으며 추가 실환경 QA는 종료했다.
- 고정 QA Preview에서 승인된 QA 관리자 본인의 정상 출석·전자서명 흐름을 여러 차례 실제로 검증했다. 단일·묶음 QR, 중복 제출 차단, 관리자 현황·보정, 연수등록부 PDF와 서명 표시는 수행한 QA 범위에서 확인했다.
- stale lock 복구와 원본 requestId의 orphan PNG 재사용 계약은 fixture 기반 자동 테스트로 검증했다. 실제 stale 상태를 강제로 만드는 재현은 추가 수행하지 않았다. 의도적 실패 상태 생성은 추가 검증 실익에 비해 QA 데이터·잠금·Drive 잔여물의 운영 리스크가 크기 때문이다. 실환경 stale recovery 성공을 확인된 사실로 간주하지 않는다는 한계를 accepted residual risk로 수용하며, 이를 이유로 추가 실환경 QA를 진행하지 않는다.
- 분리된 QA 워크북에는 `[QA]` 교육 5건(모두 `미사용`), 승인된 관리자 본인 대상 행 5건, 전자서명 감사 행 4건이 남아 있다. 감사 행·비공개 PNG·잠금은 자동 삭제하지 않는다. QA 전자서명 탭은 숨김 상태이고 임시 보호 규칙은 남아 있지 않다.
- QA 워크북, Drive `qa` namespace, Firestore `training_attendance_locks_qa`는 Production 데이터와 분리되어 있다. 이번 종료 점검에서는 외부 데이터를 수정하지 않았다.
- Production에는 서버 전용 `TRAINING_DRIVE_OAUTH_CLIENT_ID`, `TRAINING_DRIVE_OAUTH_CLIENT_SECRET`, `TRAINING_DRIVE_OAUTH_REFRESH_TOKEN` 설정이 완료됐다. 실제 값은 문서나 Git에 복제하지 않는다. Production 서명 Drive root의 명시적 bootstrap은 아직 실행하지 않았다.
- 교육센터 전용 workbook resolver는 Production에서 운영 워크북만, 고정 `qa` Preview에서 명시적인 비운영 QA 워크북만 허용한다. 모든 feature/임의 Preview에서는 override 유무와 무관하게 GET/list/detail/관리자 API를 인증·Sheet 조회 전에 거부한다. 기존 일반 staff-directory resolver의 fallback 정책은 변경하지 않았다. Firebase same-origin auth host 허용 목록도 Production과 고정 `qa`만 유지한다.
- 관리자 QR 발급은 Drive OAuth 인증, 전용 root 존재·비공개 및 읽기 준비를 확인한 후에만 challenge를 생성한다. root가 없으면 `needsBootstrap` 오류를 반환하며 preflight나 QR 발급에서 bootstrap을 자동 실행하지 않는다. Production root bootstrap은 main 병합 조건이 아니며 배포 후 운영 QR 활성화 전에 별도 승인으로 수행한다.
- `server/lib/trainingCenterPhase2Api.js`와 `server/lib/trainingSignatureStorage.js`의 책임 분리는 유지보수 follow-up 후보이며, 현재 검증된 동작을 변경하는 merge blocker로 분류하지 않는다.

## Production 출시 순서

1. 고정 `qa`가 최신 feature SHA로 Ready이고 교육 목록·상세, 관리자 QR 및 fail-closed 회귀 점검을 통과하면 main 병합을 별도로 승인한다.
2. `main` 병합 후 Production 배포를 확인한다. 이 시점에 서명 root가 없다면 QR 발급은 `503`과 `needsBootstrap`으로 차단되어야 하며, 자동 bootstrap은 실행되지 않는다.
3. Production 관리자 로그인 후 read-only `training-runtime-preflight`로 Firebase Admin, QR secret, 서비스 계정 Sheet schema, Drive OAuth 인증과 root 상태를 확인한다.
4. root 미생성 상태의 QR 발급 차단을 확인한 뒤 관리자가 명시적으로 `training-signature-storage-bootstrap`을 실행한다. 이것이 Production Drive root를 만드는 유일한 단계다.
5. root 비공개·읽기 준비, 서명 Sheet A:M schema와 QR secret 유효성을 다시 확인한다. 모든 준비 항목이 통과한 뒤에만 운영 QR 발급·전자서명 사용을 시작한다.

Production root bootstrap은 main 병합 **전** 조건이 아니라 운영 QR 사용 **전** 필수 조건이다. 해당 bootstrap, 운영 교육·서명 생성, Production Sheet/Firestore/Drive write는 별도 승인과 배포 후 점검 절차에서만 수행한다.

## 2026-10-14 학교 PC handoff

이 섹션은 위의 Phase 2 출시 전 기록보다 최신이다. 학교 PC에서 작업을 재개할 때 먼저 이 상태를 확인한다. 아래 SHA와 테스트 수치는 **이 문서 커밋 전 기준점**이며 문서 커밋 후 `qa` HEAD는 한 커밋 앞으로 이동한다.

### 1. Git 기준점과 보호 대상

- 집 저장소: `C:\Users\보건실\OneDrive\문서\GitHub\sehwa-health-portal`, branch `qa`.
- 작성 전 `qa` HEAD와 `origin/qa`는 모두 `fa9adccc6d6457891774ff7b097810d469af350d`로 일치하며 divergence는 `0/0`, working tree는 clean이었다.
- Production `origin/main`은 `1dbce0865eff683b39a2bc945af996b58bd6133b`이다. `qa`와 `main`은 서로 다른 상태이며 QA UI 변경을 Production 반영 완료로 해석하면 안 된다.
- 보호 stash `pre-main-sync-home-hwpx-work` (`2a40e8f5cd46746aa064163874c4a9cbb6b54b8d`)는 그대로 유지한다. 학교 PC에서도 apply/pop/drop하지 않는다.

### 2. Production에 완료된 교육센터 기능

권한과 소유권:

- `training_admin`은 `ownerStaffId`가 본인인, 본인이 생성한 교육만 관리한다. 타인 교육의 관리자 API와 직접 URL 접근은 `403`이다.
- `health_teacher`/`admin`은 전체 교육을 관리한다. 일반 교직원은 관리자 기능에 접근하지 못한다.
- `ownerStaffId`가 없는 기존 교육은 `health_teacher`/`admin`만 관리한다. 기존 교육에 소유자를 자동 부여하지 않는다.

출석과 출력:

- 미참석 사유 `출장`, `연가`, `병가`, `공가`, `특별휴가`, `기타`를 관리하며 연수등록부와 PDF/XLSX 출력에 반영한다.

새 교육의 대상자 선택:

- `전체 교직원`, `교원 중심`, `직접 선택` 프리셋과 행정실·시간강사 포함/제외, 부서 필터, 검색, 개별 추가/제외를 지원한다.
- 생성 시 canonical `staffId`를 서버에서 재검증하고 `targetSnapshot`과 `targetStaffIds`를 확정 저장한다. 미리보기 후 명단이 달라지면 `409`로 저장을 중단한다.
- 새 교육부터 snapshot을 적용한다. 기존 교육 대상자 자동 재계산·migration은 없고 기존 `교직원교육대상` Sheet도 자동 변경하지 않는다.
- Production read-only smoke에서 실제 명단은 전체 94명, 교원 중심 82명, 행정실 제외 82명, 1학년부 13명, 시간강사 10명, 교원 중심에서 시간강사 제외 시 72명으로 확인됐다.

### 3. 공통 포털/workspace UI

공통 포털/workspace (`5142bd8` 계열 이후):

- `/`, `/training`, `/firebase-dashboard`는 사이드바가 없는 카드형 portal/landing이다.
- 실제 관리자 업무에 들어가면 기존 글로벌 Header 아래에 좌측 local sidebar와 우측 workspace content를 표시한다. 모바일 sidebar는 메뉴로 접힌다.
- QA에서 Desktop 1440px과 Mobile 390px 시각 검수를 마친 뒤 Production에 반영했다. 이 절은 당시 검수 근거와 현재 공통 UI 계약을 함께 기록한다.

교육 대상 관리 리디자인 (`fa9adccc6d6457891774ff7b097810d469af350d`):

- `그룹 선택 → 조건 조정 → 현재 대상 인원 확인 → 필요 시 명단 펼침 → 개별 예외 조정 → 한 번에 저장` 흐름이다.
- 사람마다 반복되던 대상 상태 select·필수 checkbox·제외 사유 input·개별 저장 버튼을 기본 목록에서 제거했다. 명단은 기본 접힘이며 펼치면 compact list/table, 검색, 개별 추가/제외와 `예외 설정`을 제공한다.
- 기존 대상/변경 후/추가 예정/제외 예정 수를 표시한다. 모바일 390px 첫 화면에 프리셋, 현재 인원, `대상자 명단 보기`, 단일 `변경 저장`이 함께 보인다.
- `필수`는 공개 교육 화면의 필수 표시와 연결된다. `제외 사유`는 제외 대상 기록으로 유지한다. 둘 다 삭제하지 않고 개별 `예외 설정`에 보존했다.
- 실제 QA canonical 명단 미리보기: 전체 12명, 교원 중심 9명, 행정실 제외 9명, 시간강사 제외 9명, 1학년부 1명. QA 명단에는 시간강사가 없어 그 옵션의 포함/제외 효과는 synthetic 필터 테스트로 검증했다.
- 기존 9명 교육에서 1명 추가 시 10명, 이어 1명 제외 시 9명과 `추가 1/제외 1`이 표시됐다. `변경 취소` 시 원래 9명으로 돌아왔고 실제 저장은 하지 않았다.
- 페이지 진입만으로 기존 대상이 바뀌거나 write되지 않는다. canonical 검증, snapshot 계약, 명단 변경 `409`, 소유권 `403`은 유지한다.
- 검증: 대상 관련 74/74, 전체 `npm test` 346/346 PASS, `npm run build` 및 `git diff --check` PASS, API function 12개. 고정 QA Preview는 `https://sehwa-health-portal-git-qa-sungandi86-maxs-projects.vercel.app/firebase-admin/trainings`이며 최종 QA 배포의 READY와 실제 화면을 확인했다.

### 4. 학교 PC에서 이어갈 순서

1. 학교 저장소의 branch·HEAD·working tree·보호 stash를 먼저 확인한다. 미커밋 변경이 있으면 덮어쓰지 말고 중단한다.
2. `git fetch origin` 후 `origin/qa` 최신 HEAD를 확인한다. 로컬 `qa`가 뒤에만 있고 clean일 때만 fast-forward한다. `main`은 이 단계에서 변경하지 않는다.
3. 고정 QA Preview가 최신 `qa` SHA의 READY 배포를 가리키는지 확인하고 교육 관리·대상 관리 화면을 1440px/390px에서 읽기 전용으로 재확인한다.
4. `fa9adcc` 기준 대상 관리 리디자인을 포함해 Production 반영 대상을 **선별**한다. 포털/workspace UI와 대상 관리 UI는 현재 QA에만 있다. `qa` 전체를 `main`에 merge하지 않는다.
5. QA fixture, runtime synthetic 신원·데이터 생성 경로를 Production 반영에서 제외한다. 기존 교육 snapshot migration, `교직원교육대상` Sheet 자동 변경은 하지 않는다.
6. 선별 반영 전후에 ownership `403`, canonical 검증, `409`, QR/출석/연수등록부/PDF/XLSX 회귀와 전체 `npm test`, `npm run build`, `git diff --check`, API function 12개를 확인한다.
7. 별도 승인에 따른 Production 배포 후에는 실제 교육·출석을 생성하지 않는 read-only visual smoke로 portal/workspace, 대상 미리보기와 기존 교육 호환을 확인한다.

### 5. UI 원칙

- 첫 화면과 센터 landing은 카드형 portal, 실제 업무 화면은 좌측 local sidebar와 우측 workspace다. `/training`은 portal이고 `내 교육 관리` 이후 및 특정 교육의 targets/qr/attendance/final-sheet는 같은 교육 sidebar 안에서 이동한다.
- 네이비·블루·민트의 밝고 단정한 학교 행정 포털 톤을 유지한다. 과한 gradient, glassmorphism, AI dashboard 같은 장식은 피한다.
- 사이드바 노출 여부는 권한 검사 대체 수단이 아니다. 서버의 role·ownership 검증을 유지한다.

### 6. 전 교직원 안내 계획 (아직 발송 전)

기능과 디자인이 모두 Production에 반영되고 운영 화면 이미지를 준비한 뒤 안내한다. 지난 온라인 교무실 연수에서 시연한 교직원 연수 QR 출석·전자서명 기능을 온라인 보건실에 구현했다는 흐름으로 설명한다. 교장선생님께 사용을 건의했고 사용해보자는 승인을 받았음을 알린다. 부서별 교육 담당자가 메신저로 요청하면 `교육센터 관리자` 권한을 부여하며, 이 권한은 본인이 생성한 교육만 관리한다는 점을 명시한다. 실제 운영 화면 이미지를 첨부할 계획이다. 이 문서 작성 단계에서 권한 부여나 안내 발송은 하지 않는다.

### 7. 다음 작업의 금지사항

- `qa` 전체를 `main`에 무조건 merge하지 않는다. QA fixture/runtime synthetic data를 Production에 반영하지 않는다.
- 기존 교육의 snapshot을 자동 이관·재계산하지 않는다. `교직원교육대상` Sheet를 자동 변경하지 않는다.
- 보호 stash를 apply/pop/drop하지 않는다. API function 수를 12개보다 늘리지 않는다.
