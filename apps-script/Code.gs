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
    "제출일시", "성명", "소속/부서", "이수일자", "파일명", "파일링크"
  ],
  "응답_결핵검진확인증": [
    "제출일시", "성명", "소속/부서", "검진일자", "파일명", "파일링크"
  ],
  "응답_채용검진확인요청": [
    "제출일시", "성명", "소속/부서", "행정실제출여부", "제출시기", "비고"
  ],
  "응답_기타보건자료": [
    "제출일시", "성명", "소속/부서", "교직원구분", "비고", "파일명", "파일링크"
  ],
  "응답_교직원결핵검진신청": [
    "제출일시", "성명", "소속/부서", "신청유형"
  ],
  "응답_교직원결핵검진유형선택": [
    "제출일시", "성명", "소속/부서", "검진유형", "접수기한", "비고"
  ],
  "응답_인바디측정신청": [
    "제출일시", "성명", "소속/부서", "희망날짜", "희망시간대"
  ],
};

// ─── 제출 시트 헤더 (SUBMIT_SHEET_HEADERS) ───────────────────────
const SUBMIT_SHEET_HEADERS = {
  "응답_심폐소생술이수증":        ["제출일시", "성명", "소속/부서", "이수일자", "파일명", "파일링크"],
  "응답_결핵검진확인증":          ["제출일시", "성명", "소속/부서", "검진일자", "파일명", "파일링크"],
  "응답_채용검진확인요청":        ["제출일시", "성명", "소속/부서", "행정실제출여부", "제출시기", "비고"],
  "응답_기타보건자료":            ["제출일시", "성명", "소속/부서", "교직원구분", "비고", "파일명", "파일링크"],
  "응답_교직원결핵검진신청":      ["제출일시", "성명", "소속/부서", "신청유형"],
  "응답_교직원결핵검진유형선택":  ["제출일시", "성명", "소속/부서", "검진유형", "비고"],
  "응답_인바디측정신청":          ["제출일시", "성명", "소속/부서", "희망날짜", "희망시간대"],
};

// ─── 시트명 상수 ──────────────────────────────────────────────────
const SHEET_NAMES = {
  portalResources: "앱_건강정보/이벤트",
};

