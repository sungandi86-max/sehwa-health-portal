const SPREADSHEET_ID = "1ZCsztyIDuvcTzGdE4zZvexJmLuz8aNIIiuGuSyIBwbs";
const TIMEZONE = "Asia/Seoul";

const SHEET_NAMES = {
  visit: "학생 보건실 입실현황",
  portalNotices: "앱_공지",
  portalUploads: "앱_제출센터",
  portalCheckups: "앱_검진검사",
  portalEducations: "앱_교육자료",
  portalStudentCare: "앱_학생건강관리",
  portalResources: "앱_건강정보/이벤트",
  portalMessages: "앱_메신저문구",
  portalFaqs: "앱_FAQ",
  portalRoadmap: "앱_업무로드맵",
  infectionManagement: "학생 감염병 관리 현황",
  healthRoomShareConfig: "앱_입실현황공유설정",
  healthRoomHomeroomAuth: "앱_담임권한",
  healthRoomAccessLog: "앱_입실현황접속로그"
};

const FOLDER_IDS = {
  cpr:   "19foLN446v5ggGN6hxLBuH8tNAQuSXgtM",
  tb:    "1MfxNVL1muROzpi1ZbV7WDWr4SKMU7ghm",
  other: "1T2yMxeKmab1SDqdVCRgdxpHMx3Fu2EO6"
};

const SUBMIT_SHEET_HEADERS = {
  "응답_심폐소생술이수증":        ["제출일시","성명","소속/부서","교직원구분","이수일자","이수기관","파일명","파일링크"],
  "응답_결핵검진확인증":          ["제출일시","성명","소속/부서","교직원구분","검진일자","제출자료유형","파일명","파일링크"],
  "응답_채용검진확인요청":        ["제출일시","성명","소속/부서","교직원구분","행정실제출여부","제출시기","비고"],
  "응답_기타보건자료":            ["제출일시","성명","소속/부서","교직원구분","비고","파일명","파일링크"],
  "응답_교직원결핵검진유형선택":  ["제출일시","성명","소속/부서","검진유형","비고"],
  "응답_인바디측정신청": ["제출일시","성명","소속/부서","희망날짜","희망시간대"],
};

// ════════════════════════════════════════════════════════════════
// onEdit
// ════════════════════════════════════════════════════════════════

function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const row   = e.range.getRow();
  const col   = e.range.getColumn();
  if (sheet.getName() !== SHEET_NAMES.visit) return;
  if (row < 4) return;
  const COL         = getColumns();
  const editedValue = e.range.getDisplayValue().trim();
  try {
    if (col === COL.name && editedValue !== "") {
      const now = new Date();
      const dateCell = sheet.getRange(row, COL.date);
      if (dateCell.getDisplayValue().trim() === "") {
        dateCell.setValue(now).setNumberFormat("yyyy. MM. dd");
      }
      const inTimeCell = sheet.getRange(row, COL.inTime);
      if (inTimeCell.getDisplayValue().trim() === "") {
        inTimeCell.setValue(now).setNumberFormat("HH:mm");
      }
      updateRow(sheet, row, COL);
    }
    if (col === COL.inTime) {
      const dateCell = sheet.getRange(row, COL.date);
      if (editedValue !== "" && dateCell.getDisplayValue().trim() === "") {
        dateCell.setValue(new Date()).setNumberFormat("yyyy. MM. dd");
      }
      updateRow(sheet, row, COL);
    }
    if (col === COL.outTime) updateRow(sheet, row, COL);
    if (col === COL.symptom) updateRow(sheet, row, COL);
    if (col === COL.name && editedValue === "") {
      clearRowIfEmpty(sheet, row, COL);
    }
  } catch (error) {
    Logger.log("onEdit error: " + error);
  }
}

function getColumns() {
  return {
    date: 1, status: 2, grade: 3, classNum: 4, number: 5,
    name: 6, inTime: 7, outTime: 8, symptom: 9,
    action: 10, homeroomConfirm: 11, stay: 12, result: 13, note: 14
  };
}

function updateRow(sheet, row, COL) {
  const inTimeText  = sheet.getRange(row, COL.inTime).getDisplayValue().trim();
  const outTimeText = sheet.getRange(row, COL.outTime).getDisplayValue().trim();
  const statusCell  = sheet.getRange(row, COL.status);
  const stayCell    = sheet.getRange(row, COL.stay);
  const resultCell  = sheet.getRange(row, COL.result);
  if (inTimeText !== "" && outTimeText !== "") {
    statusCell.setValue("교실 복귀");
    const stayMinutes = calculateClassBasedStayMinutes(inTimeText, outTimeText);
    if (stayMinutes === null || stayMinutes < 0) {
      stayCell.clearContent();
      resultCell.clearContent();
      return;
    }
    stayCell.setValue(formatMinutes(stayMinutes)).setNumberFormat("@");
    if (stayMinutes >= 15) {
      const symptom = sheet.getRange(row, COL.symptom).getDisplayValue();
      resultCell.setValue(symptom.includes("생리통") ? "생리결과" : "질병결과");
    } else {
      resultCell.clearContent();
    }
  } else if (inTimeText !== "" && outTimeText === "") {
    statusCell.setValue("입실 중");
    stayCell.clearContent();
    resultCell.clearContent();
  } else {
    statusCell.clearContent();
    stayCell.clearContent();
    resultCell.clearContent();
  }
}

function calculateClassBasedStayMinutes(inTimeText, outTimeText) {
  const inMinutes  = timeTextToMinutes(inTimeText);
  const outMinutes = timeTextToMinutes(outTimeText);
  if (inMinutes === null || outMinutes === null) return null;
  const classTimes = [
    { start: 8*60+10,  end: 9*60  },
    { start: 9*60+10,  end: 10*60 },
    { start: 10*60+10, end: 11*60 },
    { start: 12*60+10, end: 13*60 },
    { start: 13*60+10, end: 14*60 },
    { start: 14*60+10, end: 15*60 },
    { start: 15*60+10, end: 16*60 }
  ];
  for (const t of classTimes) {
    if (inMinutes >= t.start && inMinutes < t.end) return outMinutes - inMinutes;
  }
  for (const t of classTimes) {
    if (inMinutes < t.start) return outMinutes - t.start;
  }
  return null;
}

function timeTextToMinutes(timeText) {
  const match = String(timeText).match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatMinutes(totalMinutes) {
  const hours   = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours + ":" + String(minutes).padStart(2, "0");
}

function clearRowIfEmpty(sheet, row, COL) {
  const checkCols = [COL.inTime, COL.outTime, COL.symptom, COL.action, COL.result, COL.note];
  const hasData   = checkCols.some(col => sheet.getRange(row, col).getDisplayValue().trim() !== "");
  if (!hasData) {
    sheet.getRange(row, COL.date).clearContent();
    sheet.getRange(row, COL.status).clearContent();
    sheet.getRange(row, COL.stay).clearContent();
    sheet.getRange(row, COL.result).clearContent();
  }
}

function recalcAllStayTimes() {
  const ss    = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEET_NAMES.visit);
  if (!sheet) { Logger.log(SHEET_NAMES.visit + " 탭을 찾을 수 없습니다."); return; }
  const COL     = getColumns();
  const lastRow = sheet.getLastRow();
  for (let row = 4; row <= lastRow; row++) updateRow(sheet, row, COL);
}

// ════════════════════════════════════════════════════════════════
// doGet
// ════════════════════════════════════════════════════════════════

