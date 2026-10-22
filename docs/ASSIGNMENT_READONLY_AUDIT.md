# 운영 assignment 읽기 전용 호환성 검사

## 범위와 제한

`scripts/auditAssignmentsReadOnly.mjs`는 앱 초기화·가입·승인·migration 코드를 불러오지 않는 독립 검사기다.
사용자가 별도로 승인하기 전 운영에서는 실행하지 않는다. Cloud 작업에서는 합성 loopback Emulator로만 검증한다.
코드는 get 쿼리만 사용한다. Owner 인증의 실제 쓰기 권한을 제거하거나 제한하는 도구는 아니다.
가능하면 기존 읽기 전용 주체(datastore.viewer)를 사용한다. 신규 서비스 계정·키 생성은 필요하지 않다.
Cloud Shell 기존 ADC가 해당 프로젝트의 Firestore get/list 권한을 가져야 한다. Console 로그인만으로 ADC 사용 가능을 보장하지 않는다.
ADC가 없거나 권한이 없으면 실패로 중단한다. 키 파일·환경변수를 새로 만들거나 앱 credential을 가져오지 않는다.

- 대상: `sehwa-health-portal-v2`, `(default)`, 2026학년도 2학기 고정.
- `users`: 문서 ID만 projection으로 읽는다. 이름·이메일·본문을 요청하지 않는다.
- `user_assignments`: uid, schoolYear, semester, active, roles, staffId, grade, classNo, assignmentSource, qaOnly만 읽는다.
- 문서 ID·필수 필드 값은 메모리에서만 비교하고 출력·파일 저장하지 않는다.
- 전체 users/assignments를 200건씩 순차 조회한다. 과거 학기도 읽기 비용이 발생한다.
- 학년도 where 조건은 잘못된 자료형·누락 문서를 숨기므로 사용하지 않는다.
- 현재 경로 접미사 `_2026_2` 또는 저장 학년도/학기가 현재 값인 문서가 검사 대상이다. 다른 정상 과거 문서는 제외한다.
- 스트림 도중 오류면 부분 집계를 폐기하고 `{ "scanCompleted": 0, "scanFailed": 1 }`만 출력한다.
- SDK 로그·stderr도 억제하므로 실패 진단에 원본 SDK 오류를 출력하지 않는다.
- 전체 일관성 snapshot이 아니다. 승인/권한 변경이 없는 시간에 실행한다. 검사 중 변경이 의심되면 다시 승인받아 재검사한다.
- Auth 사용자 목록, 교직원 명단, 제출/학생/교육 원장, GAS/Drive/Sheets는 읽지 않는다.
- 프로필 없는 Auth 계정은 발견할 수 없다. canonical staffId의 실제 명단 매칭·재직 상태·로그인 성공은 입증하지 않는다.

## 실행 (사용자 승인 후, 승인된 Cloud Shell checkout에서만)

Node 22와 저장소 lockfile 기준 의존성을 준비한다. node_modules가 없다면 소스를 검토한 뒤
`npm ci --ignore-scripts`로 설치할 수 있다. 앱을 시작하지 않는다. 프로젝트 환경변수는 변경하지 않는다.

```bash
node --version
# 예상 HEAD 9deec73 이후 이 검사 파일이 전달된 검토된 checkout인지 확인
# 기존 ADC와 명시한 프로젝트 확인 후에만 아래 명령 실행
node scripts/auditAssignmentsReadOnly.mjs \
  --project sehwa-health-portal-v2 \
  --confirm-read-only sehwa-health-portal-v2:2026:2
```

