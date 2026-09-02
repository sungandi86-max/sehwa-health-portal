# Firebase v2 content seed

Firestore Console에서 `faqs`, `checkups`, `education_resources` 컬렉션에 테스트 데이터를 수동 생성할 때 사용하는 샘플입니다.
기존 Google Sheet 데이터는 이 단계에서 자동 이전하지 않습니다.

`createdAt`, `updatedAt`은 Firestore Console에서 현재 timestamp 값으로 입력하거나, 이후 관리 UI에서 자동 저장하도록 확장할 예정입니다.

## Rules 반영

`firestore.rules`의 `faqs`, `checkups`, `education_resources` 규칙을 Firebase Console에 반영해야 v2 화면에서 데이터를 읽을 수 있습니다.
이번 단계에서는 Codex가 Rules를 자동 배포하지 않습니다.

## FAQ

컬렉션: `faqs`

문서 ID 예: `faq-health-room-usage`

```js
{
  question: "보건실은 언제 이용할 수 있나요?",
  answer: "수업 중 이용 시 담당 교사의 허락을 받고 방문해 주세요.",
  category: "보건실 이용",
  keywords: ["보건실", "이용"],
  enabled: true,
  order: 1,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

숨김 확인용 문서:

```js
{
  question: "숨김 테스트 FAQ",
  answer: "enabled false 테스트용 문서입니다.",
  category: "테스트",
  keywords: [],
  enabled: false,
  order: 99,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

## 검진·검사 안내

컬렉션: `checkups`

문서 ID 예: `checkup-staff-tb`

```js
{
  title: "교직원 결핵검진 안내",
  description: "교직원 결핵검진 대상과 제출 방법을 확인해 주세요.",
  target: "전 교직원",
  status: "안내 중",
  operatingStatus: null,
  details: ["검진 대상 확인", "확인증 제출 방법 안내"],
  enabled: true,
  startAt: null,
  endAt: null,
  linkUrl: null,
  linkLabel: null,
  displayMode: "link",
  imageUrl: null,
  downloadUrl: null,
  order: 1,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

기간 테스트 문서:

```js
{
  title: "심폐소생술 이수증 제출 안내",
  description: "이수증 제출 기간 안에 자료를 등록해 주세요.",
  target: "교직원",
  status: "접수 중",
  details: [],
  enabled: true,
  startAt: Timestamp("2026-09-01T00:00:00+09:00"),
  endAt: Timestamp("2026-12-31T23:59:59+09:00"),
  linkUrl: null,
  linkLabel: null,
  order: 2,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

## 교육자료

컬렉션: `education_resources`

문서 ID 예: `education-cpr-resource`

```js
{
  title: "심폐소생술 교육자료",
  description: "교직원 심폐소생술 교육에 활용할 수 있는 자료입니다.",
  category: "응급처치",
  target: "교직원",
  duration: "자율 확인",
  schedule: "상시",
  confirmation: "자료 확인 후 필요 시 보건실로 문의",
  status: "자료",
  enabled: true,
  linkUrl: "https://example.com",
  linkLabel: "자료 열기",
  order: 1,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

숨김 확인용 문서:

```js
{
  title: "숨김 테스트 교육자료",
  description: "enabled false 테스트용 문서입니다.",
  category: "테스트",
  target: "보건실",
  enabled: false,
  linkUrl: null,
  linkLabel: null,
  order: 99,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```