function doGet(e) {
  const mode   = e && e.parameter ? String(e.parameter.mode   || "").trim() : "";
  const action = e && e.parameter ? String(e.parameter.action || "").trim() : "";
  try {
    if (action === "getTbConfig") {
      const config = {
        enabled:       getAppConfig_("결핵검진유형선택_사용"),
        startDate:     getAppConfig_("결핵검진유형선택_접수시작"),
        endDate:       getAppConfig_("결핵검진유형선택_접수마감"),
        closedButton:  getAppConfig_("결핵검진유형선택_마감버튼") || getAppConfig_("결핵검진유형선택_마감후버튼"),
        closedMessage: getAppConfig_("결핵검진유형선택_마감안내"),
      };
      return jsonOutput_({ result: "success", config });
    }
    if (action === "verifyPrivate") {
      const password   = e.parameter.password || "";
      const correctPw  = getAppConfig_("요보호학생_비밀번호");
      if (password === correctPw) {
        const ss    = getSpreadsheet_();
        const sheet = ss.getSheetByName(SHEET_NAMES.portalStudentCare);
        if (!sheet) return jsonOutput_({ result: "error", message: "자료 시트를 찾을 수 없습니다." });
        const data  = sheet.getDataRange().getDisplayValues();
        const url   = data[1] && data[1][5] ? data[1][5] : "";
        if (!url) return jsonOutput_({ result: "error", message: "링크가 설정되어 있지 않습니다." });
        return jsonOutput_({ result: "success", url });
      } else {
        return jsonOutput_({ result: "error", message: "비밀번호가 올바르지 않습니다." });
      }
    }
    if (action === "verifyAdminMaster") {
      return jsonOutput_(verifyAdminMaster_(e.parameter || {}));
    }
    if (action === "getAdminReceiptSummary") {
      return jsonOutput_(getAdminReceiptSummary_(e.parameter || {}));
    }
    if (action === "getAdminInfectionReports") {
      return jsonOutput_(getAdminInfectionReports_(e.parameter || {}));
    }
    if (action === "updateAdminInfectionReportStatus") {
      return jsonOutput_(updateAdminInfectionReportStatus_(e.parameter || {}));
    }
    if (action === "getHealthRoomLocation") {
      return jsonOutput_(normalizeHealthRoomApiResponse_(getHealthRoomLocation_(e.parameter || {}), action));
    }
    if (action === "confirmHealthRoomHomeroom") {
      return jsonOutput_(normalizeHealthRoomApiResponse_(confirmHealthRoomHomeroom_(e.parameter || {}), action));
    }
    if (action === "verifyHealthRoom") {
      return jsonOutput_(healthRoomApiError_("보건실 소재 확인은 앱 내부 조회 화면을 이용해 주세요.", "legacy verifyHealthRoom action"));
    }
    if (mode === "monthlyVisit") {
      return jsonOutput_(normalizeHealthRoomApiResponse_(getMonthlyVisitRecords_(e.parameter || {}), mode));
    }
    if (mode === "adminVisitStats") {
      return jsonOutput_(normalizeHealthRoomApiResponse_(getAdminVisitStats_(e.parameter || {}), mode));
    }
    if (mode === "portal") return jsonOutput_(getPortalData_());
    return jsonOutput_(getVisitSummaryData_());
  } catch (error) {
    return jsonOutput_({
      success: false,
      result: "error",
      error: true,
      message: "Apps Script 처리 중 오류가 발생했습니다.",
      debug: String(error && error.stack ? error.stack : error),
    });
  }
}

// ════════════════════════════════════════════════════════════════
// doPost
// ════════════════════════════════════════════════════════════════

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    const payload = JSON.parse(e.postData.contents);
    if (payload.action === "infectionReport") {
      try {
        const result = appendInfectionReport_(payload);
        return ContentService.createTextOutput(JSON.stringify(result))
          .setMimeType(ContentService.MimeType.JSON);
      } catch (error) {
        Logger.log("infectionReport error: " + error);
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          result: "error",
          message: "감염병 발생 보고 저장 중 오류가 발생했습니다."
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    const { sheetName, folderId, fields, fileName, fileBase64, fileMimeType } = payload;
    if (!sheetName) throw new Error("sheetName 누락");
    const ss    = getSpreadsheet_();
    const sheet = getOrCreateSubmitSheet_(ss, sheetName);
    let fileLink = "";
    if (fileBase64 && folderId && fileName) {
      const folder    = DriveApp.getFolderById(folderId);
      const blob      = Utilities.newBlob(Utilities.base64Decode(fileBase64), fileMimeType, fileName);
      const driveFile = folder.createFile(blob);
      fileLink = driveFile.getUrl();
    }
    const now = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm:ss");
    appendSubmitRow_(sheet, sheetName, fields, now, fileName || "", fileLink);
    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function appendInfectionReport_(payload) {
  const grade = String(payload.grade || "").trim();
  const classNumber = String(payload.classNumber || "").trim();
  const studentNumber = String(payload.studentNumber || "").trim();
  const studentName = String(payload.studentName || "").trim();
  const diseaseType = String(payload.diseaseType || "").trim();
  const diseaseEtc = String(payload.diseaseEtc || "").trim();
  const diagnosisDate = String(payload.diagnosisDate || "").trim();
  const exclusionStartDate = String(payload.exclusionStartDate || "").trim();
  const exclusionEndDate = String(payload.exclusionEndDate || "").trim();
  const memo = String(payload.memo || "").trim();

  if (!grade || !classNumber || !studentNumber || !studentName || !diseaseType || !diagnosisDate) {
    return { success: false, result: "error", message: "학년, 반, 번호, 학생 이름, 감염병 종류, 진단일은 필수입니다." };
  }
  if (diseaseType === "기타" && !diseaseEtc) {
    return { success: false, result: "error", message: "기타 감염병명을 입력해 주세요." };
  }

  const diseaseName = diseaseType === "기타" ? diseaseEtc : diseaseType;
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEET_NAMES.infectionManagement);
  if (!sheet) {
    return { success: false, result: "error", message: SHEET_NAMES.infectionManagement + " 탭을 찾을 수 없습니다." };
  }

  const diagnosisKey = dateKey_(diagnosisDate);
  const rows = sheet.getDataRange().getDisplayValues();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (
      normalizeKey_(row[2]) === normalizeKey_(grade) &&
      normalizeKey_(row[3]) === normalizeKey_(classNumber) &&
      normalizeKey_(row[4]) === normalizeKey_(studentNumber) &&
      normalizeKey_(row[5]) === normalizeKey_(studentName) &&
      normalizeKey_(row[6]) === normalizeKey_(diseaseName) &&
      dateKey_(row[7]) === diagnosisKey
    ) {
      return { success: false, result: "error", message: "이미 같은 내용의 감염병 발생 보고가 접수되어 있습니다." };
    }
  }

  const targetRow = findFirstEmptyInfectionRow_(sheet);
  ensureInfectionRowFormula_(sheet, targetRow, 1);
  ensureInfectionRowFormula_(sheet, targetRow, 13);
  prepareInfectionInputRow_(sheet, targetRow);

  sheet.getRange(targetRow, 2, 1, 11).setValues([[
    new Date(),
    grade,
    classNumber,
    studentNumber,
    studentName,
    diseaseName,
    parseDateValue_(diagnosisDate),
    parseDateValue_(exclusionStartDate),
    parseDateValue_(exclusionEndDate),
    false,
    memo
  ]]);
  sheet.getRange(targetRow, 2).setNumberFormat("yyyy-MM-dd HH:mm:ss");
  sheet.getRange(targetRow, 8, 1, 3).setNumberFormat("yyyy-MM-dd");
  sheet.getRange(targetRow, 11).setValue(false);
  if (!sheet.getRange(targetRow, 13).getFormulaR1C1()) {
    sheet.getRange(targetRow, 13).setValue(monthKey_(diagnosisDate));
  }

  return { success: true, result: "success", message: "감염병 발생 보고가 제출되었습니다." };
}

function normalizeKey_(value) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

function dateKey_(value) {
  const text = String(value || "").trim();
  const match = text.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!match) return text;
  return match[1] + "-" + String(Number(match[2])).padStart(2, "0") + "-" + String(Number(match[3])).padStart(2, "0");
}

function monthKey_(value) {
  const key = dateKey_(value);
  const match = key.match(/^(\d{4})-(\d{2})-\d{2}$/);
  return match ? match[1] + "-" + match[2] : "";
}