// ─── CORS 헤더 ────────────────────────────────────────────────────
function corsHeaders() {
  return ContentService.createTextOutput(JSON.stringify({ status: "ok" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── 공통 헬퍼 ───────────────────────────────────────────────────
function jsonOutput_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

// ─── 앱 설정값 읽기 헬퍼 ─────────────────────────────────────────
function getAppConfig_(key) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName("앱_설정");
  if (!sheet) return "";
  const data = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === key) return String(data[i][1] || "");
  }
  return "";
}

// ─── doGet: 설정값 반환 + portal 데이터 제공 ──────────────────────
function doGet(e) {
  const mode   = e && e.parameter ? String(e.parameter.mode   || "").trim() : "";
  const action = e && e.parameter ? String(e.parameter.action || "").trim() : "";
  try {
    if (action === "getTbConfig") {
      const config = {
        enabled:       getAppConfig_("결핵검진유형선택_사용"),
        startDate:     getAppConfig_("결핵검진유형선택_접수시작"),
        endDate:       getAppConfig_("결핵검진유형선택_접수마감"),
        closedButton:  getAppConfig_("결핵검진유형선택_마감후버튼"),
        closedMessage: getAppConfig_("결핵검진유형선택_마감안내"),
      };
      return jsonOutput_({ result: "success", config });
    }
    if (mode === "portal") return jsonOutput_(getPortalData_());
    return jsonOutput_(getVisitSummaryData_());
  } catch (error) {
    return jsonOutput_({ error: true, message: String(error) });
  }
}

// ─── doPost: 제출 처리 ───────────────────────────────────────────
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
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

    // 시트에 행 추가 (early response 반환 시 그대로 전달)
    const now = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
    const earlyResponse = appendRow(sheet, sheetName, fields, now, fileName || "", fileLink);
    if (earlyResponse) return earlyResponse;

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

// ─── 시트 종류별 행 추가 (early response 반환 시 doPost가 그대로 전달) ──
function appendRow(sheet, sheetName, fields, now, fileName, fileLink) {
  switch (sheetName) {
    case "응답_심폐소생술이수증":
      sheet.appendRow([
        now,
        fields.name || "",
        fields.dept || "",
        fields.completionDate || "",
        fileName,
        fileLink,
      ]);
      break;

    case "응답_결핵검진확인증":
      sheet.appendRow([
        now,
        fields.name || "",
        fields.dept || "",
        fields.checkupDate || "",
        fileName,
        fileLink,
      ]);
      break;

    case "응답_채용검진확인요청":
      sheet.appendRow([
        now,
        fields.name || "",
        fields.dept || "",
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

    case "응답_교직원결핵검진신청":
      sheet.appendRow([
        now,
        fields.name || "",
        fields.dept || "",
        fields.registrationType || "",
      ]);
      break;

    case "응답_교직원결핵검진유형선택": {
      const enabled = getAppConfig_("결핵검진유형선택_사용");
      const endDateRaw = getAppConfig_("결핵검진유형선택_접수마감");
      const closedMsg = getAppConfig_("결핵검진유형선택_마감안내") || "접수 기한이 마감되었습니다.";

      if (String(enabled) !== "TRUE") {
        return ContentService.createTextOutput(
          JSON.stringify({ result: "error", message: closedMsg })
        ).setMimeType(ContentService.MimeType.JSON);
      }

      const nowDate = new Date();
      const nowStr = Utilities.formatDate(nowDate, "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");

      if (endDateRaw) {
        const endDate = new Date(endDateRaw);
        if (nowDate > endDate) {
          return ContentService.createTextOutput(
            JSON.stringify({ result: "error", message: closedMsg })
          ).setMimeType(ContentService.MimeType.JSON);
        }
      }

      sheet.appendRow([
        nowStr,
        fields.name || "",
        fields.dept || "",
        fields.registrationType || "",
        "",
        "",
      ]);

      const masterSs = SpreadsheetApp.getActiveSpreadsheet();
      const masterSheet = masterSs.getSheetByName("교직원 결핵검진현황");
      if (masterSheet) {
        const data = masterSheet.getDataRange().getValues();
        let found = false;
        for (let i = 5; i < data.length; i++) {
          if (data[i][2] === fields.name) {
            masterSheet.getRange(i + 1, 4).setValue(fields.registrationType || "");
            masterSheet.getRange(i + 1, 5).setValue("응답완료");
            masterSheet.getRange(i + 1, 8).setValue(nowStr);
            found = true;
            break;
          }
        }
        if (!found) {
          const lastRow = sheet.getLastRow();
          sheet.getRange(lastRow, 6).setValue("명단 확인 필요");
        }
      }
      break;
    }

    case "응답_인바디측정신청":
      sheet.appendRow([
        now,
        fields.name || "",
        fields.dept || "",
        fields.preferredDate || "",
        fields.preferredTime || "",
      ]);
      break;

    default:
      // 알 수 없는 시트: 그냥 JSON 덤프
      sheet.appendRow([now, JSON.stringify(fields), fileName, fileLink]);
  }
}

// ─── 시트 종류별 행 추가 (if-else 버전 / doPost에서 호출) ─────────
function appendSubmitRow_(sheet, sheetName, fields, now, fileName, fileLink) {
  if (sheetName === "응답_심폐소생술이수증") {
    sheet.appendRow([now, fields.name || "", fields.dept || "", fields.completionDate || "", fileName, fileLink]);
  } else if (sheetName === "응답_결핵검진확인증") {
    sheet.appendRow([now, fields.name || "", fields.dept || "", fields.checkupDate || "", fileName, fileLink]);
  } else if (sheetName === "응답_채용검진확인요청") {
    sheet.appendRow([now, fields.name || "", fields.dept || "", fields.adminSubmitted || "", fields.submitPeriod || "", fields.note || ""]);
  } else if (sheetName === "응답_기타보건자료") {
    sheet.appendRow([now, fields.name || "", fields.dept || "", fields.staffType || "", fields.note || "", fileName, fileLink]);
  } else if (sheetName === "응답_교직원결핵검진신청") {
    sheet.appendRow([now, fields.name || "", fields.dept || "", fields.registrationType || ""]);
  } else if (sheetName === "응답_교직원결핵검진유형선택") {
    const enabled    = getAppConfig_("결핵검진유형선택_사용");
    const endDateRaw = getAppConfig_("결핵검진유형선택_접수마감");
    const closedMsg  = getAppConfig_("결핵검진유형선택_마감안내") || "접수 기한이 마감되었습니다.";
    const nowDate    = new Date();

    if (enabled !== "TRUE") {
      return ContentService.createTextOutput(
        JSON.stringify({ status: "error", message: closedMsg })
      ).setMimeType(ContentService.MimeType.JSON);
    }
    if (endDateRaw) {
      const endDate = new Date(endDateRaw);
      if (nowDate > endDate) {
        return ContentService.createTextOutput(
          JSON.stringify({ status: "error", message: closedMsg })
        ).setMimeType(ContentService.MimeType.JSON);
      }
    }

    const ss2 = getSpreadsheet_();
    const masterSheet = ss2.getSheetByName("교직원 결핵검진현황");
    if (masterSheet) {
      const data = masterSheet.getDataRange().getValues();
      let found = false;
      for (let i = 5; i < data.length; i++) {
        if (data[i][2] === fields.name) {
          masterSheet.getRange(i + 1, 4).setValue(fields.registrationType);
          masterSheet.getRange(i + 1, 5).setValue("응답완료");
          masterSheet.getRange(i + 1, 8).setValue(now);
          found = true;
          break;
        }
      }
      if (!found) {
        const lastRow = sheet.getLastRow();
        sheet.getRange(lastRow, 6).setValue("명단 확인 필요");
      }
    }
    sheet.appendRow([now, fields.name || "", fields.dept || "", fields.registrationType || "", ""]);
  } else if (sheetName === "응답_인바디측정신청") {
    sheet.appendRow([now, fields.name || "", fields.dept || "", fields.preferredDate || "", fields.preferredTime || ""]);
  } else {
    sheet.appendRow([now, JSON.stringify(fields), fileName, fileLink]);
  }
}

// ─── 앱_건강정보/이벤트 시트 읽기 ────────────────────────────────
// 헤더 행: 제목 | 카테고리 | 설명 | 버튼텍스트 | URL
function readResourceItems_() {
  try {
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(SHEET_NAMES.portalResources);
    if (!sheet) {
      Logger.log("readResourceItems_: sheet not found → " + SHEET_NAMES.portalResources);
      return [];
    }

    const rows = sheet.getDataRange().getValues();
    const items = [];

    for (let i = 1; i < rows.length; i++) {
      const [title, category, description, buttonText, url] = rows[i];
      if (!title) continue;
      items.push({
        title:       String(title       || ""),
        category:    String(category    || ""),
        description: String(description || ""),
        buttonText:  String(buttonText  || ""),
        url:         String(url         || ""),
      });
    }

    return items;
  } catch (e) {
    Logger.log("readResourceItems_ error: " + e.toString());
    return [];
  }
}

// ─── Portal 데이터 (raw 객체 반환 / doGet에서 jsonOutput_로 래핑) ─
function getPortalData_() {
  return {
    appConfig: null,
    notices: [],
    uploads: [],
    checkups: [],
    educations: [],
    studentCare: [],
    resources: readResourceItems_(),
    messages: [],
    faqs: [],
  };
}

// doGet 이외 경로에서 직접 ContentService 응답이 필요할 때 사용
function getPortalData() {
  return jsonOutput_(getPortalData_());
}

// 기본 응답 (portal / action 없이 호출된 경우)
function getVisitSummaryData_() {
  return { result: "ok" };
}
