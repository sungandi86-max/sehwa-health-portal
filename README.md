# 세화여고 온라인 보건실

교직원 보건업무 안내 · 제출 · 자료 확인 포털 (Vite + React + Tailwind CSS)

---

## UI/디자인 작업 전 필수 문서

디자인 리팩터링 전에는 먼저 아래 문서를 확인합니다.

- [UI/메뉴/권한 변경 불변 원칙](docs/PORTAL_UI_GOVERNANCE.md)
- [BOGUNON 디자인 시스템](DESIGN.md)

디자인 작업은 spacing, typography, radius, color, density 같은 표현을 정리하는 작업이며, 메뉴 의미, route, 권한, 데이터 범위, API/query, legacy fallback을 임의로 바꾸지 않습니다.

---

## 🚀 로컬 실행

```bash
npm install
npm run dev
```

## ☁️ Vercel 배포

```bash
npm run build
# GitHub push → Vercel 자동 연결 배포
# 또는: npx vercel deploy
```

---

## Firebase v2 개발 메모

Firebase v2 전환 작업은 `firebase-v2` 브랜치에서 진행합니다. 운영 중인 Google Sheets + Apps Script 구조는 유지하며, Firebase는 우선 로그인과 학년도/학기별 권한 분리 기반만 준비합니다.

- 사용자 기본 정보: `users/{uid}`
- 학년도/학기별 권한: `user_assignments/{uid}_{schoolYear}_{semester}`
- 현재 테스트 기준: `2026`학년도 `1`학기
- 최초 `health_teacher` assignment는 Firebase Console에서 수동 생성합니다.
- 로그인만으로 `staff`, `admin`, `health_teacher` 역할을 자동 부여하지 않습니다.
- 향후 학교 Google Workspace 도메인 제한을 추가할 수 있습니다.

개발용 확인 경로:

```text
/firebase-test
```

---

## 제출·업로드 센터 저장 경계

브라우저는 같은 origin의 `/api/submit`에 canonical 제출 유형만 보냅니다. Apps Script URL은 서버의 `GAS_URL` 또는 `VITE_GAS_BASE_URL`에서만 읽으며, 클라이언트의 Sheet 이름이나 Drive 폴더 ID는 목적지로 사용하지 않습니다. 서버 workflow 정책과 운영 전 검증 항목은 [Submission workflow Phase 1](docs/SUBMISSION_WORKFLOW_PHASE1.md)을 참고하세요.

Apps Script 운영본을 갱신할 때는 현재 web app deployment ID/URL을 유지하고, 코드와 배포 버전의 차이를 검증해야 합니다. 공개 웹 앱 URL 자체의 직접 호출 방지는 별도 보안 과제이며, 이 브랜치만으로 운영 배포하지 않습니다.

---

## 제출 응답 시트

아래 응답 시트는 제출 전에 이미 존재해야 합니다. Apps Script는 없는 시트를 자동 생성하지 않고 제출을 거부합니다.

| 시트명 | 열 구성 |
|---|---|
| 응답_심폐소생술이수증 | 제출일시 · 성명 · 소속/부서 · 교직원구분 · 이수일자 · 이수기관 · 파일명 · 파일링크 |
| 응답_결핵검진확인증 | 제출일시 · 성명 · 소속/부서 · 교직원구분 · 검진일자 · 제출자료유형 · 파일명 · 파일링크 |
| 응답_교직원결핵검진유형선택 | 제출일시 · 성명 · 소속/부서 · 검진유형 · 비고 |
| 제출기록 | 학생 결핵검진 진료회신 파일 접수 기록 |

인바디 측정 신청의 신규 운영 원장은 `inbody_requests_production` Firestore 컬렉션입니다. 기존 `응답_인바디측정신청` 탭은 삭제 전 검증을 위해 유지하지만 신규 신청을 기록하지 않습니다.

---

## 📁 프로젝트 구조

```
src/
├── App.jsx                       # API fetch + 데이터 분배
├── data/fallbackData.js          # 오프라인 샘플 데이터
└── components/
    ├── ui.jsx                    # 공통 UI (Badge, AppCard 등)
    ├── UploadCenter.jsx          # 제출·업로드 센터 (모달 연결)
    ├── SubmitModal.jsx           # 앱 내부 제출 모달 (핵심)
    └── ...기타 섹션 컴포넌트
apps-script/
└── Code.gs                       # Apps Script 백엔드 코드
```

---

## 학생 건강관리 접근 방식

학생 건강관리 기능은 Firebase 로그인과 현재 학기 `user_assignments` 권한을 기준으로 접근합니다. 일반 교직원은 보건실 소재 확인, 담임교사는 자기 학급 월별 입실현황과 담임 확인, 보건교사와 관리자는 학급별 조회와 관리자 통계를 사용할 수 있습니다.

브라우저에서 보건실 소재 확인 비밀번호, 담임 비밀번호, 관리자 조회 비밀번호를 입력하는 이전 방식은 사용하지 않습니다. `/api/health-room-status`는 Firebase ID token과 현재 assignment를 확인한 뒤 Apps Script의 assignment 기반 action으로만 요청을 전달합니다.