function parseDateValue_(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return text;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function findFirstEmptyInfectionRow_(sheet) {
  const startRow = 5;
  const lastRow = Math.max(sheet.getLastRow(), startRow);
  const values = sheet.getRange(startRow, 6, lastRow - startRow + 1, 3).getDisplayValues();
  for (let i = 0; i < values.length; i++) {
    const name = String(values[i][0] || "").trim();
    const disease = String(values[i][1] || "").trim();
    const diagnosisDate = String(values[i][2] || "").trim();
    if (!name && !disease && !diagnosisDate) return startRow + i;
  }
  return lastRow + 1;
}

function ensureInfectionRowFormula_(sheet, row, column) {
  const currentFormula = sheet.getRange(row, column).getFormulaR1C1();
  if (currentFormula) return;

  const startRow = 5;
  for (let sourceRow = row - 1; sourceRow >= startRow; sourceRow--) {
    const formula = sheet.getRange(sourceRow, column).getFormulaR1C1();
    if (formula) {
      sheet.getRange(sourceRow, column).copyTo(sheet.getRange(row, column), SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
      return;
    }
  }
}

function prepareInfectionInputRow_(sheet, row) {
  sheet.getRange(row, 2, 1, 9).clearDataValidations();
  sheet.getRange(row, 12).clearDataValidations();
}

function getOrCreateSubmitSheet_(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headers = SUBMIT_SHEET_HEADERS[sheetName];
    if (headers) {
      sheet.appendRow(headers);
      const range = sheet.getRange(1, 1, 1, headers.length);
      range.setBackground("#1A3B8B");
      range.setFontColor("#FFFFFF");
      range.setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function appendSubmitRow_(sheet, sheetName, fields, now, fileName, fileLink) {
  if (sheetName === "응답_심폐소생술이수증") {
    sheet.appendRow([now, fields.name, fields.dept, fields.staffType,
      fields.completionDate, fields.institution, fileName, fileLink]);

  } else if (sheetName === "응답_결핵검진확인증") {
    sheet.appendRow([now, fields.name, fields.dept, fields.staffType,
      fields.checkupDate, fields.docType, fileName, fileLink]);

  } else if (sheetName === "응답_채용검진확인요청") {
    sheet.appendRow([now, fields.name, fields.dept, fields.staffType,
      fields.adminSubmitted, fields.submitPeriod, fields.note || ""]);

  } else if (sheetName === "응답_기타보건자료") {
    sheet.appendRow([now, fields.name, fields.dept, fields.staffType,
      fields.note || "", fileName, fileLink]);

  } else if (sheetName === "응답_교직원결핵검진유형선택") {
    const enabled       = getAppConfig_("결핵검진유형선택_사용");
    const startDateRaw  = getAppConfig_("결핵검진유형선택_접수시작");
    const endDateRaw    = getAppConfig_("결핵검진유형선택_접수마감");
    const closedMsg     = getAppConfig_("결핵검진유형선택_마감안내") || "접수 기한이 마감되었습니다.";
    const notStartedMsg = "접수 시작 전입니다. 접수 기간에 다시 이용해주세요.";

    if (String(enabled) !== "TRUE") throw new Error(closedMsg);

    const nowDate = new Date();

    if (startDateRaw) {
      const startDate = parseTbRegistrationDate_(startDateRaw, "start");
      if (startDate && nowDate < startDate) throw new Error(notStartedMsg);
    }

    if (endDateRaw) {
      const endDate = parseTbRegistrationDate_(endDateRaw, "end");
      if (endDate && nowDate > endDate) throw new Error(closedMsg);
    }

    const masterSheet = getSpreadsheet_().getSheetByName("교직원 결핵검진현황");
    if (masterSheet) {
      const data  = masterSheet.getDataRange().getValues();
      let found   = false;
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
        sheet.appendRow([now, fields.name, fields.dept, fields.registrationType, "명단 확인 필요"]);
        return;
      }
    }
    sheet.appendRow([now, fields.name, fields.dept, fields.registrationType, ""]);
  } else if (sheetName === "응답_인바디측정신청") {
    sheet.appendRow([now, fields.name, fields.dept, fields.preferredDate, fields.preferredTime]);
  } else {
    sheet.appendRow([now, JSON.stringify(fields), fileName, fileLink]);
  }
}

// ════════════════════════════════════════════════════════════════
// 보건실 소재 확인 API
// ════════════════════════════════════════════════════════════════

function setupHealthRoomStatusFeature() {
  ensureHealthRoomStatusSheets();
  Logger.log("보건실 소재 확인 설정 시트 초기화 완료");
}

function ensureHealthRoomStatusSheets() {
  const configSheet = getOrCreateHealthRoomSheet_(SHEET_NAMES.healthRoomShareConfig, ["항목", "값"]);
  ensureHealthRoomDefaultConfig_(configSheet);

  const authSheet = getOrCreateHealthRoomSheet_(SHEET_NAMES.healthRoomHomeroomAuth, ["학년", "반", "비밀번호"]);
  ensureHomeroomAuthDefaults_(authSheet);

  getOrCreateHealthRoomSheet_(SHEET_NAMES.healthRoomAccessLog, ["접속일시", "접근유형", "학년", "반", "성공여부", "메시지"]);
}

function normalizeHealthRoomApiResponse_(response, debugLabel) {
  const data = response || {};
  const success = data.success === true || data.result === "success";
  if (success) {
    data.success = true;
    data.result = "success";
    if (data.message === undefined) data.message = "";
  } else {
    data.success = false;
    data.result = "error";
    if (!data.message) data.message = "요청을 처리할 수 없습니다.";
  }
  if (data.debug === undefined) data.debug = debugLabel || "";
  return data;
}

function healthRoomApiError_(message, debug) {
  return {
    success: false,
    result: "error",
    message: message || "요청을 처리할 수 없습니다.",
    debug: debug || "",
  };
}

function getHealthRoomLocation_(params) {
  ensureHealthRoomStatusSheets();
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
      if (!config["교직원비밀번호"]) {
        logHealthRoomAccess_(accessType, grade, classNo, false);
        return { result: "error", message: "보건실 소재 확인 기능의 비밀번호가 아직 설정되지 않았습니다. 관리자에게 문의해 주세요." };
      }
      if (password !== String(config["교직원비밀번호"])) {
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
      const homeroomPassword = getHomeroomPassword_(grade, classNo);
      if (!homeroomPassword) {
        logHealthRoomAccess_(accessType, grade, classNo, false);
        return { result: "error", message: "보건실 소재 확인 기능의 비밀번호가 아직 설정되지 않았습니다. 관리자에게 문의해 주세요." };
      }
      if (password !== homeroomPassword) {
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
      if (!config["관리자비밀번호"]) {
        logHealthRoomAccess_(accessType, grade, classNo, false);
        return { result: "error", message: "보건실 소재 확인 기능의 비밀번호가 아직 설정되지 않았습니다. 관리자에게 문의해 주세요." };
      }
      if (password !== String(config["관리자비밀번호"])) {
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
  ensureHealthRoomStatusSheets();
  const rowId = Number(params.rowId || 0);
  const grade = String(params.grade || "").trim();
  const classNo = String(params.classNo || "").trim();
  const password = String(params.password || "");

  if (!rowId || rowId < 4) {
    logHealthRoomAccess_("homeroom-confirm", grade, classNo, false);
    return { result: "error", message: "확인할 기록을 찾을 수 없습니다." };
  }
  const homeroomPassword = getHomeroomPassword_(grade, classNo);
  if (!homeroomPassword) {
    logHealthRoomAccess_("homeroom-confirm", grade, classNo, false);
    return { result: "error", message: "보건실 소재 확인 기능의 비밀번호가 아직 설정되지 않았습니다. 관리자에게 문의해 주세요." };
  }
  if (password !== homeroomPassword) {
    logHealthRoomAccess_("homeroom-confirm", grade, classNo, false);
    return { result: "error", message: "학급 비밀번호가 올바르지 않습니다." };
  }

  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.visit);
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

function getMonthlyVisitRecords_(params) {
  ensureHealthRoomStatusSheets();
  const grade = String(params.grade || "").trim();
  const classNo = String(params.classNo || "").trim();
  const month = String(params.month || "").trim();
  const password = String(params.password || "");

  if (!grade || !classNo || !month || !password) {
    logHealthRoomAccess_("monthly-visit", grade, classNo, false, "missing parameter");
    return { result: "error", message: "학년, 반, 비밀번호, 조회 월을 모두 입력해 주세요." };
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    logHealthRoomAccess_("monthly-visit", grade, classNo, false, "invalid month");
    return { result: "error", message: "조회 월 형식이 올바르지 않습니다." };
  }

  const homeroomPassword = getHomeroomPassword_(grade, classNo);
  if (!homeroomPassword) {
    logHealthRoomAccess_("monthly-visit", grade, classNo, false, "password not configured");
    return { result: "error", message: "보건실 소재 확인 기능의 비밀번호가 아직 설정되지 않았습니다. 관리자에게 문의해 주세요." };
  }
  if (password !== homeroomPassword) {
    logHealthRoomAccess_("monthly-visit", grade, classNo, false, "wrong password");
    return { result: "error", message: "학급 비밀번호가 올바르지 않습니다." };
  }

  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.visit);
  if (!sheet) {
    logHealthRoomAccess_("monthly-visit", grade, classNo, false, "visit sheet missing");
    return { result: "error", message: SHEET_NAMES.visit + " 탭을 찾을 수 없습니다." };
  }

  const values = sheet.getDataRange().getDisplayValues();
  const records = [];
  let resultCount = 0;
  let unchecked = 0;

  for (let i = 3; i < values.length; i++) {
    const row = values[i];
    const rowDate = normalizeDateText_(row[0]);
    const rowGrade = String(row[2] || "").trim();
    const rowClass = String(row[3] || "").trim();
    if (!rowDate || rowDate.slice(0, 7) !== month) continue;
    if (rowGrade !== grade || rowClass !== classNo) continue;

    const result = String(row[12] || "").trim();
    const teacherChecked = isTruthy_(row[10]) ? "확인" : "미확인";
    if (result) resultCount++;
    if (teacherChecked !== "확인") unchecked++;

    records.push({
      date: formatMonthlyVisitDate_(rowDate, row[0]),
      number: String(row[4] || "").trim(),
      name: maskStudentName_(row[5]),
      inTime: String(row[6] || "").trim(),
      outTime: String(row[7] || "").trim(),
      stay: String(row[11] || "").trim(),
      result: result,
      teacherChecked: teacherChecked
    });
  }

  records.sort(function(a, b) {
    const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
    if (dateCompare !== 0) return dateCompare;
    return Number(a.number || 0) - Number(b.number || 0);
  });

  logHealthRoomAccess_("monthly-visit", grade, classNo, true);
  return {
    result: "success",
    grade: grade,
    classNo: classNo,
    month: month,
    summary: {
      total: records.length,
      resultCount: resultCount,
      unchecked: unchecked
    },
    records: records
  };
}

function formatMonthlyVisitDate_(rowDate, fallback) {
  const text = String(rowDate || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return match[1] + "." + match[2] + "." + match[3];
  return String(fallback || "").trim();
}

function getAdminVisitStats_(params) {
  const month = String(params.month || "").trim();
  const password = String(params.password || "");
  const correctPassword = getAppConfig_("관리자조회_비밀번호");

  if (!month || !password) {
    logHealthRoomAccess_("admin-stats", "", "", false, "missing parameter");
    return { result: "error", message: "관리자 비밀번호와 조회 월을 입력해 주세요." };
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    logHealthRoomAccess_("admin-stats", "", "", false, "invalid month");
    return { result: "error", message: "조회 월 형식이 올바르지 않습니다." };
  }
  if (!correctPassword) {
    logHealthRoomAccess_("admin-stats", "", "", false, "password not configured");
    return { result: "error", message: "관리자 조회 비밀번호가 아직 설정되지 않았습니다. 앱_설정 시트의 관리자조회_비밀번호 값을 확인해 주세요." };
  }
  if (password !== correctPassword) {
    logHealthRoomAccess_("admin-stats", "", "", false, "wrong password");
    return { result: "error", message: "관리자 비밀번호가 일치하지 않습니다." };
  }

  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.visit);
  if (!sheet) {
    logHealthRoomAccess_("admin-stats", "", "", false, "visit sheet missing");
    return { result: "error", message: SHEET_NAMES.visit + " 탭을 찾을 수 없습니다." };
  }

  const values = sheet.getDataRange().getDisplayValues();
  const summary = {
    total: 0,
    diseaseCount: 0,
    periodCount: 0,
    noResultCount: 0,
    uncheckedCount: 0
  };
  const gradeMap = {};
  const classMap = {};

  for (let i = 3; i < values.length; i++) {
    const row = values[i];
    const rowDate = normalizeDateText_(row[0]);
    if (!rowDate || rowDate.slice(0, 7) !== month) continue;

    const grade = String(row[2] || "").trim();
    const classNo = String(row[3] || "").trim();
    const result = String(row[12] || "").trim();
    const isChecked = isTruthy_(row[10]);
    if (!grade || !classNo) continue;

    summary.total++;
    if (result.indexOf("질병결과") >= 0) summary.diseaseCount++;
    else if (result.indexOf("생리결과") >= 0) summary.periodCount++;
    else summary.noResultCount++;
    if (!isChecked) summary.uncheckedCount++;

    if (!gradeMap[grade]) gradeMap[grade] = { grade: grade, total: 0 };
    gradeMap[grade].total++;

    const classKey = grade + "-" + classNo;
    if (!classMap[classKey]) {
      classMap[classKey] = {
        grade: grade,
        classNo: classNo,
        total: 0,
        diseaseCount: 0,
        periodCount: 0,
        noResultCount: 0,
        uncheckedCount: 0
      };
    }
    classMap[classKey].total++;
    if (result.indexOf("질병결과") >= 0) classMap[classKey].diseaseCount++;
    else if (result.indexOf("생리결과") >= 0) classMap[classKey].periodCount++;
    else classMap[classKey].noResultCount++;
    if (!isChecked) classMap[classKey].uncheckedCount++;
  }

  const gradeStats = Object.keys(gradeMap)
    .sort(compareNumericText_)
    .map(function(key) { return gradeMap[key]; });
  const classStats = Object.keys(classMap)
    .sort(function(a, b) {
      const partsA = a.split("-");
      const partsB = b.split("-");
      const gradeCompare = compareNumericText_(partsA[0], partsB[0]);
      if (gradeCompare !== 0) return gradeCompare;
      return compareNumericText_(partsA[1], partsB[1]);
    })
    .map(function(key) { return classMap[key]; });

  logHealthRoomAccess_("admin-stats", "", "", true);
  return {
    result: "success",
    month: month,
    summary: summary,
    gradeStats: gradeStats,
    classStats: classStats
  };
}

function compareNumericText_(a, b) {
  const numA = Number(a);
  const numB = Number(b);
  if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
  return String(a || "").localeCompare(String(b || ""));
}

function readHealthRoomRows_(options) {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.visit);
  if (!sheet) return [];

  const values = sheet.getDataRange().getDisplayValues();
  const todayDot = Utilities.formatDate(new Date(), TIMEZONE, "yyyy. MM. dd");
  const todayDash = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
  const items = [];

  for (let i = 3; i < values.length; i++) {
    const row = values[i];
    const rowDate = normalizeDateText_(row[0]);
    const rowGrade = String(row[2] || "").trim();
    const rowClass = String(row[3] || "").trim();
    const resultDetail = String(row[12] || "").trim();
    const returnedAt = String(row[7] || "").trim();
    const currentStatus = normalizeHealthRoomStatus_(String(row[1] || "").trim(), returnedAt, resultDetail);

    if (options.accessType === "subject" && !isWithinHealthRoomScope_(options.scope, rowDate, row[0], todayDash, todayDot)) continue;
    if (options.accessType !== "admin" && !isWithinHealthRoomScope_(options.scope, rowDate, row[0], todayDash, todayDot)) continue;
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
      base.date = rowDate || String(row[0] || "").trim();
      base.duration = String(row[11] || "").trim();
      base.attendanceNote = mapAttendanceNote_(resultDetail);
      base.homeroomConfirmed = isTruthy_(row[10]);
    }

    if (options.accessType === "admin") {
      base.date = rowDate || String(row[0] || "").trim();
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
  const sheet = getOrCreateHealthRoomSheet_(SHEET_NAMES.healthRoomShareConfig, ["항목", "값"]);
  ensureHealthRoomDefaultConfig_(sheet);
  const rows = sheet.getDataRange().getDisplayValues();
  const config = {};
  for (let i = 1; i < rows.length; i++) {
    const key = String(rows[i][0] || "").trim();
    if (key) config[key] = String(rows[i][1] || "").trim();
  }
  return config;
}

function ensureHealthRoomDefaultConfig_(sheet) {
  const defaults = [
    ["기능사용", "TRUE"],
    ["교직원비밀번호", "health2026"],
    ["관리자비밀번호", "admin2026"],
    ["이름표시방식", "마스킹"],
    ["교과교사표시범위", "오늘"],
    ["담임표시범위", "오늘+최근7일"],
    ["증상표시여부", "FALSE"],
    ["처치표시여부", "FALSE"],
    ["결과세부표시여부", "FALSE"],
  ];
  upsertKeyValueDefaults_(sheet, defaults);
}

function verifyHomeroomPassword_(grade, classNo, password) {
  return getHomeroomPassword_(grade, classNo) === String(password);
}

function getHomeroomPassword_(grade, classNo) {
  const sheet = getOrCreateHealthRoomSheet_(SHEET_NAMES.healthRoomHomeroomAuth, ["학년", "반", "비밀번호"]);
  ensureHomeroomAuthDefaults_(sheet);
  const rows = sheet.getDataRange().getDisplayValues();
  if (rows.length < 2) {
    return "";
  }
  for (let i = 1; i < rows.length; i++) {
    if (
      String(rows[i][0]).trim() === String(grade).trim() &&
      String(rows[i][1]).trim() === String(classNo).trim()
    ) {
      return String(rows[i][2] || "");
    }
  }
  return "";
}

function ensureHomeroomAuthDefaults_(sheet) {
  const defaults = [
    ["1", "1", "101-health"],
    ["1", "2", "102-health"],
    ["2", "1", "201-health"],
    ["3", "1", "301-health"],
  ];
  appendMissingHomeroomDefaults_(sheet, defaults);
}

function logHealthRoomAccess_(accessType, grade, classNo, success, message) {
  const sheet = getOrCreateHealthRoomSheet_(SHEET_NAMES.healthRoomAccessLog, ["접속일시", "접근유형", "학년", "반", "성공여부", "메시지"]);
  sheet.appendRow([
    Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm:ss"),
    accessType || "",
    grade || "",
    classNo || "",
    success ? "TRUE" : "FALSE",
    message || "",
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
  } else {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground("#1A3B8B")
      .setFontColor("#FFFFFF")
      .setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function upsertKeyValueDefaults_(sheet, defaults) {
  const values = sheet.getDataRange().getDisplayValues();
  const keyRows = {};
  for (let i = 1; i < values.length; i++) {
    const key = String(values[i][0] || "").trim();
    if (key) keyRows[key] = i + 1;
  }

  defaults.forEach(function(row) {
    const key = row[0];
    const defaultValue = row[1];
    const rowIndex = keyRows[key];
    if (rowIndex) {
      const current = sheet.getRange(rowIndex, 2).getDisplayValue();
      if (String(current || "").trim() === "") {
        sheet.getRange(rowIndex, 2).setValue(defaultValue);
      }
    } else {
      sheet.appendRow([key, defaultValue]);
    }
  });
}

function appendMissingHomeroomDefaults_(sheet, defaults) {
  const values = sheet.getDataRange().getDisplayValues();
  const existing = {};
  for (let i = 1; i < values.length; i++) {
    existing[String(values[i][0]).trim() + "-" + String(values[i][1]).trim()] = true;
  }
  defaults.forEach(function(row) {
    const key = String(row[0]).trim() + "-" + String(row[1]).trim();
    if (!existing[key]) sheet.appendRow(row);
  });
}

function isWithinHealthRoomScope_(scope, rowDate, rowRawDate, todayDash, todayDot) {
  const scopeText = String(scope || "오늘").trim().toLowerCase();
  const rawText = String(rowRawDate || "").trim();
  if (scopeText === "all" || scopeText === "전체") return true;
  if (rowDate === todayDash || rawText === todayDot) return true;
  if (scopeText === "오늘+최근7일" || scopeText === "recent7") {
    const today = new Date(todayDash + "T00:00:00");
    const target = new Date(rowDate + "T00:00:00");
    if (isNaN(target.getTime())) return false;
    const diffDays = Math.floor((today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000));
    return diffDays >= 0 && diffDays <= 7;
  }
  return false;
}

function normalizeDateText_(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return Utilities.formatDate(date, TIMEZONE, "yyyy-MM-dd");
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
  if (statusText.indexOf("입실") >= 0 || statusText.indexOf("이용") >= 0) return "현재 이용중";
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

// ════════════════════════════════════════════════════════════════
// 앱 설정 헬퍼
// ════════════════════════════════════════════════════════════════

function getAppConfig_(key) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("앱_설정");
  if (!sheet) return "";
  const data = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === key) return String(data[i][1] || "");
  }
  return "";
}

function verifyAdminMaster_(params) {
  const password = String(params.password || "");
  const correctPassword = getAppConfig_("관리자마스터_비밀번호");

  if (!password) {
    return { success: false, result: "error", message: "마스터 비밀번호를 입력해 주세요." };
  }
  if (!correctPassword) {
    return { success: false, result: "error", message: "관리자 마스터 비밀번호가 아직 설정되지 않았습니다. 앱_설정 시트를 확인해 주세요." };
  }
  if (password !== correctPassword) {
    return { success: false, result: "error", message: "마스터 비밀번호가 일치하지 않습니다." };
  }

  return {
    success: true,
    result: "success",
    receiptAlert: buildAdminReceiptAlert_(buildAdminReceiptSections_(getSpreadsheet_()))
  };
}

function getAdminReceiptSummary_(params) {
  const password = String(params.password || "");
  const correctPassword = getAppConfig_("관리자마스터_비밀번호");

  if (!password) {
    return { success: false, result: "error", message: "마스터 비밀번호를 입력해 주세요." };
  }
  if (!correctPassword) {
    return { success: false, result: "error", message: "관리자 마스터 비밀번호가 아직 설정되지 않았습니다. 앱_설정 시트를 확인해 주세요." };
  }
  if (password !== correctPassword) {
    return { success: false, result: "error", message: "마스터 비밀번호가 일치하지 않습니다." };
  }

  const sections = buildAdminReceiptSections_(getSpreadsheet_());

  return {
    success: true,
    result: "success",
    updatedAt: Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm:ss"),
    sections: sections,
    alert: buildAdminReceiptAlert_(sections)
  };
}

function buildAdminReceiptSections_(ss) {
  const submitReports = [
    summarizeAdminReceiptSheet_(ss, {
      id: "infection",
      label: "감염병 발생 보고",
      sheetName: SHEET_NAMES.infectionManagement,
      startRow: 5,
      dateColumn: 2,
      requiredColumns: [6, 7, 8]
    }),
    summarizeAdminReceiptSheet_(ss, {
      id: "tb",
      label: "결핵검진 확인증 제출",
      sheetName: "응답_결핵검진확인증",
      startRow: 2,
      dateColumn: 1,
      requiredColumns: [1]
    }),
    summarizeAdminReceiptSheet_(ss, {
      id: "cpr",
      label: "심폐소생술 이수증 제출",
      sheetName: "응답_심폐소생술이수증",
      startRow: 2,
      dateColumn: 1,
      requiredColumns: [1]
    }),
    summarizeAdminReceiptSheet_(ss, {
      id: "recruit",
      label: "채용검진 대체 확인 요청",
      sheetName: "응답_채용검진확인요청",
      startRow: 2,
      dateColumn: 1,
      requiredColumns: [1]
    })
  ];

  const eventApplications = [
    summarizeAdminReceiptSheet_(ss, {
      id: "inbody",
      label: "인바디 측정 신청",
      sheetName: "응답_인바디측정신청",
      startRow: 2,
      dateColumn: 1,
      requiredColumns: [1]
    })
  ];

  return [
    { id: "submitReports", title: "제출·보고 현황", items: submitReports },
    { id: "eventApplications", title: "이벤트 신청 현황", items: eventApplications }
  ];
}

function buildAdminReceiptAlert_(sections) {
  const alertItems = [];
  (sections || []).forEach(function(section) {
    (section.items || []).forEach(function(item) {
      if (["infection", "tb", "cpr", "inbody"].indexOf(item.id) === -1) return;
      alertItems.push({
        id: item.id,
        label: item.label,
        todayCount: Number(item.todayCount || 0),
        group: section.title
      });
    });
  });

  const totalToday = alertItems.reduce(function(sum, item) {
    return sum + Number(item.todayCount || 0);
  }, 0);

  return {
    totalToday: totalToday,
    items: alertItems
  };
}

function summarizeAdminReceiptSheet_(ss, options) {
  const sheet = ss.getSheetByName(options.sheetName);
  const today = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
  const summary = {
    id: options.id,
    label: options.label,
    sheetName: options.sheetName,
    totalCount: 0,
    todayCount: 0,
    recentReceivedAt: "",
    available: !!sheet
  };

  if (!sheet) return summary;

  const values = sheet.getDataRange().getDisplayValues();
  const startIndex = Math.max(Number(options.startRow || 2) - 1, 0);
  const dateIndex = Math.max(Number(options.dateColumn || 1) - 1, 0);
  const requiredIndexes = (options.requiredColumns || [options.dateColumn || 1])
    .map(function(column) { return Number(column) - 1; });

  for (let i = startIndex; i < values.length; i++) {
    const row = values[i] || [];
    const hasData = requiredIndexes.some(function(index) {
      return String(row[index] || "").trim() !== "";
    });
    if (!hasData) continue;

    summary.totalCount += 1;
    const receivedAt = String(row[dateIndex] || "").trim();
    const receivedDate = normalizeDateText_(receivedAt);
    if (receivedDate === today) summary.todayCount += 1;
    if (receivedAt) summary.recentReceivedAt = receivedAt;
  }

  return summary;
}

function getAdminInfectionReports_(params) {
  const password = String(params.password || "");
  const correctPassword = getAppConfig_("관리자마스터_비밀번호");

  if (!password) {
    return { success: false, result: "error", message: "마스터 비밀번호를 입력해 주세요." };
  }
  if (!correctPassword) {
    return { success: false, result: "error", message: "관리자 마스터 비밀번호가 아직 설정되지 않았습니다. 앱_설정 시트를 확인해 주세요." };
  }
  if (password !== correctPassword) {
    return { success: false, result: "error", message: "마스터 비밀번호가 일치하지 않습니다." };
  }

  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEET_NAMES.infectionManagement);
  if (!sheet) {
    return {
      success: false,
      result: "error",
      message: SHEET_NAMES.infectionManagement + " 탭을 찾을 수 없습니다."
    };
  }

  ensureInfectionStatusColumn_(sheet);
  return buildAdminInfectionReportsResponse_(sheet);
}

function buildAdminInfectionReportsResponse_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();
  const today = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
  const items = [];
  for (let i = 4; i < values.length; i++) {
    const row = values[i] || [];
    const name = String(row[5] || "").trim();
    const disease = String(row[6] || "").trim();
    const diagnosisDate = String(row[7] || "").trim();
    if (!name && !disease && !diagnosisDate) continue;

    const state = getInfectionReportState_(row, today);
    const receivedAt = String(row[1] || "").trim();
    const diagnosisKey = normalizeDateText_(diagnosisDate);
    const receivedKey = normalizeDateText_(receivedAt);
    const reportComplete = isTruthy_(row[10]);
    const memo = String(row[11] || "").trim();

    items.push({
      id: String(i + 1),
      receivedAt: receivedAt,
      occurredAt: diagnosisDate,
      grade: String(row[2] || "").trim(),
      classNumber: String(row[3] || "").trim(),
      studentNumber: String(row[4] || "").trim(),
      diseaseType: disease,
      diagnosisDate: diagnosisDate,
      exclusionStartDate: String(row[8] || "").trim(),
      exclusionEndDate: String(row[9] || "").trim(),
      status: state,
      homeroomNoticeStatus: reportComplete ? "보고 완료" : "시트 확인",
      memoStatus: memo ? "메모 있음 - 원본 시트 확인" : "메모 없음",
      sortKey: receivedKey || diagnosisKey || ""
    });
  }

  items.sort(function(a, b) {
    return String(b.sortKey || "").localeCompare(String(a.sortKey || ""));
  });

  const summary = {
    todayNewCount: 0,
    activeCount: 0,
    returnCheckCount: 0,
    closedCount: 0
  };

  items.forEach(function(item) {
    if (normalizeDateText_(item.receivedAt) === today) summary.todayNewCount += 1;
    if (item.status === "복귀 확인 필요") summary.returnCheckCount += 1;
    if (item.status === "종결") summary.closedCount += 1;
    else summary.activeCount += 1;
  });

  return {
    success: true,
    result: "success",
    updatedAt: Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm:ss"),
    summary: summary,
    items: items
  };
}

function getInfectionReportState_(row, today) {
  const savedStatus = String(row[13] || "").trim();
  if (isValidInfectionStatus_(savedStatus)) return savedStatus;

  if (isTruthy_(row[10])) return "종결";

  const receivedDate = normalizeDateText_(row[1]);
  const startDate = normalizeDateText_(row[8]);
  const endDate = normalizeDateText_(row[9]);

  if (endDate && endDate < today) return "복귀 확인 필요";
  if (startDate || endDate) return "관리 중";
  if (receivedDate === today) return "신규";
  return "확인 중";
}

function updateAdminInfectionReportStatus_(params) {
  const password = String(params.password || "");
  const rowId = Number(params.rowId || 0);
  const status = String(params.status || "").trim();
  const correctPassword = getAppConfig_("관리자마스터_비밀번호");

  if (!password) {
    return { success: false, result: "error", message: "마스터 비밀번호를 입력해 주세요." };
  }
  if (!correctPassword) {
    return { success: false, result: "error", message: "관리자 마스터 비밀번호가 아직 설정되지 않았습니다. 앱_설정 시트를 확인해 주세요." };
  }
  if (password !== correctPassword) {
    return { success: false, result: "error", message: "마스터 비밀번호가 일치하지 않습니다." };
  }
  if (!rowId || rowId < 5) {
    return { success: false, result: "error", message: "상태를 변경할 보고 행을 찾을 수 없습니다." };
  }
  if (!isValidInfectionStatus_(status)) {
    return { success: false, result: "error", message: "변경할 수 없는 상태값입니다." };
  }

  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.infectionManagement);
  if (!sheet || rowId > sheet.getLastRow()) {
    return { success: false, result: "error", message: "원본 감염병 보고 행을 찾을 수 없습니다." };
  }

  const row = sheet.getRange(rowId, 1, 1, 14).getDisplayValues()[0] || [];
  const hasReport = String(row[5] || "").trim() || String(row[6] || "").trim() || String(row[7] || "").trim();
  if (!hasReport) {
    return { success: false, result: "error", message: "원본 감염병 보고 행이 비어 있습니다." };
  }

  ensureInfectionStatusColumn_(sheet);
  sheet.getRange(rowId, 14).setValue(status);

  return buildAdminInfectionReportsResponse_(sheet);
}

function ensureInfectionStatusColumn_(sheet) {
  const headerRow = 4;
  const statusColumn = 14;
  const header = String(sheet.getRange(headerRow, statusColumn).getDisplayValue() || "").trim();
  if (!header) {
    sheet.getRange(headerRow, statusColumn).setValue("관리상태");
  }
}

function isValidInfectionStatus_(status) {
  return ["신규", "확인 중", "관리 중", "복귀 확인 필요", "종결"].indexOf(String(status || "").trim()) !== -1;
}

function parseTbRegistrationDate_(value, boundary) {
  if (!value) return null;

  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    const date = new Date(value.getTime());
    if (
      date.getHours() === 0 &&
      date.getMinutes() === 0 &&
      date.getSeconds() === 0 &&
      date.getMilliseconds() === 0
    ) {
      if (boundary === "end") date.setHours(23, 59, 59, 999);
      else date.setHours(0, 0, 0, 0);
    }
    return date;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.replace(/\s+/g, " ");
  const match = normalized.match(
    /^(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/
  );

  if (!match) {
    const fallback = new Date(raw);
    if (isNaN(fallback.getTime())) return null;

    if (
      boundary === "end" &&
      fallback.getHours() === 0 &&
      fallback.getMinutes() === 0 &&
      fallback.getSeconds() === 0 &&
      fallback.getMilliseconds() === 0
    ) {
      fallback.setHours(23, 59, 59, 999);
    }

    return fallback;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hasTime = match[4] !== undefined;

  if (hasTime) {
    return new Date(
      year,
      month - 1,
      day,
      Number(match[4]),
      Number(match[5]),
      Number(match[6] || 0),
      0
    );
  }

  if (boundary === "end") return new Date(year, month - 1, day, 23, 59, 59, 999);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}


// ════════════════════════════════════════════════════════════════
// 방문 요약 데이터
// ════════════════════════════════════════════════════════════════

function getVisitSummaryData_() {
  const ss    = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEET_NAMES.visit);
  if (!sheet) return { error: SHEET_NAMES.visit + " 탭을 찾을 수 없습니다." };
  const values    = sheet.getDataRange().getDisplayValues();
  const rows      = values.slice(3);
  const today     = Utilities.formatDate(new Date(), TIMEZONE, "yyyy. MM. dd");
  const todayRows = rows.filter(row => String(row[0]).trim() === today);
  const total      = todayRows.length;
  const returned   = todayRows.filter(row => String(row[1]).includes("복귀")).length;
  const medication = todayRows.filter(row => {
    const a = String(row[9]);
    return a.includes("약") || a.includes("투약") || a.includes("복용");
  }).length;
  const waiting = todayRows.filter(row => {
    const status  = String(row[1]);
    const outTime = String(row[7]).trim();
    return status.includes("입실") || status.includes("대기") || outTime === "";
  }).length;
  const logs = todayRows.slice(-4).reverse().map(row => {
    const status = row[1] || row[12];
    let color = "";
    if (String(status).includes("복귀")) color = "blue";
    if (String(status).includes("귀가")) color = "orange";
    if (String(status).includes("입실") || String(status).includes("대기")) color = "red";
    return [row[6], `${row[2]}-${row[3]}`, row[8], status, color];
  });
  return {
    summary: [
      [String(total), "전체"], [String(returned), "복귀"],
      [String(medication), "투약"], [String(waiting), "대기"]
    ],
    logs
  };
}

// ════════════════════════════════════════════════════════════════
// 포털 데이터
// ════════════════════════════════════════════════════════════════

function getPortalData_() {
  const ss = getSpreadsheet_();
  return {
    updatedAt: Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm:ss"),
    appConfig: {
      appName:       "세화여자고등학교 온라인 보건실",
      subtitle:      "보건 안내 확인부터 자료 제출까지 한 곳에서 간편하게.",
      description:   "보건 관련 안내와 제출 링크를 모바일에서도 쉽게 확인할 수 있도록 만든 교직원용 포털입니다.",
      privacyNotice: "학생 개인정보 및 민감정보는 앱 화면에 직접 표시하지 않습니다.",
      managerNote:   "제출 자료 확인 및 세부 관리는 보건업무시트에서 별도로 진행됩니다."
    },
    tbConfig: {
      enabled:       getAppConfig_("결핵검진유형선택_사용"),
      startDate:     getAppConfig_("결핵검진유형선택_접수시작"),
      endDate:       getAppConfig_("결핵검진유형선택_접수마감"),
      closedButton:  getAppConfig_("결핵검진유형선택_마감버튼") || getAppConfig_("결핵검진유형선택_마감후버튼"),
      closedMessage: getAppConfig_("결핵검진유형선택_마감안내"),
    },
    notices:     getNotices_(ss),
    uploads:     getUploads_(ss),
    checkups:    getCheckups_(ss),
    educations:  getEducations_(ss),
    studentCare: getStudentCare_(ss),
    resources:   getResources_(ss),
    messages:    getMessages_(ss),
    faqs:        getFaqs_(ss),
    roadmap:     getRoadmap_(ss)
  };
}

// ════════════════════════════════════════════════════════════════
// 공통 유틸
// ════════════════════════════════════════════════════════════════

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function jsonOutput_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getRows_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => String(h).trim());
  return values.slice(1)
    .map(row => {
      const item = {};
      headers.forEach((header, i) => { item[header] = row[i]; });
      return item;
    })
    .filter(item => isTrue_(item["사용여부"]))
    .sort((a, b) => Number(a["정렬순서"] || 999) - Number(b["정렬순서"] || 999));
}

function getValue_(row, names, fallback) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== "") return row[name];
  }
  return fallback || "";
}

