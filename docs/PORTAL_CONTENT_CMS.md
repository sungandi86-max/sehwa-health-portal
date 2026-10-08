# 포털 콘텐츠 CMS 전환

대상은 `앱_공지`, `앱_FAQ`, `앱_건강정보/이벤트`, `앱_교육자료` 네 탭이다. 다른 Sheet와 기존 Firebase v2 콘텐츠 컬렉션은 변경하지 않는다.

## 운영 데이터 감사 (2026-10-09)

| 유형 | 기존 탭 | 데이터 행 | 현재 공개 건수 | 주요 필드 |
| --- | --- | ---: | ---: | --- |
| notice | 앱_공지 | 3 | 2 | 제목, 제목 2줄, 일시, 대상, 내용, 이동안내, 상태, 배지색, 정렬순서, 노출기간 |
| faq | 앱_FAQ | 9 | 8 | 질문, 답변, 정렬순서 |
| health_event | 앱_건강정보/이벤트 | 3 | 3 | 제목, 카테고리, 설명, 버튼명, 링크, 정렬순서 |
| education | 앱_교육자료 | 9 | 2 | 교육명, 대상, 소요시간, 일정, 설명, 확인방법, 버튼명, 링크, 상태, 정렬순서 |

운영 워크북은 21개 탭이다. 4개 대상 탭을 참조하는 수식·named range·data validation은 0건이며 `#REF!`도 0건이다. 교육자료 5~10행의 뒤쪽 열은 비어 있어 레거시 기본값을 사용한다. `노출상태`는 별도 관리자 필드로 이관하지 않고 사용여부·노출기간으로 계산한다.

실제 Sheet 표시값 24행을 이관 모델에 통과시킨 읽기 전용 dry-run은 헤더·중복·필수값 충돌 0건, 예상 문서 25건(설정 1 + 콘텐츠 24)이다. 현재 공개 건수도 기존 API와 일치한다. Cloud Shell의 Firestore API 직접 조회에서 QA·Production 컬렉션은 각각 0건이었다. 충돌 0건 확인 후 QA 컬렉션에만 25문서를 생성했고, 전 필드 read-back parity 및 유형별 3/9/3/9건을 확인했다. 재조회는 `skip=25`, 충돌 0건이다. Production 컬렉션은 아직 0건이며 관리자·공개 화면 QA 전까지 이관하지 않는다.

## Firestore 계약

`portal_content_production`과 `portal_content_qa` 컬렉션에 공통 `item` 문서를 저장한다. `_config` 문서의 `migrationComplete=true`가 없으면 공개 API도 fail-closed 한다. 다른 Preview나 로컬에서는 컬렉션 접근을 거부한다. 항목에는 `type`, `title`, `content`, `category`, `link`, `attachment`, `fields`, `active`, `visible`, `startAt`, `endAt`, `sortOrder`, 감사 시각·행위자, 원본 탭·행·fingerprint를 보관한다. 공개 API에는 유형별 기존 화면 필드만 반환한다. 관리자 경로 `/admin/content`는 서버에서 `health_teacher/admin` 역할을 재검증한다. 삭제 대신 비활성화한다.

## 이관 순서와 배포 차단

`scripts/migratePortalContentCms.mjs --qa` 또는 `--production`은 읽기 전용 dry-run이다. QA 워크북에는 대상 CMS 탭이 없으므로 두 모드 모두 운영 워크북의 네 탭을 읽기 전용 원본으로 사용한다. `--qa`의 쓰기 대상은 `portal_content_qa`뿐이며, 운영 Sheet는 수정하지 않는다. 실제 이관은 해당 환경 플래그에 `--apply --confirm-24-content-rows`를 함께 지정해야 한다. 실행 전 서비스 계정 인증 경로를 확인한다. 네 탭 24행, 충돌 0건, 기존 CMS 문서 0건일 때만 apply한다. 이관 후 공개 유형별 read-back parity를 확인한다.

실제 apply는 설정 문서를 먼저 `migrationComplete=false`로 만들어 읽기를 차단하고, 24개 항목의 read-back parity가 통과한 뒤에만 `true`로 전환한다. 비활성 레거시 행의 비표준 링크 텍스트는 감사용으로 보존하되, 안전한 HTTPS/포털 내부 링크로 수정하기 전에는 다시 노출할 수 없다.

Production 이관 및 코드·Apps Script 배포 전에는 기존 탭을 삭제하지 않는다. 코드에서 Sheet reader를 제거해도 기존 운영 Apps Script v90은 별도 갱신 전까지 레거시 reader를 계속 실행한다. **현재 Production Vercel 코드는 Apps Script의 콘텐츠 응답에 의존하므로, 새 Vercel 코드보다 먼저 Apps Script reader를 제거해 배포하면 콘텐츠가 일시적으로 비어 보일 수 있다.** Firestore 이관과 QA를 끝낸 뒤에도 Apps Script 운영 배포는 Vercel 코드 전환과 순서를 맞춰야 한다. 관리자 CRUD QA, 공개 4화면·홈 회귀, 배포본 parity가 모두 통과한 후에만 각 탭 삭제를 재검토한다. 이 단계에서는 Production env·배포·Sheet를 변경하지 않았다.
