import { readGoogleSheetValues } from "./staffDirectory.js";
import { trainingCenterSpreadsheetId } from "./trainingDeployment.js";
import { trainingEventStore } from "./trainingEventStore.js";
import { TRAINING_HEADERS } from "./trainingEventSchema.js";

export const TRAINING_SHEETS = {
  targets: "교직원교육대상",
};

export { TRAINING_HEADERS };
export const TRAINING_RUNTIME_HEADERS = [...TRAINING_HEADERS, "ownerStaffId"];
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

export function buildTrainingView({ trainings, targets }, staffId, { eventId = "" } = {}) {
  const trainingRows = rowsWithHeaders(trainings, TRAINING_HEADERS).filter((row) => row.eventId && enabled(row["사용여부"]));
  if (new Set(trainingRows.map((row) => row.eventId)).size !== trainingRows.length) throw new TrainingSourceNotReadyError();
  const targetRows = rowsWithHeaders(targets, TARGET_HEADERS);
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
    materials: [],
  };
}

export async function readTrainingSheets({ events = trainingEventStore, targets: readTargets = readGoogleSheetValues, workbook = getTrainingSpreadsheetId } = {}) {
  const spreadsheetId = workbook();
  try {
    const [eventRows, targets] = await Promise.all([
      events.listEvents(),
      readTargets({ spreadsheetId, range: `'${TRAINING_SHEETS.targets}'!A1:Z10000` }),
    ]);
    const snapshotEvents = eventRows.filter((row) => row.targetSnapshot?.schemaVersion === 1);
    if (!snapshotEvents.length) return { trainings: [TRAINING_RUNTIME_HEADERS, ...eventRows.map((row) => TRAINING_RUNTIME_HEADERS.map((header) => row[header] || ""))], targets };
    const header = (targets[0] || []).map((value) => String(value ?? "").normalize("NFKC").trim());
    if (TARGET_HEADERS.some((name) => header.filter((value) => value === name).length !== 1)) throw new TrainingSourceNotReadyError();
    const snapshotIds = new Set(snapshotEvents.map((row) => row.eventId));
    if (events.environment !== "qa" && targets.slice(1).some((row) => snapshotIds.has(row[header.indexOf("eventId")]))) {
      throw new TrainingSourceNotReadyError();
    }
    const extra = ["snapshotName", "snapshotDepartment", "snapshotPosition"];
    const legacy = targets.slice(1).filter((row) => !snapshotIds.has(row[header.indexOf("eventId")]))
      .map((row) => [...TARGET_HEADERS.map((name) => row[header.indexOf(name)] || ""), "", "", ""]);
    const selected = snapshotEvents.flatMap((event) => event.targetSnapshot.members.map((person) => [event.eventId,
      person.staffId, person.targetStatus, person.required ? "Y" : "N", person.targetStatus === "제외" ? "Y" : "N",
      person.excludedReason || "", person.name, person.department, person.position]));
    return { trainings: [TRAINING_RUNTIME_HEADERS, ...eventRows.map((row) => TRAINING_RUNTIME_HEADERS.map((name) => row[name] || ""))],
      targets: [[...TARGET_HEADERS, ...extra], ...legacy, ...selected] };
  } catch (error) {
    if (error?.response?.status === 400) throw new TrainingSourceNotReadyError();
    throw error;
  }
}