function isTrue_(value) {
  const text = String(value).trim().toUpperCase();
  return text === "TRUE" || text === "사용" || text === "Y" || text === "YES" || text === "1";
}

function parseExposureDateBoundary_(value, boundary) {
  if (!value) return null;

  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    const date = new Date(value.getTime());
    if (
      date.getHours() === 0 &&
      date.getMinutes() === 0 &&
      date.getSeconds() === 0 &&
      date.getMilliseconds() === 0
    ) {
      if (boundary === "end") date.setHours(23, 59, 59, 999);
      else date.setHours(0, 0, 0, 0);
    }
    return date;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.replace(/\s+/g, " ");
  const match = normalized.match(
    /^(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/
  );

  if (!match) {
    const fallback = new Date(raw);
    if (isNaN(fallback.getTime())) return null;
    if (
      boundary === "end" &&
      fallback.getHours() === 0 &&
      fallback.getMinutes() === 0 &&
      fallback.getSeconds() === 0 &&
      fallback.getMilliseconds() === 0
    ) {
      fallback.setHours(23, 59, 59, 999);
    }
    return fallback;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hasTime = match[4] !== undefined;

  if (hasTime) {
    return new Date(
      year,
      month - 1,
      day,
      Number(match[4]),
      Number(match[5]),
      Number(match[6] || 0),
      0
    );
  }

  if (boundary === "end") return new Date(year, month - 1, day, 23, 59, 59, 999);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function getExposureState_(row, now) {
  const startRaw = getValue_(row, ["노출시작일"]);
  const endRaw = getValue_(row, ["노출종료일"]);
  if (!startRaw && !endRaw) return "visible";

  const start = parseExposureDateBoundary_(startRaw, "start");
  const end = parseExposureDateBoundary_(endRaw, "end");

  if (start && now.getTime() < start.getTime()) return "before";
  if (end && now.getTime() > end.getTime()) return "closed";
  return "visible";
}

function isVisibleByExposure_(row, now) {
  return getExposureState_(row, now || new Date()) === "visible";
}

function splitLines_(text) {
  if (!text) return [];
  return String(text).split(/\r?\n|<br\s*\/?>/i).map(v => v.trim()).filter(Boolean);
}

function getTitleLines_(row) {
  return [getValue_(row, ["제목1줄"]), getValue_(row, ["제목2줄"])].filter(Boolean);
}

// ════════════════════════════════════════════════════════════════
// 시트별 데이터 파싱
// ════════════════════════════════════════════════════════════════

function getNotices_(ss) {
  const now = new Date();
  return getRows_(ss, SHEET_NAMES.portalNotices).filter(r => isVisibleByExposure_(r, now)).map(r => ({
    title:       getValue_(r, ["제목"]),
    titleLines:  getTitleLines_(r),
    date:        getValue_(r, ["일시"]),
    target:      getValue_(r, ["대상"]),
    description: getValue_(r, ["내용","설명"]),
    actionText:  getValue_(r, ["이동안내","이동 안내"]),
    status:      getValue_(r, ["상태"], "안내 중"),
    badgeType:   getValue_(r, ["배지색"], "blue")
  }));
}

function getUploads_(ss) {
  const now = new Date();
  return getRows_(ss, SHEET_NAMES.portalUploads).filter(r => isVisibleByExposure_(r, now)).map(r => ({
    title:        getValue_(r, ["제목"]),
    titleLines:   getTitleLines_(r),
    description:  getValue_(r, ["설명"]),
    target:       getValue_(r, ["대상"]),
    documentType: getValue_(r, ["제출 자료","제출자료"]),
    deadline:     getValue_(r, ["마감"]),
    fileGuide:    getValue_(r, ["안내문"]),
    buttonText:   getValue_(r, ["버튼명"]),
    url:          getValue_(r, ["링크"]),
    status:       getValue_(r, ["상태"], "접수 중"),
    uploadType:   getValue_(r, ["유형"], "file"),
    highlight:    isTrue_(getValue_(r, ["강조"], ""))
  }));
}

function getCheckups_(ss) {
  const now = new Date();
  return getRows_(ss, SHEET_NAMES.portalCheckups).filter(r => isVisibleByExposure_(r, now)).map(r => ({
    title:          getValue_(r, ["제목"]),
    description:    getValue_(r, ["설명"]),
    target:         getValue_(r, ["대상"]),
    details:        splitLines_(getValue_(r, ["세부항목"])),
    buttonText:     getValue_(r, ["버튼명"]),
    url:            getValue_(r, ["링크"]),
    status:         getValue_(r, ["상태"], "안내 중"),
    displayMode:    getValue_(r, ["표시방식"], "link").toLowerCase(),
    operatingStatus:getValue_(r, ["운영표상태"]),
    imageUrl:       getValue_(r, ["이미지URL"]),
    downloadUrl:    getValue_(r, ["다운로드URL"]),
    secondaryText:  getValue_(r, ["보조버튼명"]),
    secondaryAction:getValue_(r, ["보조동작"]).toLowerCase(),
    copyText:       getValue_(r, ["복사문구"]),
    updateNotice:   getValue_(r, ["업데이트안내"])
  }));
}

function getEducations_(ss) {
  return getRows_(ss, SHEET_NAMES.portalEducations).map(r => ({
    title:        getValue_(r, ["교육명","제목"]),
    target:       getValue_(r, ["대상"]),
    duration:     getValue_(r, ["소요시간","시간"]),
    schedule:     getValue_(r, ["일정"]),
    description:  getValue_(r, ["설명"]),
    confirmation: getValue_(r, ["확인방법"]),
    buttonText:   getValue_(r, ["버튼명"]),
    url:          getValue_(r, ["링크"]),
    status:       getValue_(r, ["상태"], "자료")
  }));
}

function getStudentCare_(ss) {
  return getRows_(ss, SHEET_NAMES.portalStudentCare).map(r => {
    const title = getValue_(r, ["제목"]);
    const buttonText = getValue_(r, ["버튼명"]);
    const isHealthRoom =
      title === "보건실 소재 확인" ||
      title === "보건실 입실 현황 확인" ||
      buttonText === "보건실 소재 확인하기" ||
      buttonText === "보건실 입실현황 열기";

    if (isHealthRoom) {
      return {
        title: "보건실 소재 확인",
        description: "수업 중 보건실을 이용 중인 학생의 소재와 복귀 여부를 확인할 수 있습니다. 학생 건강정보, 증상, 처치내용은 표시하지 않습니다.",
        privacyNotice: "권한 있는 교직원에게만 최소정보를 제한적으로 표시합니다.",
        buttonText: "보건실 소재 확인하기",
        url: "",
        status: getValue_(r, ["상태"], "권한 필요")
      };
    }

    return {
      title,
      description:   getValue_(r, ["설명"]),
      privacyNotice: getValue_(r, ["개인정보안내","개인정보 안내"]),
      buttonText,
      url:           getValue_(r, ["링크"]),
      status:        getValue_(r, ["상태"], "권한 필요")
    };
  });
}

function getResources_(ss) {
  return getRows_(ss, SHEET_NAMES.portalResources).map(r => ({
    title:       getValue_(r, ["제목"]),
    category:    getValue_(r, ["카테고리"], "기타"),
    description: getValue_(r, ["설명"]),
    buttonText:  getValue_(r, ["버튼명"], "자료 열기"),
    url:         getValue_(r, ["링크"])
  }));
}

function getMessages_(ss) {
  return getRows_(ss, SHEET_NAMES.portalMessages).map(r => ({
    title:    getValue_(r, ["제목"]),
    category: getValue_(r, ["카테고리"], "기타"),
    content:  getValue_(r, ["문구"])
  }));
}

function getFaqs_(ss) {
  return getRows_(ss, SHEET_NAMES.portalFaqs).map(r => ({
    question: getValue_(r, ["질문"]),
    answer:   getValue_(r, ["답변"])
  }));
}

function getRoadmap_(ss) {
  const enabled = isTrue_(getAppConfig_("업무로드맵_사용"));
  const adminOnly = isTrue_(getAppConfig_("업무로드맵_관리자전용"));
  const items = enabled
    ? getRows_(ss, SHEET_NAMES.portalRoadmap).map(r => ({
        category:      getValue_(r, ["업무분류"]),
        taskName:      getValue_(r, ["업무명"]),
        step:          getValue_(r, ["단계"]),
        todo:          getValue_(r, ["지금할일"]),
        openMenus:     getValue_(r, ["온라인보건실_열메뉴"]),
        hideMenus:     getValue_(r, ["온라인보건실_숨김메뉴"]),
        audience:      getValue_(r, ["안내대상"]),
        messageTitle:  getValue_(r, ["메신저제목"]),
        messageBody:   getValue_(r, ["메신저문구"]),
        privacyNote:   getValue_(r, ["개인정보주의"]),
        relatedSheet:  getValue_(r, ["관련시트"]),
        relatedMenuId: getValue_(r, ["관련메뉴ID"]),
        relatedSheetUrl: getValue_(r, ["관련시트_URL"]),
        sheetUrl:      getValue_(r, ["관련시트_URL"]),
        tools:         getRoadmapTools_(r),
        sortOrder:     Number(getValue_(r, ["정렬순서"], "999") || 999)
      }))
    : [];
  return { enabled, adminOnly, items };
}

function getRoadmapTools_(row) {
  const tools = [];
  [1, 2, 3].forEach(function(index) {
    const name = getValue_(row, ["관련도구" + index + "_이름"]);
    if (!name) return;
    tools.push({
      name: name,
      type: String(getValue_(row, ["관련도구" + index + "_유형"], "info") || "info").trim().toLowerCase(),
      url: getValue_(row, ["관련도구" + index + "_URL"])
    });
  });
  return tools;
}

// ════════════════════════════════════════════════════════════════
// 테스트 함수
// ════════════════════════════════════════════════════════════════

function testPortalData() {
  Logger.log(JSON.stringify(getPortalData_(), null, 2));
}

function testVisitSummaryData() {
  Logger.log(JSON.stringify(getVisitSummaryData_(), null, 2));
}

function testHealthRoomLocationSubject() {
  Logger.log(JSON.stringify(getHealthRoomLocation_({
    accessType: "subject",
    password: getHealthRoomShareConfig_()["교직원비밀번호"]
  }), null, 2));
}

function testDoPost() {
  const fakeEvent = {
    postData: {
      contents: JSON.stringify({
        sheetName: "응답_심폐소생술이수증",
        folderId:  null,
        fields: {
          name: "홍길동", dept: "1학년부", staffType: "교사",
          completionDate: "2025-05-20", institution: "대한적십자사"
        },
        fileName: null, fileBase64: null, fileMimeType: null
      })
    }
  };
  Logger.log(doPost(fakeEvent).getContent());
}

function testSheetWrite() {
  const ss    = getSpreadsheet_();
  const sheet = getOrCreateSubmitSheet_(ss, "응답_결핵검진확인증");
  sheet.appendRow(["테스트", "홍길동", "1학년부", "교사", "2025-05-20", "결핵검진 확인증", "", ""]);
  Logger.log("완료: " + sheet.getName());
}

function testSheetName() {
  const ss = getSpreadsheet_();
  ss.getSheets().forEach(s => Logger.log("[" + s.getName() + "]"));
}

function testPostData() {
  const fakeEvent = {
    postData: {
      contents: '{"sheetName":"응답_결핵검진확인증","folderId":null,"fields":{"name":"테스트","dept":"1학년부","staffType":"교사","checkupDate":"2025-05-20","docType":"결핵검진 확인증"},"fileName":null,"fileBase64":null,"fileMimeType":null}',
      type: "text/plain"
    },
    parameter: {}
  };
  Logger.log(doPost(fakeEvent).getContent());
}

function testDriveAccess() {
  const folder = DriveApp.getFolderById("1MfxNVL1muROzpi1ZbV7WDWr4SKMU7ghm");
  Logger.log(folder.getName());
}

function testTbConfig() {
  Logger.log(JSON.stringify({
    enabled:       getAppConfig_("결핵검진유형선택_사용"),
    startDate:     getAppConfig_("결핵검진유형선택_접수시작"),
    endDate:       getAppConfig_("결핵검진유형선택_접수마감"),
    closedButton:  getAppConfig_("결핵검진유형선택_마감버튼") || getAppConfig_("결핵검진유형선택_마감후버튼"),
    closedMessage: getAppConfig_("결핵검진유형선택_마감안내"),
  }, null, 2));
}

function testVerifyPrivate() {
  const pw = getAppConfig_("요보호학생_비밀번호");
  Logger.log("[" + pw + "]");
  Logger.log("길이: " + pw.length);
}
