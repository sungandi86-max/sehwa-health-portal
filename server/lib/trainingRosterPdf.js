import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import fontkit from "@pdf-lib/fontkit";
import { degrees, PDFDocument, popGraphicsState, pushGraphicsState, rgb, setLineWidth, setTextRenderingMode, TextRenderingMode } from "pdf-lib";
import { PNG } from "pngjs";
import { MAX_TEMPLATE_ROWS } from "./trainingFinalSheet.js";

const require = createRequire(import.meta.url);
const FONT_PATH = require.resolve("@expo-google-fonts/noto-sans-kr/400Regular/NotoSansKR_400Regular.ttf");
const A4 = [595.28, 841.89];
const MARGIN_X = 51.02;
const MARGIN_Y = 53.86;
const TITLE_HEIGHT = 61.5;
const INFO_HEIGHT = 135.75;
const HEADER_HEIGHT = 24.95;
const ROW_HEIGHT = 23.25;
const ROWS_PER_PAGE = 22;
const COLUMN_UNITS = [13, 14.5, 18.375, 25.5, 13];
const HEADERS = ["연번", "직위", "성명", "서명", "연수일자"];
const TITLE_FILL = rgb(1, 1, 0);
const HEADER_FILL = rgb(242 / 255, 246 / 255, 172 / 255);
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function assertPng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < PNG_MAGIC.length || !bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new RangeError("서명 이미지 형식이 올바르지 않습니다.");
  }
}

function dateLabel(value, includeYear = false) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) throw new RangeError("교육 일자를 확인해 주세요.");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== value) throw new RangeError("교육 일자를 확인해 주세요.");
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getUTCDay()];
  return includeYear
    ? `${match[1]}. ${Number(match[2])}. ${Number(match[3])}.(${weekday})`
    : `${Number(match[2])}.${Number(match[3])}.(${weekday})`;
}

async function signatureImages(pdf, rows, readSignature) {
  const entries = rows.map((row, index) => ({ index, storageKey: row.fileId })).filter((item) => item.storageKey);
  if (entries.length && typeof readSignature !== "function") throw new Error("서명 파일을 읽을 수 없습니다.");
  const images = new Map();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(6, entries.length) }, async () => {
    while (cursor < entries.length) {
      const entry = entries[cursor++];
      const bytes = await readSignature(entry.storageKey);
      assertPng(bytes);
      const dimensions = PNG.sync.read(bytes);
      images.set(entry.index, { image: await pdf.embedPng(bytes), width: dimensions.width, height: dimensions.height });
    }
  }));
  return images;
}

function drawText(page, text, options, bold = false) {
  if (bold) page.pushOperators(pushGraphicsState(), setLineWidth(0.35), setTextRenderingMode(TextRenderingMode.FillAndOutline));
  page.drawText(text, options);
  if (bold) page.pushOperators(popGraphicsState());
}

function centeredText(page, font, text, size, x, y, width, height, bold = false) {
  const value = String(text ?? "");
  let fittedSize = size;
  while (fittedSize > 6.5 && font.widthOfTextAtSize(value, fittedSize) > width - 6) fittedSize -= 0.5;
  const textWidth = font.widthOfTextAtSize(value, fittedSize);
  drawText(page, value, { x: x + Math.max(3, (width - textWidth) / 2), y: y + (height - fittedSize) / 2 + 2,
    size: fittedSize, font, color: rgb(0, 0, 0), maxWidth: Math.max(1, width - 6) }, bold);
}

function drawDiamond(page, x, y) {
  page.drawRectangle({ x, y, width: 9, height: 9, rotate: degrees(45), color: rgb(0, 0, 0) });
  page.drawRectangle({ x, y: y + 1.4, width: 7, height: 7, rotate: degrees(45), color: rgb(1, 1, 1) });
  page.drawRectangle({ x, y: y + 2.8, width: 5, height: 5, rotate: degrees(45), color: rgb(0, 0, 0) });
}

function drawCell(page, x, y, width, height, { fill } = {}) {
  if (fill) page.drawRectangle({ x, y, width, height, color: fill });
  page.drawRectangle({ x, y, width, height, borderColor: rgb(0, 0, 0), borderWidth: 0.7 });
}

