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
        closedButton:  getAppConfig_("결핵검진유형선택_마감후버튼"),
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

// ════════════════════════════════════════════════════════════════
// doPost
// ════════════════════════════════════════════════════════════════

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    const payload = JSON.parse(e.postData.contents);
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
    const enabled    = getAppConfig_("결핵검진유형선택_사용");
    const endDateRaw = getAppConfig_("결핵검진유형선택_접수마감");
    const closedMsg  = getAppConfig_("결핵검진유형선택_마감안내") || "접수 기한이 마감되었습니다.";

    if (enabled !== "TRUE") throw new Error(closedMsg);
    if (endDateRaw) {
      const endDate = new Date(endDateRaw);
      if (new Date() > endDate) throw new Error(closedMsg);
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
      closedButton:  getAppConfig_("결핵검진유형선택_마감후버튼"),
      closedMessage: getAppConfig_("결핵검진유형선택_마감안내"),
    },
    notices:     getNotices_(ss),
    uploads:     getUploads_(ss),
    checkups:    getCheckups_(ss),
    educations:  getEducations_(ss),
    studentCare: getStudentCare_(ss),
    resources:   getResources_(ss),
    messages:    getMessages_(ss),
    faqs:        getFaqs_(ss)
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
  return getRows_(ss, SHEET_NAMES.portalNotices).map(r => ({
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
  return getRows_(ss, SHEET_NAMES.portalUploads).map(r => ({
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
  return getRows_(ss, SHEET_NAMES.portalCheckups).map(r => ({
    title:       getValue_(r, ["제목"]),
    description: getValue_(r, ["설명"]),
    target:      getValue_(r, ["대상"]),
    details:     splitLines_(getValue_(r, ["세부항목"])),
    buttonText:  getValue_(r, ["버튼명"]),
    url:         getValue_(r, ["링크"]),
    status:      getValue_(r, ["상태"], "안내 중")
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
    closedButton:  getAppConfig_("결핵검진유형선택_마감후버튼"),
    closedMessage: getAppConfig_("결핵검진유형선택_마감안내"),
  }, null, 2));
}

function testVerifyPrivate() {
  const pw = getAppConfig_("요보호학생_비밀번호");
  Logger.log("[" + pw + "]");
  Logger.log("길이: " + pw.length);
}
