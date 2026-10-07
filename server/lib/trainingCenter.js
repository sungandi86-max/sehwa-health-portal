import { readGoogleSheetValues } from "./staffDirectory.js";
import { trainingCenterSpreadsheetId } from "./trainingDeployment.js";

export const TRAINING_SHEETS = {
  trainings: "앱_교직원교육",
  materials: "앱_교직원교육자료",
  targets: "교직원교육대상",
};

export const TRAINING_HEADERS = ["eventId", "eventGroupId", "교육연도", "사용여부", "상태", "교육명", "담당부서", "담당자", "일자", "시작시간", "종료시간", "장소", "교육내용", "이수기준", "signatureOpenAt", "signatureCloseAt", "정렬순서"];
export const MATERIAL_HEADERS = ["materialId", "eventId", "사용여부", "자료명", "자료유형", "링크 또는 파일ID", "정렬순서"];
export const TARGET_HEADERS = ["eventId", "교직원ID", "대상상태", "필수여부", "제외여부", "제외사유"];

export function getTrainingSpreadsheetId() {
  return trainingCenterSpreadsheetId();
}

export class TrainingSourceNotReadyError extends Error {
  constructor() {
    super("교직원 교육 자료가 아직 준비되지 않았습니다.");
    this.code = "training-source-not-ready";
  }
}

function value(cell) {
  return String(cell ?? "").normalize("NFKC").trim();
}

function rowsWithHeaders(values, requiredHeaders) {
  const headers = (values[0] || []).map(value);
  if (requiredHeaders.some((header) => !headers.includes(header))) throw new TrainingSourceNotReadyError();
  return values.slice(1).map((row) => Object.fromEntries(requiredHeaders.map((header) => [header, value(row[headers.indexOf(header)])])));
}

function enabled(valueText) {
  return ["사용", "TRUE", "Y", "1"].includes(valueText.toUpperCase());
}

function targetFor(eventId, staffId, targets) {
  const mine = targets.filter((row) => row.eventId === eventId && row["교직원ID"] === staffId);
  if (mine.length > 1) throw new TrainingSourceNotReadyError();
  const row = mine[0];
  if (!row) return { targetStatus: "대상 정보 없음", required: false };
  if (["TRUE", "Y", "O", "1", "예", "제외"].includes(row["제외여부"].toUpperCase()) || row["대상상태"] === "제외") return { targetStatus: "제외", required: false };
  const targetStatus = ["대상", "교육 대상"].includes(row["대상상태"])
    ? "교육 대상"
    : ["비대상", "대상 아님"].includes(row["대상상태"]) ? "대상 아님" : "대상 정보 없음";
  return { targetStatus, required: targetStatus === "교육 대상" && ["TRUE", "Y", "O", "1", "예", "필수"].includes(row["필수여부"].toUpperCase()) };
}

function publicTraining(row, staffId, targets) {
  const status = ["예정", "진행중", "완료", "비활성"].includes(row["상태"]) ? row["상태"] : "비활성";
  return {
    eventId: row.eventId,
    eventGroupId: row.eventGroupId,
    title: row["교육명"],
    status,
    date: row["일자"],
    startTime: row["시작시간"],
    endTime: row["종료시간"],
    location: row["장소"],
    department: row["담당부서"],
    ...targetFor(row.eventId, staffId, targets),
  };
}

export function buildTrainingView({ trainings, materials, targets }, staffId, { eventId = "" } = {}) {
  const trainingRows = rowsWithHeaders(trainings, TRAINING_HEADERS).filter((row) => row.eventId && enabled(row["사용여부"]));
  if (new Set(trainingRows.map((row) => row.eventId)).size !== trainingRows.length) throw new TrainingSourceNotReadyError();
  const targetRows = rowsWithHeaders(targets, TARGET_HEADERS);
  const materialRows = rowsWithHeaders(materials, MATERIAL_HEADERS);
  const selected = trainingRows.filter((row) => !eventId || row.eventId === eventId);
  if (eventId && selected.length !== 1) return null;
  const items = selected.map((row) => publicTraining(row, staffId, targetRows));
  if (!eventId) {
    const orderById = new Map(trainingRows.map((row) => [row.eventId, Number(row["정렬순서"] || 0)]));
    return items.sort((a, b) => (orderById.get(a.eventId) || 0) - (orderById.get(b.eventId) || 0) || a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  }
  const row = selected[0];
  return {
    ...items[0],
    description: row["교육내용"],
    materials: materialRows
      .filter((material) => material.eventId === eventId && enabled(material["사용여부"]))
      .sort((a, b) => Number(a["정렬순서"] || 0) - Number(b["정렬순서"] || 0))
      .map((material) => ({
        title: material["자료명"],
        type: material["자료유형"],
        url: /^https:\/\//i.test(material["링크 또는 파일ID"]) ? material["링크 또는 파일ID"] : "",
      })),
  };
}

export async function readTrainingSheets() {
  const spreadsheetId = getTrainingSpreadsheetId();
  try {
    const [trainings, materials, targets] = await Promise.all([
      readGoogleSheetValues({ spreadsheetId, range: `'${TRAINING_SHEETS.trainings}'!A1:Z2000` }),
      readGoogleSheetValues({ spreadsheetId, range: `'${TRAINING_SHEETS.materials}'!A1:Z4000` }),
      readGoogleSheetValues({ spreadsheetId, range: `'${TRAINING_SHEETS.targets}'!A1:Z10000` }),
    ]);
    return { trainings, materials, targets };
  } catch (error) {
    if (error?.response?.status === 400) throw new TrainingSourceNotReadyError();
    throw error;
  }
}