function columnGeometry() {
  const available = A4[0] - MARGIN_X * 2;
  const unit = available / COLUMN_UNITS.reduce((sum, value) => sum + value, 0);
  const widths = COLUMN_UNITS.map((value) => value * unit);
  const starts = [];
  widths.reduce((x, width) => { starts.push(x); return x + width; }, MARGIN_X);
  return { starts, widths };
}

function drawPageHeader(page, font, event, geometry) {
  let top = A4[1] - MARGIN_Y;
  const totalWidth = geometry.widths.reduce((sum, value) => sum + value, 0);
  const year = String(event.date).slice(0, 4);
  top -= TITLE_HEIGHT;
  drawCell(page, MARGIN_X, top, totalWidth, TITLE_HEIGHT, { fill: TITLE_FILL });
  centeredText(page, font, `(${year}학년도 ${event.title}) 연수 등록부`, 14,
    MARGIN_X, top + 26, totalWidth, 30, true);
  const school = "세화여자고등학교";
  page.drawText(school, { x: MARGIN_X + totalWidth - font.widthOfTextAtSize(school, 11) - 8,
    y: top + 10, size: 11, font });
  top -= INFO_HEIGHT;
  const dateY = top + INFO_HEIGHT - 30;
  const locationY = top + INFO_HEIGHT - 54;
  drawDiamond(page, MARGIN_X + 8, dateY + 3);
  drawDiamond(page, MARGIN_X + 8, locationY + 3);
  page.drawText(`일시: ${dateLabel(event.date, true)}`, { x: MARGIN_X + 21, y: dateY, size: 12, font });
  page.drawText(`장소: ${event.location || "장소 미정"}`, { x: MARGIN_X + 21, y: locationY, size: 12, font });
  top -= HEADER_HEIGHT;
  geometry.starts.forEach((x, index) => {
    drawCell(page, x, top, geometry.widths[index], HEADER_HEIGHT, { fill: HEADER_FILL });
    centeredText(page, font, HEADERS[index], 12, x, top, geometry.widths[index], HEADER_HEIGHT, true);
  });
  return top;
}

export async function makeTrainingRosterPdf(model, { readSignature, fontBytes } = {}) {
  if (!model?.event || !Array.isArray(model.rows)) throw new RangeError("연수등록부 자료를 확인해 주세요.");
  const rows = model.rows.filter((row) => row.status !== "제외");
  if (rows.length > MAX_TEMPLATE_ROWS) throw new RangeError(`연수등록부는 최대 ${MAX_TEMPLATE_ROWS}명까지 출력할 수 있습니다.`);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes || await readFile(FONT_PATH), { subset: false });
  const images = await signatureImages(pdf, rows, readSignature);
  const geometry = columnGeometry();
  const trainingDate = dateLabel(model.event.date);
  const pageCount = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = pdf.addPage(A4);
    let y = drawPageHeader(page, font, model.event, geometry);
    const start = pageIndex * ROWS_PER_PAGE;
    const pageRows = rows.slice(start, start + ROWS_PER_PAGE);
    pageRows.forEach((person, localIndex) => {
      const globalIndex = start + localIndex;
      y -= ROW_HEIGHT;
      const values = [globalIndex + 1, person.position || "", person.name || "", "", trainingDate];
      geometry.starts.forEach((x, columnIndex) => {
        drawCell(page, x, y, geometry.widths[columnIndex], ROW_HEIGHT);
        if (columnIndex !== 3) centeredText(page, font, values[columnIndex], 12, x, y, geometry.widths[columnIndex], ROW_HEIGHT);
      });
      const signature = images.get(globalIndex);
      if (signature) {
        const width = geometry.widths[3] * 0.86;
        const height = ROW_HEIGHT * 0.72;
        const scale = Math.min(1, width / signature.width, height / signature.height);
        const imageWidth = signature.width * scale;
        const imageHeight = signature.height * scale;
        page.drawImage(signature.image, { x: geometry.starts[3] + (geometry.widths[3] - imageWidth) / 2,
          y: y + (ROW_HEIGHT - imageHeight) / 2, width: imageWidth, height: imageHeight });
      }
    });
  }

  pdf.setCreator("온라인 보건실");
  pdf.setProducer("온라인 보건실 교직원 교육센터");
  pdf.setTitle(`${model.event.title} 연수 등록부`);
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

export const trainingRosterPdfRenderer = {
  render: ({ model, readSignature }) => makeTrainingRosterPdf(model, { readSignature }),
};

export { A4, COLUMN_UNITS, FONT_PATH, ROWS_PER_PAGE };
