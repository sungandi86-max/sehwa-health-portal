import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { PNG } from "pngjs";

const TEMPLATE_URL = new URL("../templates/training-roster-cpr-2026.xlsx", import.meta.url);
const FIRST_DATA_ROW = 4;
const LAST_DATA_ROW = 98;
const MAX_TEMPLATE_ROWS = LAST_DATA_ROW - FIRST_DATA_ROW + 1;
const PAGE_BREAK_ROWS = [23, 44, 85];
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function safeFilename(value) {
  return String(value || "교육").replace(/[\\/:*?"<>|\r\n]/g, "_").slice(0, 60);
}

function trainingDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) throw new RangeError("교육 일자를 확인해 주세요.");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new RangeError("교육 일자를 확인해 주세요.");
  return `${Number(match[2])}.${Number(match[3])}.(${WEEKDAYS[date.getUTCDay()]})`;
}

function assertPng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 8 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new RangeError("서명 이미지 형식이 올바르지 않습니다.");
  }
}

function placeSignature(workbook, sheet, rowNumber, bytes) {
  assertPng(bytes);
  const image = PNG.sync.read(bytes);
  const cellWidthPx = Math.floor((sheet.getColumn(4).width || 8.43) * 7 + 5);
  const cellHeightPx = Math.max(1, Math.floor((sheet.getRow(rowNumber).height || 15) * 4 / 3));
  const scale = Math.min(1, cellWidthPx * 0.88 / image.width, cellHeightPx * 0.8 / image.height);
  const width = Math.max(1, Math.floor(image.width * scale));
  const height = Math.max(1, Math.floor(image.height * scale));
  const left = (cellWidthPx - width) / 2;
  const top = (cellHeightPx - height) / 2;
  const imageId = workbook.addImage({ buffer: bytes, extension: "png" });
  sheet.addImage(imageId, {
    tl: { col: 3 + left / cellWidthPx, row: rowNumber - 1 + top / cellHeightPx },
    ext: { width, height },
    editAs: "oneCell",
  });
}

async function readSignatures(rows, readSignature) {
  const withFiles = rows.map((row, index) => ({ index, fileId: row.fileId })).filter(({ fileId }) => fileId);
  if (withFiles.length && typeof readSignature !== "function") throw new Error("서명 파일을 읽을 수 없습니다.");
  const images = new Map();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(6, withFiles.length) }, async () => {
    while (cursor < withFiles.length) {
      const next = withFiles[cursor++];
      images.set(next.index, await readSignature(next.fileId));
    }
  }));
  return images;
}

export async function makeTrainingRosterXlsx(model, { readSignature, templateBytes } = {}) {
  if (!model?.event || !Array.isArray(model.rows)) throw new RangeError("연수등록부 자료를 확인해 주세요.");
  const rows = model.rows.filter((row) => row.status !== "제외");
  if (rows.length > MAX_TEMPLATE_ROWS) throw new RangeError(`연수등록부는 최대 ${MAX_TEMPLATE_ROWS}명까지 출력할 수 있습니다.`);
  const images = await readSignatures(rows, readSignature);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBytes || await readFile(TEMPLATE_URL));
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.name !== "Sheet1" || sheet.getCell("A3").value !== "연번" || sheet.getCell("D3").value !== "서명") {
    throw new Error("연수등록부 템플릿 구조를 확인해 주세요.");
  }

  const year = String(model.event.date).slice(0, 4);
  sheet.getCell("A1").value = {
    richText: [
      { font: { name: "맑은 고딕", family: 3, charset: 129, size: 14, bold: true }, text: `(${year}학년도 ${model.event.title}) 연수 등록부` },
      { font: { name: "맑은 고딕", family: 3, charset: 129, size: 18, bold: true }, text: "\n                                               " },
      { font: { name: "맑은 고딕", family: 3, charset: 129, size: 11 }, text: "세화여자고등학교" },
    ],
  };
  sheet.getCell("A2").value = {
    richText: [
      { font: { name: "맑은 고딕", family: 3, charset: 129, size: 12 }, text: `◈ 일시: ${model.event.date}` },
      { font: { name: "맑은 고딕", family: 3, charset: 129, size: 12 }, text: "\n" },
      { font: { name: "맑은 고딕", family: 3, charset: 129, size: 12 }, text: `◈ 장소: ${model.event.location || "장소 미정"}` },
    ],
  };

  for (let rowNumber = FIRST_DATA_ROW; rowNumber <= LAST_DATA_ROW; rowNumber += 1) {
    for (let column = 1; column <= 5; column += 1) sheet.getRow(rowNumber).getCell(column).value = null;
  }
  const dateLabel = trainingDate(model.event.date);
  rows.forEach((person, index) => {
    const rowNumber = FIRST_DATA_ROW + index;
    const row = sheet.getRow(rowNumber);
    row.getCell(1).value = index + 1;
    row.getCell(2).value = person.position || "";
    row.getCell(3).value = person.name || "";
    row.getCell(5).value = dateLabel;
    if (images.has(index)) placeSignature(workbook, sheet, rowNumber, images.get(index));
  });
  const lastRow = Math.max(FIRST_DATA_ROW, FIRST_DATA_ROW + rows.length - 1);
  for (const rowNumber of PAGE_BREAK_ROWS) {
    if (rowNumber < lastRow) sheet.getRow(rowNumber).addPageBreak(1, 5);
  }
  sheet.pageSetup.printArea = `A1:E${lastRow}`;
  sheet.pageSetup.printTitlesRow = "1:3";
  workbook.creator = "온라인 보건실";
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function trainingRosterPdfFilename(event) {
  return `${event.date || "교육"}_${safeFilename(event.title)}_연수등록부.pdf`;
}

export function trainingRosterXlsxFilename(event) {
  return `${event.date || "교육"}_${safeFilename(event.title)}_연수등록부.xlsx`;
}

export async function trainingRosterTemplateHash() {
  return createHash("sha256").update(await readFile(TEMPLATE_URL)).digest("hex");
}

export { FIRST_DATA_ROW, LAST_DATA_ROW, MAX_TEMPLATE_ROWS, PAGE_BREAK_ROWS, TEMPLATE_URL };
