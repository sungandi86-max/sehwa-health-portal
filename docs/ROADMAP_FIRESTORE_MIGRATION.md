# 업무 로드맵 Firestore 전환 (Step 7)

## 원본 감사 (2026-10-08)

- 운영 workbook 탭은 22개이며 `앱_업무로드맵`은 숨김 상태다. A:X에 24개 헤더와 실데이터 56행(2–57행)이 있다. 빈 체크박스 행 143개는 이관 대상이 아니다.
- 56행은 모두 사용 중이고, 업무분류·업무명·단계 조합은 서로 다르다. 업무는 12개, 분류는 7개다.
- 주요 필드는 사용여부, 업무분류, 업무명, 단계, 지금할일, 열/숨김 메뉴, 안내대상, 메신저 제목/문구, 개인정보 주의, 관련시트·메뉴·도구, 정렬순서다. 원본에는 연도·일정·마감일·담당·완료 상태 열이 없다. 과거 시트 이름을 설명하는 일반 텍스트는 기능 참조로 취급하지 않았다.
- 운영 workbook 전체의 수식 270개, 이름 정의 0개, 데이터 검증 셀 9,463개에서 이 탭을 참조하는 항목은 0개다. 9,463개는 이관 후 전체 grid를 다시 읽은 수치다. 표시된 `#REF!`도 0개다. 탭 삭제 전에는 같은 검사를 다시 해야 한다.

## 저장소와 접근 제어

- Production: `portal_roadmap_production`; 고정 QA Preview: `portal_roadmap_qa`. 그 외 배포 context는 fail-closed다. 새 env는 없다.
- `_config` 문서는 `enabled`, `adminOnly`, `schemaVersion`을 보존한다. 각 `step_...` 문서는 분류·업무·단계·안내/도구/정렬, `status`, `scheduledDate`, `dueDate`, `owner`, `note`, `visible`, `active`, 변경 시각/행위자 UID를 저장한다. 원본 행 번호와 fingerprint를 `legacy`에 보존한다.
- 기존 `adminOnly=true`는 유지한다. 이 상태에서 일반 교직원 GET은 403이며 내용이 반환되지 않는다. 관리자가 화면에서 일반 교직원 조회를 명시적으로 허용하면 그때부터 활성·노출 항목만 GET으로 반환한다. 관리자/보건교사만 숨김·비활성 항목을 조회하고 생성·수정·상태 변경·비활성화/복원 POST를 할 수 있다. 비활성화는 문서를 삭제하지 않는다.
- 관리자 `/admin/roadmap`에서 업무를 편집한다. 기존 Sheet 설정의 `업무로드맵_관리자전용=TRUE`는 그대로 보존하며, 관리자가 화면에서 조회 허용으로 바꾼 경우에만 `/roadmap`이 현재 학기 교직원의 조회 전용 경로로 열린다. 조회 전용 화면은 관리자 편집 UI를 표시하지 않는다. 기존 관리자 보드와 홈/오늘 표시 흐름은 유지한다.

## 이관 결과와 배포 순서

- 이관 전 dry-run: 원본 56행, 기존 Firestore 문서 0, 중복 0, 충돌 0.
- 명시적 이관: 업무 56개와 설정 1개를 Production Firestore에 transaction으로 생성했다. read-back parity=true.
- 이관 후 dry-run: 기존 문서 57개, `alreadyMigrated=true`, 충돌 0, parity=true. 원본 Sheet는 읽기만 했고 수정하지 않았다.
- `scripts/migratePortalRoadmap.mjs`는 기본 dry-run이며 실제 이관은 Production context와 `--apply --confirm-56-roadmap-rows`가 모두 필요하다. 재실행 시 기존 문서를 덮어쓰지 않는다.
- 새 Vercel 코드는 기존 `api/firebase/staff-directory.js`의 `resource=portal-roadmap`을 사용한다. 공개 `api/portal.js`의 무범위/admin 요청은 차단한다. 관리자 대시보드용 GAS 요청은 접수 요약만 읽고 업무 수를 Firestore에서 계산한다.
- 저장소의 `apps-script/Code.gs`에서 `getRoadmap_` 및 관련 읽기/집계를 제거했다. 실제 운영 Apps Script 배포본 교체 여부는 별도로 확인해야 한다.
- **Production 배포 전 QA (2026-10-08):** QA Firestore에 운영 이관본 56개 업무와 설정 1개를 복제한 뒤, 인증된 관리자 화면에서 56건 조회, `[QA]` 업무 생성·수정·상태 변경·비활성화·복원을 확인했다. 테스트 업무 1건은 최종 비활성·비노출 상태로 보존한다. 관리자 홈의 활성 업무 수는 Firestore 기준 12건으로 확인했다. 일반 교직원 403은 자동 권한 테스트로 확인했으며 별도 일반 교직원 라이브 세션은 사용하지 않았다. 관리자 공통 접수 요약 HTTP 500은 변경 전 고정 QA 배포에서도 동일하게 재현되어 로드맵 전환 회귀로 분류하지 않았다. 테스트용 Preview 배포 후 고정 QA alias는 기존 배포로 복원했다.
- **Production 배포 후:** 관리자 조회/편집 권한, 56행 parity, 대시보드·홈·오늘 회귀를 실제 화면에서 확인한다. Apps Script 운영 배포본에 구버전 reader가 남아 있으면 새 `Code.gs`를 배포한다.
- **탭 삭제는 아직 금지:** Production 코드와 Apps Script 양쪽에서 runtime 읽기가 0건이고 수식·이름 정의·데이터 검증·`#REF!` 재검사까지 통과한 다음 별도 승인으로 진행한다.
