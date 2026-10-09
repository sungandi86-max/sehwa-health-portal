import { createHash } from "node:crypto";

export const TRAINING_HEADERS = ["eventId", "eventGroupId", "교육연도", "사용여부", "상태", "교육명", "담당부서", "담당자", "일자", "시작시간", "종료시간", "장소", "교육내용", "이수기준", "signatureOpenAt", "signatureCloseAt", "정렬순서"];

const FIELDS = [
  ["eventId", "eventId"], ["eventGroupId", "eventGroupId"], ["교육연도", "trainingYear"],
  ["상태", "status"], ["교육명", "title"], ["담당부서", "department"],
  ["담당자", "manager"], ["일자", "date"], ["시작시간", "startTime"],
  ["종료시간", "endTime"], ["장소", "location"], ["교육내용", "description"],
  ["이수기준", "completionCriteria"], ["signatureOpenAt", "signatureOpenAt"],
  ["signatureCloseAt", "signatureCloseAt"], ["정렬순서", "sortOrder"],
];

const value = (input) => String(input ?? "").normalize("NFKC").trim();

export function trainingEventFingerprint(row) {
  return createHash("sha256").update(JSON.stringify(TRAINING_HEADERS.map((header) => value(row[header])))).digest("hex");
}

export function trainingEventFromSheetRow(row) {
  const event = Object.fromEntries(FIELDS.map(([header, field]) => [field, value(row[header])]));
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(event.eventId)) throw new RangeError("교육 ID가 올바르지 않습니다.");
  if (!/^\d{4}$/.test(event.trainingYear) || !/^-?\d+$/.test(event.sortOrder || "0")) throw new RangeError("교육 숫자 정보를 확인해 주세요.");
  event.trainingYear = Number(event.trainingYear);
  event.sortOrderText = event.sortOrder;
  event.sortOrder = Number(event.sortOrder || 0);
  event.useStatus = value(row["사용여부"]);
  event.enabled = ["사용", "TRUE", "Y", "1"].includes(event.useStatus.toUpperCase());
  return event;
}

export function trainingEventToSheetRow(event) {
  const row = Object.fromEntries(FIELDS.map(([header, field]) => [header, value(event[field])]));
  row["사용여부"] = value(event.useStatus) || (event.enabled === true ? "사용" : "미사용");
  row["정렬순서"] = value(event.sortOrderText) || row["정렬순서"];
  return Object.fromEntries(TRAINING_HEADERS.map((header) => [header, row[header]]));
}
