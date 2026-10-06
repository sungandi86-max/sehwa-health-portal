# 교직원 교육 전자서명 Gateway

## 역할

- 온라인 보건실 서버가 인증, 대상자 판정, 시간창, 중복 방지, Firestore 잠금, Sheet 기록을 담당한다.
- Apps Script Gateway는 전자서명 PNG의 비공개 저장·조회와 채워진 연수등록부 XLSX의 PDF 변환만 담당한다.
- 브라우저는 Gateway를 직접 호출하지 않는다.

## 설정

Apps Script 프로젝트의 Script Properties:

- `SIGNATURE_FOLDER_ID`: 실행 계정 My Drive의 비공개 전자서명 루트 폴더 ID
- `GATEWAY_SECRET`: 32바이트 이상의 서버 간 HMAC 비밀값

Vercel 서버 환경변수:

- `TRAINING_SIGNATURE_GATEWAY_URL`: 배포된 Apps Script Web App `/exec` URL
- `TRAINING_SIGNATURE_GATEWAY_SECRET`: Script Properties와 동일한 HMAC 비밀값

Apps Script는 V8 runtime과 Advanced Drive API v2를 사용한다. Web App은 배포자 계정으로 실행하고, 호출 접근은 HMAC 검증을 전제로 구성한다. 비밀값과 폴더 ID는 로그에 남기지 않는다.

## 저장 정책

서명은 `<year>/<eventId>/<requestId>.png` 경로로 저장한다. 동일한 `requestId`가 재전송되면 기존 파일을 반환하며 새 파일을 만들지 않는다. 폴더와 파일에 `anyone` 또는 `domain` 권한이 있으면 저장소 준비 실패로 처리한다. 파일을 공개 공유하지 않는다.

## 복구 정책

Gateway 저장 후 Sheet 기록이 실패해도 PNG를 삭제하지 않는다. Firestore 잠금에 남은 `requestId`로 기존 파일을 다시 찾아 관리자 복구 흐름에서 재사용한다. 자동 영구 삭제는 수행하지 않는다.

## PDF 변환

온라인 보건실 서버가 공식 XLSX 템플릿에 최종 대상자와 서명 이미지를 채운다. Gateway는 완성된 XLSX를 임시 Google Spreadsheet로 변환해 A4 PDF로 내보낸 뒤 임시 변환 파일을 휴지통으로 이동한다. 교육 대상 판정이나 서명 매칭은 Gateway에서 수행하지 않는다.