추가 인자·다른 프로젝트·잘못된 확인 문자열은 ADC/SDK 초기화 전에 거부한다.
운영 실행에 FIRESTORE_EMULATOR_HOST가 있거나 GCLOUD_PROJECT/GOOGLE_CLOUD_PROJECT가 다른 프로젝트이면 중단한다.
현재 환경을 자동 변경하지 않는다. 앱 env·서비스 계정 설정을 source하지 않는다.
사용자 토큰/키를 명령 인자로 전달하지 않는다. 터미널 tracing과 디버그 로깅을 사용하지 않는다.
JSON 집계만 보고하며 UID·문서 출력, 결과 원본 export, 스크린샷으로 문서 공유를 하지 않는다.

## 집계 해석

- scanCompleted=1, scanFailed=0: 두 컬렉션 조회 완료. 실패 시 부분 결과는 없다.
- currentChecked = compatible + incompatible + pendingRegistration.
- compatible: 공통 구조 검사를 통과. activeCompatible는 그중 active=true다.
- incompatible: 한 개 이상의 오류가 있는 문서. 오류 유형은 중복 집계되므로 합계가 문서 수와 다르다.
- uidOrPathError, schoolYearError, semesterError, activeTypeError, rolesError, staffIdError,
  homeroomFieldsError, qaOnlyInProduction: 오류 건수. 문제 발견 시 자동 수정하지 않는다.
- 미지원 role이 섞인 배열은 보수적으로 rolesError 처리한다. 실제 런타임 일부 경로는 지원 role 하나가 있으면 허용할 수 있다.
- homeroomFieldsError는 Rules의 숫자 조건을 검사한다. 실제 학급 존재·범위까지 확인하지 않는다.
- active=false 문서를 inactive로 집계하며 비활성 자체는 오류가 아니다.
- google_signup_pending 출처의 빈/누락 역할은 공통 identity/term/active 자료형이 유효하면 pendingRegistration으로 분류한다.
  활성 승인으로 해석하지 않는다. 이 그룹은 staffId 등 승인 후 필드를 검사하지 않는다.
- missingCurrentAssignment: users ID 기준 현재 경로가 없는 수. 가입 대기일 수 있으므로 자동 오류/수정 대상이 아니다.
- assignmentWithoutUser: 현재 검사 문서의 저장 UID에 대응하는 users ID가 없는 수. 별도 확인 대상이다.
- staffIdWhitespace: 앞뒤 공백으로 정규화가 달라질 가능성. 자동 정규화하지 않는다.
- trainingAdminOnly: 전역 staff/admin 권한으로 확대되지 않는 역할 조합. 의도된 업무 범위인지 확인한다.
- historicalSkipped: 현재 검사 대상이 아닌 과거 문서 수.
- 종료 코드 0: 구조 오류 없이 완료(연결 누락·공백 등 경고가 없다는 뜻은 아니다).
- 종료 코드 2: 완료됐으나 부적합 문서 존재. 종료 코드 1: 확인/인증/조회 실패, 결과 불완전.

권한/구조 문제를 고치기 위해 이 검사기에 쓰기를 추가하지 않는다. 별도 승인·백업·복구 계획이 필요하다.
Rules·서버·클라이언트의 조건 차이와 실제 명단 연결은 별도 점검 대상이다.

## 로컬 검증

```bash
node --test scripts/auditAssignmentsReadOnly.test.js
FIRESTORE_EMULATOR_JAR=/path/to/verified/cloud-firestore-emulator-v1.19.8.jar npm run test:rules
```

기존 Emulator runner가 검증된 공식 JAR, 합성 demo 프로젝트, loopback, credential 없는 자식 환경과 정리를 담당한다.
검사기 테스트만 합성 fixture를 생성하며 운영 검사기에는 생성/수정/삭제 API가 없다.
222번째 테스트는 실제 Emulator에 200건 초과 자료·오류 유형·연결 누락을 넣고 검사 전후 모든 fixture가 같은지 확인한다.
CLI는 합성 demo 프로젝트와 loopback 주소를 동시에 명시한 테스트 모드만 추가로 허용한다.

## 활성 부적합 오류 조합별 집계

