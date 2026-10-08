# 검진·검사 안내 CMS 이관 계약

운영 원본은 `앱_검진검사!A1:T5`이다. 1행은 헤더, 2~5행은 모두 사용 중인 안내 콘텐츠다. 이관 전까지 Sheet를 유지하며, `portal_content_qa`와 `portal_content_production`의 기존 24개 콘텐츠는 수정하지 않는다.

| Sheet 열 | CMS 저장 위치 | 공개 응답·동작 |
|---|---|---|
| A 사용여부 | `active`, 초기 `visible` | 공개 여부의 기본값 |
| B 제목 | `title` | `title` |
| C 설명 | `content` | `description` |
| D 대상 | `fields.target` | `target` |
| E 세부항목 | `fields.details` | 줄 단위 `details`; 첫 날짜 포함 줄에서 `schedule` 도출 |
| F 버튼명 | `fields.buttonLabel` | `buttonText` |
| G 링크 | HTTPS/내부 경로이면 `link`, 준비 문구면 `fields.linkText` | 기존 `url` 텍스트 유지; 준비 문구는 클릭 불가 |
| H 상태 | `fields.status` | `status` |
| I 정렬순서 | `sortOrder` | 기존 1~4 순서 |
| J 표시방식 | `fields.displayMode` | `link` / `pending` / `image` |
| K 운영표상태 | `fields.operationStatus` | `operatingStatus` |
| L 이미지URL | `fields.imageUrl` | 이미지 모달 URL |
| M 다운로드URL | `fields.downloadUrl` | 원본 다운로드 URL |
| N 보조버튼명 | `fields.secondaryButtonLabel` | `secondaryText` |
| O 보조동작 | `fields.secondaryAction` | 현재 `notice`만 지원 |
| P 복사문구 | `fields.copyText` | 보조 안내 문구 |
| Q 업데이트안내 | `fields.updateNotice` | 준비 중 안내 |
| R/S 노출시작일/종료일 | `startAt` / `endAt` | 공개 기간 |
| T 노출상태 | `legacy.sourceExposureState` | 현재 reader는 사용하지 않음; 초기 공개 상태는 A열 기준 |

이관 metadata는 기존 CMS 방식인 `legacy.sheetName`, `legacy.sourceRow`, `legacy.fingerprint`를 사용한다. 문서 ID는 유형과 제목으로 결정하며 원본 행을 덮어쓰지 않고 충돌을 보고한다.

| 행 | 제목 | 현재 공개 출력과 CMS 결과에서 지킬 동작 |
|---:|---|---|
| 2 | 1학년 건강검진 안내 | 정렬 1, 실제 Drive 안내 링크, 운영표 상태 `확정` |
| 3 | 2·3학년 결핵검진 안내 | 정렬 2, `pending`, 운영표 업데이트 예정 안내; 이미지 URL이 생기기 전까지 준비 중 모달 |
| 4 | 2·3학년 소변검사 안내 | 정렬 3, `pending`, `notice` 보조 동작과 담임 협조 문구 |
| 5 | 교직원 결핵검진 안내 | 정렬 4, 교직원 대상 안내; 제출/신청 상태 자체는 관리하지 않음 |

`/checkup`의 단체검진 신청 카드는 `앱_제출센터`에서 만든 `tbConfig`를 계속 사용한다. `제출항목관리`와 제출 기록 경로는 변경하지 않는다. 별도 비분리 `checkups` 컬렉션의 기존 4문서는 삭제하지 않지만, 최종 조회 경로에서는 사용하지 않는다.

검증 순서: QA dry-run → QA 4건 생성/읽기/재실행 skip → QA 화면 → Production dry-run → Production 4건 생성/읽기/재실행 skip. Cloud Shell의 Firestore 인증이 Sheets 읽기 범위를 포함하지 않으면, 별도 읽기 전용 Sheet 조회로 확인한 A1:T5 값을 `--source-base64`로 전달한다. 운영 Apps Script 배포와 원본 Sheet 삭제는 별도 단계다.

2026-10-09 진행 상태: 실제 Sheet A1:T5와 운영 공개 응답을 비교해 4/4 필드 parity를 확인했다. Firestore API 사전 조회에서 QA는 기존 26문서(설정 1, 기존 콘텐츠 24, 비활성 QA 테스트 1), Production은 기존 25문서(설정 1, 기존 콘텐츠 24)였고 양쪽 모두 `checkup` 문서가 없었다. QA와 Production에 각각 검진 4문서와 설정 `counts.checkup=4`를 원자적으로 기록했다. 최종 QA 30문서·Production 29문서이며 각 환경의 4/4 검진 필드와 중복 0을 read-back으로 확인했다. 재실행 dry-run은 QA `create 0 / update 0 / skip 30 / conflict 0`, Production `create 0 / update 0 / skip 29 / conflict 0`이다. 신규 코드의 인증된 QA 화면 검증, 운영 Apps Script 배포, 원본 Sheet 삭제는 아직 수행하지 않았다.
