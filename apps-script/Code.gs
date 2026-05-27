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
    if (action === "verifyPrivate") {
      const password  = e.parameter.password || "";
      const correctPw = getAppConfig_("요보호학생_비밀번호");
      if (!correctPw) {
        return jsonOutput_({ result: "error", message: "비밀번호가 설정되어 있지 않습니다. 관리자에게 문의해주세요." });
      }
      if (password === correctPw) {
        const ss    = getSpreadsheet_();
        const sheet = ss.getSheetByName("앱_학생건강관리");
        if (!sheet) return jsonOutput_({ result: "error", message: "자료 시트를 찾을 수 없습니다." });
        const data = sheet.getDataRange().getDisplayValues();
        const url  = data[1] && data[1][5] ? data[1][5] : "";
        if (!url) return jsonOutput_({ result: "error", message: "링크가 설정되어 있지 않습니다." });
        return jsonOutput_({ result: "success", url });
      } else {
        return jsonOutput_({ result: "error", message: "비밀번호가 올바르지 않습니다." });
      }
    }
    if (action === "getHealthRoomLocation") {
      return jsonOutput_(getHealthRoomLocation_(e.parameter || {}));
    }
    if (action === "confirmHealthRoomHomeroom") {
      return jsonOutput_(confirmHealthRoomHomeroom_(e.parameter || {}));
    }
    if (action === "verifyHealthRoom") {
      return jsonOutput_({ result: "error", message: "보건실 소재 확인은 앱 내부 조회 화면을 이용해 주세요." });
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
// 헤더 행: 사용여부 | 제목 | 카테고리 | 설명 | 버튼명 | 링크 | 정렬순서
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
      const [enabled, title, category, description, buttonText, url, sortOrder] = rows[i];
      if (!enabled || !title) continue;
      items.push({
        title:       String(title       || ""),
        category:    String(category    || ""),
        description: String(description || ""),
        buttonText:  String(buttonText  || ""),
        url:         String(url         || ""),
        sortOrder:   Number(sortOrder   || 0),
      });
    }

    items.sort((a, b) => a.sortOrder - b.sortOrder);
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
    tbConfig: {
      enabled:       getAppConfig_("결핵검진유형선택_사용"),
      startDate:     getAppConfig_("결핵검진유형선택_접수시작"),
      endDate:       getAppConfig_("결핵검진유형선택_접수마감"),
      closedButton:  getAppConfig_("결핵검진유형선택_마감후버튼"),
      closedMessage: getAppConfig_("결핵검진유형선택_마감안내"),
    },
  };
}

// doGet 이외 경로에서 직접 ContentService 응답이 필요할 때 사용
function getPortalData() {
  return jsonOutput_(getPortalData_());
}

const HEALTH_ROOM_SHEET_NAME = "학생 보건실 입실현황";
const HEALTH_ROOM_SETTING_SHEET_NAME = "앱_입실현황공유설정";
const HEALTH_ROOM_HOMEROOM_AUTH_SHEET_NAME = "앱_담임권한";
const HEALTH_ROOM_ACCESS_LOG_SHEET_NAME = "앱_입실현황접속로그";

function getHealthRoomLocation_(params) {
  const accessType = String(params.accessType || "").trim();
  const grade = String(params.grade || "").trim();
  const classNo = String(params.classNo || "").trim();
  const password = String(params.password || "");
  let success = false;

  try {
    const config = getHealthRoomShareConfig_();
    if (String(config["기능사용"] || "TRUE").toUpperCase() === "FALSE") {
      logHealthRoomAccess_(accessType, grade, classNo, false);
      return { result: "error", message: "현재 보건실 소재 확인 기능을 사용할 수 없습니다." };
    }

    if (accessType === "subject") {
      if (!config["교직원비밀번호"] || password !== String(config["교직원비밀번호"])) {
        logHealthRoomAccess_(accessType, grade, classNo, false);
        return { result: "error", message: "비밀번호가 올바르지 않습니다." };
      }
      success = true;
      return {
        result: "success",
        accessType,
        items: readHealthRoomRows_({ accessType, scope: config["교과교사표시범위"] || "today" }),
      };
    }

    if (accessType === "homeroom") {
      if (!grade || !classNo) {
        logHealthRoomAccess_(accessType, grade, classNo, false);
        return { result: "error", message: "학년과 반을 입력해 주세요." };
      }
      if (!verifyHomeroomPassword_(grade, classNo, password)) {
        logHealthRoomAccess_(accessType, grade, classNo, false);
        return { result: "error", message: "학급 비밀번호가 올바르지 않습니다." };
      }
      success = true;
      return {
        result: "success",
        accessType,
        items: readHealthRoomRows_({
          accessType,
          grade,
          classNo,
          scope: config["담임표시범위"] || "today",
        }),
      };
    }

    if (accessType === "admin") {
      if (!config["관리자비밀번호"] || password !== String(config["관리자비밀번호"])) {
        logHealthRoomAccess_(accessType, grade, classNo, false);
        return { result: "error", message: "관리자 비밀번호가 올바르지 않습니다." };
      }
      success = true;
      return {
        result: "success",
        accessType,
        items: readHealthRoomRows_({ accessType, scope: "all" }),
      };
    }

    return { result: "error", message: "접근 유형을 확인할 수 없습니다." };
  } finally {
    if (success) logHealthRoomAccess_(accessType, grade, classNo, true);
  }
}

