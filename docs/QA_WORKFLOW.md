# 온라인 보건실 QA 워크플로

`qa`는 `main`과 분리된 장기 유지 Preview 브랜치입니다. Vercel의 `qa` 브랜치 고정 URL에서 교직원 인증과 기능을 검증한 뒤에만 `main`에 반영합니다. commit별 Preview URL이나 개별 feature 브랜치는 기본 인증 QA 주소로 사용하지 않습니다.

## 개발 순서

1. `feature/*`에서 개발하고 관련 테스트, `npm run build`, `git diff --check`를 통과시킵니다.
2. feature 브랜치를 push하고 PR 또는 fast-forward/일반 merge로 `qa`에 반영합니다. rebase나 force push로 공유 이력을 다시 쓰지 않습니다.
3. `qa` Preview가 Ready이고 해당 SHA를 가리키는지 확인합니다. 고정 QA URL에서 desktop Google·Teams popup, mobile/PWA Google·Teams redirect, 권한 및 기능을 검증합니다.
4. 문제가 있으면 feature에서 수정해 `qa`를 다시 갱신합니다. QA를 통과한 commit만 `main` PR/merge 대상으로 삼습니다.
5. Production 배포 후 Production 도메인에서 핵심 로그인과 기능을 별도로 확인합니다.

feature 브랜치 Preview는 필요할 때 빌드와 비인증 UI를 점검하는 용도입니다. Firebase Authorized domains나 Firebase Admin credential을 feature마다 추가하지 않습니다.

## 고정 환경과 보안

- Production: `sehwa-health-portal.vercel.app` (`main`). Production 환경변수와 배포는 QA 설정과 분리합니다.
- QA: `https://sehwa-health-portal-git-qa-sungandi86-maxs-projects.vercel.app` (`qa` 브랜치 고정 alias). 새 `qa` commit마다 이 alias가 최신 Ready 배포를 가리키는지 확인합니다.
- Firebase Authentication Authorized domains에는 정확한 QA alias 한 개만 추가합니다. `*.vercel.app` 같은 wildcard는 사용하지 않습니다.
- OAuth 제공자에서 custom `authDomain`의 `https://sehwa-health-portal-git-qa-sungandi86-maxs-projects.vercel.app/__/auth/handler`가 필요한 경우 Google·Microsoft redirect URI를 각각 확인합니다.
- Vercel의 `FIREBASE_SERVICE_ACCOUNT_BASE64`는 `Preview / Git Branch: qa`에만 설정합니다. 모든 Preview 공통이나 Development에는 설정하지 않습니다. Vercel Preview 보호를 유지합니다.
- Firebase ID token, current assignment, canonical staffId, 서버 role gate는 QA에서도 동일하게 검증합니다. QA 중 운영 Sheet/Firestore를 임의 수정하지 않습니다.
- Hobby 플랜의 serverless function 한도에 맞춰 `api/**/*.js`를 12개 이하로 유지합니다.

## 최초 QA 확인

1. 고정 QA URL의 `/training`을 열고, 비인증 `training-list` 요청이 401인지 확인합니다.
2. 실계정 로그인 후 이름·현재 학기를 확인하고 `training-list`가 200인지 확인합니다. 교육 Sheet가 헤더만 있으면 `{ "ok": true, "items": [] }`와 빈 목록이 정상입니다.
3. mobile/PWA redirect 후에도 같은 QA URL로 복귀하고 로그인 상태가 유지되는지 확인합니다. `unauthorized-domain`, redirect loop, Microsoft redirect URI 오류가 없는지 확인합니다.
4. Vercel Preview 배포의 SHA, Ready 상태, 함수 한도 오류 부재를 확인합니다. 실계정 QA가 불가능한 항목은 성공으로 표시하지 않습니다.

QA 인증과 기능 검증이 끝난 뒤에만 이전 feature 브랜치 alias의 Firebase Authorized domain 및 feature 전용 Vercel credential을 제거할지 별도 검토합니다. 기존 설정을 먼저 삭제하지 않습니다.

## 관리자 대리등록 QA read 격리 (2026-10-14)

집 저장소 점검 당시 HEAD는 `a2baf89`, clean이었다. fetch 후 `origin/qa`는 `bbee065`로 7커밋 앞서 있었다. `bbee065`는 대리등록 collection과 서버 조회 resource를 추가했지만 관리자 목록의 Production 직접 조회 병합과 대상자 제출현황의 직접 조회는 남아 있었다. 학교 PC의 미커밋 파일을 원격에서 복구한 것으로 간주하지 않으며, 최신 원격 기준으로 남은 경로를 수정한다.

| 경로 | 이번 QA 변경 |
| --- | --- |
| `/firebase-admin/submissions` 교직원 제출 목록 | client 직접 `staff_submissions` read 제거, 인증 resource GET만 사용 |
| `/firebase-admin/submission-status` 대상자 제출현황 | 같은 resource에 `itemId`를 전달, canonical staffId/uid join 유지 |
| `staff-directory?resource=admin-proxy-submissions` | 기존 관리자 gate 유지, 일반/대리등록 함께 조회, QA는 `staff_submissions_qa`, Production main은 기존 `staff_submissions` |
| 환경 판별 실패 | HTTP 503, collection 조회 0, Production fallback 없음 |
| 조회 범위 | 목록 최근 50건, 유형별 현황 최대 300건; client collection/environment 선택 불가 |
| QA 목록 상태변경 | 응답의 서버 지정 `sourceEnvironment=qa`를 확인해 기존 Production 상태 writer 호출 전 차단; 이번 작업은 조회 격리이며 QA 상태 writer 전환은 포함하지 않음 |

전체 read-path 감사에서 별도 경로도 확인했다. `dashboardSummary.js`의 최근 제출/집계, `cprTrainingStatus.js`의 기존 제출 대응 조회, `api/firebase/admin/user-account.js`의 사용자 삭제 사전 count는 기존 Production collection을 사용한다. `staffSubmissions.js`의 기존 client 제출 writer와 감염병 탭의 `student_health_submissions` 경로도 이번 교직원 목록 수정 범위 밖이다. 따라서 이번 결과를 포털 전체 QA 데이터 격리 완료로 해석하지 않는다. QA 실화면 검수는 수정한 교직원 목록/제출현황만 직접 진입하며 대시보드·감염병·사용자 삭제·기존 제출 writer를 실행하지 않는다.

회귀 검증은 QA/Production collection 선택, 미확인 환경·임의 query 거부, 관리자 401/403, 일반/대리등록 모두 조회, ISO timestamp 변환, 두 client loader의 직접 read/fallback 금지와 QA 기록의 Production 상태 write 차단을 포함한다. API function은 기존 12개를 유지하고 main/Production 배포·데이터 변경은 수행하지 않는다.
