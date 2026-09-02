# Firebase v2 announcements seed

Firestore Console에서 `announcements` 컬렉션에 테스트 공지를 수동으로 생성할 때 사용하는 샘플입니다.
기존 Google Sheet `앱_공지` 데이터는 이 단계에서 자동 이전하지 않습니다.

## 필드 구조

```js
{
  title: string,
  description: string,
  target: string | null,
  enabled: boolean,
  startAt: Timestamp | null,
  endAt: Timestamp | null,
  linkUrl: string | null,
  linkLabel: string | null,
  order: number,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

`노출상태`는 저장하지 않습니다. 화면에서 `enabled`, `startAt`, `endAt`를 기준으로 계산합니다.

## Rules 반영

`firestore.rules`의 `announcements` 규칙을 Firebase Console에 반영해야 `/firebase-dashboard`에서 공지를 읽을 수 있습니다.
이번 단계에서는 Codex가 Rules를 자동 배포하지 않습니다.

## 샘플 1: 항상 표시

문서 ID 예: `notice-tb-submit`

```js
{
  title: "결핵검진 확인증 제출 안내",
  description: "교직원 결핵검진 확인증 제출 방법을 확인해 주세요.",
  target: "교직원",
  enabled: true,
  startAt: null,
  endAt: null,
  linkUrl: null,
  linkLabel: null,
  order: 10,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp()
}
```

## 샘플 2: 기간 내 표시

문서 ID 예: `notice-cpr-certificate`

```js
{
  title: "심폐소생술 이수증 제출",
  description: "이수증 제출 기간 안에 자료를 등록해 주세요.",
  target: "교직원",
  enabled: true,
  startAt: Timestamp("2026-09-01T00:00:00+09:00"),
  endAt: Timestamp("2026-12-31T23:59:59+09:00"),
  linkUrl: null,
  linkLabel: null,
  order: 20,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp()
}
```

## 샘플 3: 숨김 확인

문서 ID 예: `notice-hidden-test`

```js
{
  title: "숨김 테스트 공지",
  description: "enabled false 테스트용 문서입니다.",
  target: "보건실",
  enabled: false,
  startAt: null,
  endAt: null,
  linkUrl: null,
  linkLabel: null,
  order: 30,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp()
}
```