function confirmHealthRoomHomeroom_(params) {
  const rowId = Number(params.rowId || 0);
  const grade = String(params.grade || "").trim();
  const classNo = String(params.classNo || "").trim();
  const password = String(params.password || "");

  if (!rowId || rowId < 2) {
    logHealthRoomAccess_("homeroom-confirm", grade, classNo, false);
    return { result: "error", message: "확인할 기록을 찾을 수 없습니다." };
  }
  if (!verifyHomeroomPassword_(grade, classNo, password)) {
    logHealthRoomAccess_("homeroom-confirm", grade, classNo, false);
    return { result: "error", message: "학급 비밀번호가 올바르지 않습니다." };
  }

  const sheet = getSpreadsheet_().getSheetByName(HEALTH_ROOM_SHEET_NAME);
  if (!sheet || rowId > sheet.getLastRow()) {
    logHealthRoomAccess_("homeroom-confirm", grade, classNo, false);
    return { result: "error", message: "원본 기록을 찾을 수 없습니다." };
  }

  const row = sheet.getRange(rowId, 1, 1, 13).getDisplayValues()[0];
  if (String(row[2]).trim() !== grade || String(row[3]).trim() !== classNo) {
    logHealthRoomAccess_("homeroom-confirm", grade, classNo, false);
    return { result: "error", message: "해당 학급 기록만 확인할 수 있습니다." };
  }

  sheet.getRange(rowId, 11).setValue(true);
  logHealthRoomAccess_("homeroom-confirm", grade, classNo, true);
  return { result: "success" };
}

function readHealthRoomRows_(options) {
  const sheet = getSpreadsheet_().getSheetByName(HEALTH_ROOM_SHEET_NAME);
  if (!sheet) return [];

  const values = sheet.getDataRange().getDisplayValues();
  const today = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd");
  const items = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowDate = normalizeDateText_(row[0]);
    const rowGrade = String(row[2] || "").trim();
    const rowClass = String(row[3] || "").trim();
    const resultDetail = String(row[12] || "").trim();
    const returnedAt = String(row[7] || "").trim();
    const currentStatus = normalizeHealthRoomStatus_(String(row[1] || "").trim(), returnedAt, resultDetail);

    if (options.accessType === "subject" && rowDate !== today) continue;
    if (options.accessType !== "admin" && String(options.scope || "today").toLowerCase() !== "all" && rowDate !== today) continue;
    if (options.accessType === "homeroom" && (rowGrade !== options.grade || rowClass !== options.classNo)) continue;

    const base = {
      rowId: String(i + 1),
      studentNo: [rowGrade, rowClass, String(row[4] || "").trim()].filter(Boolean).join("-"),
      maskedName: maskStudentName_(row[5]),
      enteredAt: String(row[6] || "").trim(),
      returnedAt,
      status: currentStatus,
    };

    if (options.accessType === "homeroom") {
      base.date = rowDate;
      base.duration = String(row[11] || "").trim();
      base.attendanceNote = mapAttendanceNote_(resultDetail);
      base.homeroomConfirmed = isTruthy_(row[10]);
    }

    if (options.accessType === "admin") {
      base.date = rowDate;
      base.duration = String(row[11] || "").trim();
      base.homeroomConfirmed = isTruthy_(row[10]);
      base.symptom = String(row[8] || "").trim();
      base.treatment = String(row[9] || "").trim();
      base.resultDetail = resultDetail;
    }

    items.push(base);
  }

  items.sort(function(a, b) {
    const aCurrent = a.status === "현재 이용중" ? 0 : 1;
    const bCurrent = b.status === "현재 이용중" ? 0 : 1;
    if (aCurrent !== bCurrent) return aCurrent - bCurrent;
    return String(b.enteredAt || "").localeCompare(String(a.enteredAt || ""));
  });
  return items;
}

