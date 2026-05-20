/**
 * 세화여고 온라인 보건실 - Apps Script 백엔드
 * 
 * 설치 방법:
 * 1. Google Apps Script (script.google.com) 에서 기존 프로젝트 열기
 * 2. 아래 코드를 기존 코드와 합치거나 교체
 * 3. doPost 함수가 없다면 이 파일 전체를 붙여넣기
 * 4. 배포 → 새 배포 → 웹 앱 → "나" 실행, "모든 사용자" 액세스 → 배포
 * 5. 새 배포 URL을 React 앱의 SCRIPT_URL 에 반영
 * 
 * 시트 자동 생성:
 * - 응답_심폐소생술이수증
 * - 응답_결핵검진확인증
 * - 응답_채용검진확인요청
 * - 응답_기타보건자료
 * 
 * Drive 폴더 ID:
 * - 심폐소생술 이수증: 19foLN446v5ggGN6hxLBuH8tNAQuSXgtM
 * - 결핵검진 확인증:   1MfxNVL1muROzpi1ZbV7WDWr4SKMU7ghm
 * - 기타 보건자료:     1T2yMxeKmab1SDqdVCRgdxpHMx3Fu2EO6
 */

// ─── 시트 헤더 정의 ───────────────────────────────────────────────
const SHEET_HEADERS = {
  "응답_심폐소생술이수증": [
    "제출일시", "성명", "소속/부서", "교직원구분", "이수일자", "이수기관", "파일명", "파일링크"
  ],
  "응답_결핵검진확인증": [
    "제출일시", "성명", "소속/부서", "교직원구분", "검진일자", "제출자료유형", "파일명", "파일링크"
  ],
  "응답_채용검진확인요청": [
    "제출일시", "성명", "소속/부서", "교직원구분", "행정실제출여부", "제출시기", "비고"
  ],
  "응답_기타보건자료": [
    "제출일시", "성명", "소속/부서", "교직원구분", "비고", "파일명", "파일링크"
  ],
};

// ─── CORS 헤더 ────────────────────────────────────────────────────
function corsHeaders() {
  return ContentService.createTextOutput(JSON.stringify({ status: "ok" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── doGet: 기존 portal 데이터 제공 (기존 코드 유지) ─────────────
function doGet(e) {
  const mode = e?.parameter?.mode || "";
  if (mode === "portal") {
    return getPortalData();
  }
  return ContentService.createTextOutput(JSON.stringify({ status: "ok", mode }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── doPost: 제출 처리 ───────────────────────────────────────────
function doPost(e) {
  try {
    const payload = JSON.parse(e.parameter.payload);
    const { type, sheetName, folderId, fields, fileName, fileBase64, fileMimeType } = payload;

    // 시트 준비
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = getOrCreateSheet(ss, sheetName);

    let fileLink = "";

    // 파일 저장 (파일 업로드가 있는 경우)
    if (fileBase64 && folderId && fileName) {
      const folder = DriveApp.getFolderById(folderId);
      const blob = Utilities.newBlob(
        Utilities.base64Decode(fileBase64),
        fileMimeType,
        fileName
      );
      const driveFile = folder.createFile(blob);
      // 링크 공유 설정 (뷰어 권한)
      driveFile.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
      fileLink = driveFile.getUrl();
    }

    // 시트에 행 추가
    const now = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
    appendRow(sheet, sheetName, fields, now, fileName || "", fileLink);

    return ContentService.createTextOutput(
      JSON.stringify({ status: "success", message: "제출 완료" })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log("doPost error: " + err.toString());
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── 시트 가져오기 / 없으면 생성 ─────────────────────────────────
function getOrCreateSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headers = SHEET_HEADERS[sheetName];
    if (headers) {
      sheet.appendRow(headers);
      // 헤더 서식
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground("#1A3B8B");
      headerRange.setFontColor("#FFFFFF");
      headerRange.setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

// ─── 시트 종류별 행 추가 ─────────────────────────────────────────
function appendRow(sheet, sheetName, fields, now, fileName, fileLink) {
  switch (sheetName) {
    case "응답_심폐소생술이수증":
      sheet.appendRow([
        now,
        fields.name || "",
        fields.dept || "",
        fields.staffType || "",
        fields.completionDate || "",
        fields.institution || "",
        fileName,
        fileLink,
      ]);
      break;

    case "응답_결핵검진확인증":
      sheet.appendRow([
        now,
        fields.name || "",
        fields.dept || "",
        fields.staffType || "",
        fields.checkupDate || "",
        fields.docType || "",
        fileName,
        fileLink,
      ]);
      break;

    case "응답_채용검진확인요청":
      sheet.appendRow([
        now,
        fields.name || "",
        fields.dept || "",
        fields.staffType || "",
        fields.adminSubmitted || "",
        fields.submitPeriod || "",
        fields.note || "",
      ]);
      break;

    case "응답_기타보건자료":
      sheet.appendRow([
        now,
        fields.name || "",
        fields.dept || "",
        fields.staffType || "",
        fields.note || "",
        fileName,
        fileLink,
      ]);
      break;

    default:
      // 알 수 없는 시트: 그냥 JSON 덤프
      sheet.appendRow([now, JSON.stringify(fields), fileName, fileLink]);
  }
}

// ─── 기존 getPortalData 함수 (원본 유지) ─────────────────────────
// 아래 함수는 기존 Apps Script에 이미 있다면 교체하지 않아도 됩니다.
// 없는 경우에만 이 샘플을 참고하세요.
function getPortalData() {
  // 기존 구현이 있는 경우 그대로 사용
  // 없는 경우 빈 데이터 반환
  const data = {
    appConfig: null,
    notices: [],
    uploads: [],
    checkups: [],
    educations: [],
    studentCare: [],
    resources: [],
    messages: [],
    faqs: [],
  };
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
