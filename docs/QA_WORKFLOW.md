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