function getHealthRoomShareConfig_() {
  const sheet = getOrCreateHealthRoomSheet_(HEALTH_ROOM_SETTING_SHEET_NAME, [
    "항목", "값"
  ]);
  const rows = sheet.getDataRange().getDisplayValues();
  const config = {};
  for (let i = 1; i < rows.length; i++) {
    const key = String(rows[i][0] || "").trim();
    if (key) config[key] = String(rows[i][1] || "").trim();
  }
  return config;
}

function verifyHomeroomPassword_(grade, classNo, password) {
  const sheet = getOrCreateHealthRoomSheet_(HEALTH_ROOM_HOMEROOM_AUTH_SHEET_NAME, [
    "학년", "반", "비밀번호"
  ]);
  const rows = sheet.getDataRange().getDisplayValues();
  for (let i = 1; i < rows.length; i++) {
    if (
      String(rows[i][0]).trim() === String(grade).trim() &&
      String(rows[i][1]).trim() === String(classNo).trim() &&
      String(rows[i][2]) === String(password)
    ) {
      return true;
    }
  }
  return false;
}

function logHealthRoomAccess_(accessType, grade, classNo, success) {
  const sheet = getOrCreateHealthRoomSheet_(HEALTH_ROOM_ACCESS_LOG_SHEET_NAME, [
    "접속일시", "접근유형", "학년", "반", "성공여부"
  ]);
  sheet.appendRow([
    Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss"),
    accessType || "",
    grade || "",
    classNo || "",
    success ? "TRUE" : "FALSE",
  ]);
}

function getOrCreateHealthRoomSheet_(sheetName, headers) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground("#1A3B8B")
      .setFontColor("#FFFFFF")
      .setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function normalizeDateText_(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return Utilities.formatDate(date, "Asia/Seoul", "yyyy-MM-dd");
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{4})[.\-\/년\s]+(\d{1,2})[.\-\/월\s]+(\d{1,2})/);
  if (!match) return text;
  return match[1] + "-" + ("0" + match[2]).slice(-2) + "-" + ("0" + match[3]).slice(-2);
}

function maskStudentName_(name) {
  const text = String(name || "").trim();
  if (!text) return "";
  if (text.length === 1) return "*";
  if (text.length === 2) return text.charAt(0) + "*";
  return text.charAt(0) + "*".repeat(text.length - 2) + text.charAt(text.length - 1);
}

function normalizeHealthRoomStatus_(status, returnedAt, resultDetail) {
  const statusText = String(status || "").trim();
  const resultText = String(resultDetail || "").trim();
  if (statusText.indexOf("이용") >= 0 || statusText.indexOf("입실") >= 0) return "현재 이용중";
  if (!returnedAt && resultText.indexOf("복귀") < 0) return "현재 이용중";
  if (resultText.indexOf("조퇴") >= 0 || resultText.indexOf("귀가") >= 0 || resultText.indexOf("병원") >= 0) return "추가 조치";
  return "복귀 완료";
}

function mapAttendanceNote_(resultDetail) {
  const text = String(resultDetail || "").trim();
  if (text.indexOf("질병결과") >= 0 || text.indexOf("생리결과") >= 0) return "출결 참고 필요";
  if (text.indexOf("복귀") >= 0) return "복귀 완료";
  if (text.indexOf("조퇴") >= 0 || text.indexOf("귀가") >= 0 || text.indexOf("병원") >= 0) return "추가 조치";
  return text ? "확인 필요" : "";
}

function isTruthy_(value) {
  const text = String(value || "").trim().toUpperCase();
  return text === "TRUE" || text === "Y" || text === "YES" || text === "1" || text === "✓" || text === "✔";
}

// 기본 응답 (portal / action 없이 호출된 경우)
function getVisitSummaryData_() {
  return { result: "ok" };
}
