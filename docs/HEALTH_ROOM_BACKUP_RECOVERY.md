# 2026학년도 보건실 업무 백업/복구 안내

이 문서는 `2026학년도 보건실 업무` Google Sheet 원본을 보호하기 위한 Apps Script 백업 절차를 정리합니다. 원본 Sheet는 계속 운영 master이며, 백업은 복구 가능성을 확보하기 위한 별도 Drive 복사본입니다.

## 백업 방식

- Apps Script의 `backupHealthRoomSpreadsheetNow()` 함수가 원본 Google Sheet 파일을 Drive 파일 단위로 복사합니다.
- 백업 파일명은 `2026학년도 보건실 업무_BACKUP_YYYY-MM-DD_HHmmss` 형식입니다.
- 값만 복사하지 않고 Google Sheet 파일 전체를 복사하므로 탭, 서식, 수식, 데이터 검증 같은 Sheet 구조 보존에 유리합니다.
- 자동 삭제, 휴지통 이동, 오래된 백업 정리 기능은 이번 구조에 포함하지 않습니다.

## Script Properties

Apps Script 프로젝트 설정에서 다음 Script Properties를 설정합니다. 실제 ID 값은 문서나 코드에 기록하지 않습니다.

| Key | 용도 | 필수 |
| --- | --- | --- |
| `HEALTH_ROOM_SOURCE_SPREADSHEET_ID` | 원본 Google Sheet ID. 누락 시 기존 Apps Script 상수의 원본 ID를 사용합니다. | 권장 |
| `HEALTH_ROOM_BACKUP_FOLDER_ID` | 백업을 저장할 전용 Drive 폴더 ID입니다. | 필수 |
| `HEALTH_ROOM_BACKUP_HOUR` | 자동 백업 trigger를 설치할 시간입니다. `0`부터 `23` 사이 숫자만 허용합니다. | 자동 백업 시 필수 |
| `HEALTH_ROOM_BACKUP_STATUS` | 마지막 백업 성공/실패 상태를 저장합니다. 학생 원문 데이터는 저장하지 않습니다. | 자동 생성 |

## 백업 폴더

- 백업 폴더는 원본 Sheet와 다른 Drive folder여야 합니다.
- 폴더 권한은 보건교사와 보건지원강사 등 최소 인원으로 제한합니다.
- `Anyone with the link`, 도메인 전체 공개, 외부 계정 자동 공유는 사용하지 않습니다.
- 가능하면 `보건실 업무 백업/2026/`처럼 원본과 명확히 구분되는 전용 폴더를 사용합니다.

## 수동 백업

큰 변경 전, 학기 정리 전, Apps Script 배포 전에는 Apps Script 편집기에서 아래 순서로 확인합니다.

1. Script Properties에 `HEALTH_ROOM_BACKUP_FOLDER_ID`가 설정되어 있는지 확인합니다.
2. `backupHealthRoomSpreadsheetDryRun()`을 실행해 원본과 백업 폴더 접근, 백업 파일명, 주요 탭 존재 여부를 확인합니다.
3. dry-run이 성공하면 `backupHealthRoomSpreadsheetNow()`를 실행합니다.
4. 생성된 백업 파일을 열어 주요 탭이 보이는지 확인합니다.
5. 원본 Sheet가 그대로 열리고 휴지통 상태가 아닌지 확인합니다.

## 자동 백업 Trigger

자동 백업은 기존 student-care projection trigger와 별도로 관리합니다.

- 설치: `setupHealthRoomBackupTrigger()`
- 확인: `listHealthRoomBackupTriggers()`
- 제거: `removeHealthRoomBackupTrigger()`
- 실제 실행 handler: `backupHealthRoomSpreadsheetNightly_`

설치 전에 `HEALTH_ROOM_BACKUP_HOUR`를 정해야 합니다. 기존 student-care nightly rebuild가 1시대에 실행되므로, 새벽 3시 또는 4시처럼 겹치지 않는 시간을 권장합니다.

## 복구 절차

원본 Sheet에 문제가 생기면 먼저 자동화로 문제가 확대되지 않게 멈추는 것이 중요합니다.

1. 원본 문제 발생 시점을 확인합니다.
2. 원본 파일을 즉시 삭제하거나 이름을 바꾸지 않습니다.
3. 필요한 경우 관련 Apps Script trigger를 일시 중지합니다.
4. 최신 정상 백업 파일을 찾습니다.
5. 백업 파일을 별도 이름으로 한 번 더 복사해 복구 작업용 사본을 만듭니다.
6. 주요 탭, 수식, 서식, 최근 입력 데이터를 확인합니다.
7. 운영 원본 교체 여부는 보건교사와 보건지원강사가 함께 판단합니다.
8. 운영 source ID를 바꾸는 결정은 별도 변경 작업으로 기록하고 검증합니다.

## 절대 금지

- 원본 Sheet 파일 삭제 또는 휴지통 이동
- 백업 파일 자동 삭제/정리 로직을 검증 없이 추가
- 파일명이나 최근 수정일만 보고 원본을 추정
- 백업 폴더를 링크 공개로 설정
- 복구 검증 전 운영 source ID 교체
- 학생 정보 원문을 로그, Script Properties, 문서에 기록

## 장애 영향

백업 실패는 원본 제출, Dashboard, student-care projection을 막지 않도록 백업 함수 내부에서 독립적으로 처리합니다. 백업은 원본 Sheet의 복구 수단을 추가하는 보조 자동화이며, 원본 Sheet 자체의 master 역할을 대체하지 않습니다.