기존 집계와 판정·조회 필드·대상 프로젝트·실행 확인 인자는 그대로 유지한다.
새 `activeIncompatible`는 `active === true`이면서 부적합인 문서 수다.
관찰된 조합에 대해서만 다음 형식의 평탄한 숫자 집계를 추가한다.

```text
activeIssues__오류1__오류2__역할분류__프로필분류: 건수
```

- 오류 이름은 기존 고정 오류 항목이며 검사 순서대로 나열한다. 문서별 오류 조합이 정확히 같은 경우에만 합산한다.
- 역할분류는 `rolesMalformed`(배열 아님), `noSupportedRole`(지원 역할 없음),
  `supportedRolePresent`(지원 역할 하나 이상) 중 하나다. 실제 역할 문자열은 출력하지 않는다.
- 프로필분류는 저장 UID에 대응하는 users 문서 ID가 있는지에 따라 `profilePresent`/`profileAbsent` 중 하나다.
- 모든 activeIssues 조합 건수의 합은 activeIncompatible와 같아야 한다. 문서 한 건은 한 조합에만 들어간다.
  기존 rolesError 등 개별 오류 집계는 중복 집계 그대로이며 이 합산 규칙의 대상이 아니다.
- 비활성·가입대기·적합 문서는 activeIssues 집계에 들어가지 않는다.

예: `activeIssues__rolesError__qaOnlyInProduction__noSupportedRole__profileAbsent`는
역할 오류와 QA 표시가 함께 있고 지원 역할과 연결 프로필이 없는 활성 부적합 문서의 건수다.
실제 UID·staffId·assignmentSource·미지원 역할 값이 JSON 키에 들어가는 일은 없다.
출력은 고정 분류 이름과 숫자만이며 오류가 없으면 해당 조합 키는 생기지 않는다.

### 배포 판단에 사용할 범위

- `qaOnlyInProduction` 조합은 qaOnly=true 또는 qa_ 역할 표시가 있는 자료다.
  QA/테스트 용도의 근거지만 소유자나 실제 사용 여부를 증명하지는 않는다.
- `profileAbsent`는 프로필 연결 부재이며 Firebase Auth 계정 부재를 뜻하지 않는다.
- QA 표시가 없고 profilePresent여도 실제 재직 교직원임을 증명하지 않는다. 명단·Auth는 추가 조회하지 않는다.
- `rolesError` + `supportedRolePresent`는 보수적 검사 오류일 수 있다.
  클라이언트/Rules 일부는 지원 역할이 하나라도 있으면 통과하지만, 전역 staff/admin 허용 여부는 역할 종류별로 다르다.
  이 분류를 '로그인 가능', '관리자', '정상 교직원'으로 해석하지 않는다.
- 활성 실사용 계정의 staffId/역할 문제와 QA 표시 혼입은 내부 확인 대상으로 삼되, 검사 결과만으로 자동 수정·삭제·권한 부여하지 않는다.
- 기존 실행 명령으로 다시 읽으려면 사용자가 별도로 승인해야 한다. 이번 개발·push는 운영 검사 실행 승인이 아니다.

### 검증 자산

단위 테스트는 잘못된 역할 원문·staffId·가입 출처가 키나 값으로 노출되지 않으며 중복 없는 합계가 나오는지 확인한다.
Emulator는 기존 200건 초과·CLI·문서 불변 테스트를 유지하고, 보고된 43 users / 49 assignments / 부적합 6 / 활성 부적합 4라는
총계를 만드는 **새 합성 fixture**로 조합별 집계를 추가 검증한다. 이는 운영 4건의 실제 분포를 재현하거나 추정한 결과가 아니다.

이번 로컬 검증: 관련 단위 테스트 3/3, 전체 일반 테스트 657/657, Firestore Emulator 223/223 PASS.
운영 Firestore 검사·조회는 수행하지 않았으며, 생성/수정/삭제는 합성 Emulator fixture 준비에만 사용했다.
