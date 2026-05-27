# 세화여고 온라인 보건실

교직원 보건업무 안내 · 제출 · 자료 확인 포털 (Vite + React + Tailwind CSS)

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

## 📋 제출·업로드 센터 Apps Script 설정

### 1단계: Apps Script 코드 적용

1. [script.google.com](https://script.google.com) 에서 기존 프로젝트 열기
2. `apps-script/Code.gs` 파일 내용을 기존 코드에 **추가** (doGet은 유지, doPost 추가)
3. **배포 → 새 배포 → 웹 앱** 선택
4. 설정:
   - 실행 계정: **나**
   - 액세스 권한: **모든 사용자** (익명 포함)
5. **배포** 버튼 클릭 → 새 URL 복사

### 2단계: React 앱 URL 업데이트

`src/components/SubmitModal.jsx` 파일 상단:

```js
const SCRIPT_URL = "https://script.google.com/macros/s/여기에_새_배포_URL/exec";
```

> ⚠️ **주의**: `doPost`를 추가하면 반드시 **새 버전으로 재배포**해야 합니다.
> 기존 배포 URL을 수정 배포하면 변경사항이 반영됩니다.

### 3단계: Drive 폴더 권한 확인

각 폴더 ID에 해당하는 Google Drive 폴더가 Apps Script 실행 계정에서 **편집 가능** 상태인지 확인하세요.

| 제출 종류 | 폴더 ID |
|---|---|
| 심폐소생술 이수증 | `19foLN446v5ggGN6hxLBuH8tNAQuSXgtM` |
| 결핵검진 확인증 | `1MfxNVL1muROzpi1ZbV7WDWr4SKMU7ghm` |
| 기타 보건자료 | `1T2yMxeKmab1SDqdVCRgdxpHMx3Fu2EO6` |

---

## 📊 자동 생성 시트

doPost가 처음 호출될 때 아래 시트가 자동 생성됩니다:

| 시트명 | 열 구성 |
|---|---|
| 응답_심폐소생술이수증 | 제출일시 · 성명 · 소속/부서 · 교직원구분 · 이수일자 · 이수기관 · 파일명 · 파일링크 |
| 응답_결핵검진확인증 | 제출일시 · 성명 · 소속/부서 · 교직원구분 · 검진일자 · 제출자료유형 · 파일명 · 파일링크 |
| 응답_채용검진확인요청 | 제출일시 · 성명 · 소속/부서 · 교직원구분 · 행정실제출여부 · 제출시기 · 비고 |
| 응답_기타보건자료 | 제출일시 · 성명 · 소속/부서 · 교직원구분 · 비고 · 파일명 · 파일링크 |

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

## 보건실 소재 확인 테스트 비밀번호

Apps Script의 `getHealthRoomLocation` 기능은 비밀번호 필수 구조입니다. 비밀번호 설정값이 비어 있으면 제한 화면을 열지 않고 “보건실 소재 확인 기능의 비밀번호가 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.” 메시지를 반환합니다.

Apps Script 편집기에서 `setupHealthRoomStatusFeature` 함수를 직접 실행하면 필요한 설정 시트가 생성됩니다. 보건실 소재 확인 API가 호출될 때도 같은 초기화가 먼저 실행됩니다.

보건실 소재 확인 화면은 `src/config.js`의 `GAS_BASE_URL`로 Apps Script 웹앱을 호출합니다. Vercel에서는 `VITE_GAS_BASE_URL` 환경변수에 최신 `/exec` 배포 URL을 넣으면 코드의 기본 URL보다 우선 적용됩니다.

`앱_입실현황공유설정` 시트가 없으면 자동 생성되며 기본 테스트값은 다음과 같습니다.

| 항목 | 값 |
|---|---|
| 기능사용 | TRUE |
| 교직원비밀번호 | health2026 |
| 관리자비밀번호 | admin2026 |
| 이름표시방식 | 마스킹 |
| 교과교사표시범위 | 오늘 |
| 담임표시범위 | 오늘+최근7일 |
| 증상표시여부 | FALSE |
| 처치표시여부 | FALSE |
| 결과세부표시여부 | FALSE |

`앱_담임권한` 시트가 없으면 자동 생성되며 기본 테스트값은 다음과 같습니다.

| 학년 | 반 | 비밀번호 |
|---|---|---|
| 1 | 1 | 101-health |
| 1 | 2 | 102-health |
| 2 | 1 | 201-health |
| 3 | 1 | 301-health |

`앱_입실현황접속로그` 시트가 없으면 다음 헤더로 자동 생성됩니다.

| 접속일시 | 접근유형 | 학년 | 반 | 성공여부 | 메시지 |
|---|---|---|---|---|---|
