import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { strFromU8, unzipSync } from "fflate";
import { PNG } from "pngjs";
import { makeTrainingRosterXlsx, MAX_TEMPLATE_ROWS } from "./trainingFinalSheet.js";
import { PDFDocument } from "pdf-lib";
import { makeTrainingRosterPdf, ROWS_PER_PAGE } from "./trainingRosterPdf.js";

function png(width = 120, height = 40) {
  return PNG.sync.write(new PNG({ width, height, colorType: 6 }));
}

function model(rows) {
  return { event: { eventId: "EVENT-1", title: "교직원 심폐소생술교육", date: "2026-10-06", location: "강당" }, rows };
}

test("official roster template retains layout and maps A-E with the correct staffId-selected signatures", async () => {
  const requested = [];
  const bytes = await makeTrainingRosterXlsx(model([
    { staffId: "SAME-1", position: "교사", name: "동명이인", status: "서명완료", fileId: "2026/EVENT-1/request-1.png" },
    { staffId: "SAME-2", position: "시간강사", name: "동명이인", status: "미서명", fileId: "" },
    { staffId: "EXCLUDED", position: "교사", name: "제외대상", status: "제외", fileId: "2026/EVENT-1/request-x.png" },
  ]), { readSignature: async (storageKey) => { requested.push(storageKey); return png(); } });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const sheet = workbook.getWorksheet("Sheet1");
  assert.deepEqual(sheet.model.merges, ["A1:E1", "A2:E2"]);
  assert.equal(sheet.getColumn(2).width, 14.5);
  assert.equal(sheet.getColumn(3).width, 18.375);
  assert.equal(sheet.getColumn(4).width, 25.5);
  assert.equal(sheet.getRow(1).height, 61.5);
  assert.equal(sheet.getRow(3).height, 24.95);
  assert.equal(sheet.pageSetup.paperSize, 9);
  assert.equal(sheet.pageSetup.orientation, "portrait");
  assert.equal(sheet.pageSetup.fitToWidth, 1);
  assert.equal(sheet.pageSetup.printTitlesRow, "1:3");
  assert.deepEqual([sheet.getCell("A4").value, sheet.getCell("B4").value, sheet.getCell("C4").value, sheet.getCell("E4").value],
    [1, "교사", "동명이인", "10.6.(화)"]);
  assert.deepEqual([sheet.getCell("A5").value, sheet.getCell("B5").value, sheet.getCell("C5").value], [2, "시간강사", "동명이인"]);
  assert.equal(sheet.getCell("C6").value, null);
  assert.deepEqual(requested, ["2026/EVENT-1/request-1.png"]);
  assert.equal(sheet.getImages().length, 1);
  const image = sheet.getImages()[0];
  assert.equal(image.range.tl.nativeCol, 3);
  assert.equal(image.range.tl.nativeRow, 3);
});

test("roster supports multiple pages, Korean text, shared group signatures, and blank signature cells", async () => {
  const rows = Array.from({ length: 82 }, (_, index) => ({
    staffId: "STAFF-" + index, position: index % 2 ? "교사" : "행정직원", name: "교직원 " + (index + 1),
    status: index < 2 ? "서명완료" : "미서명", fileId: index < 2 ? "2026/GROUP/request-shared.png" : "",
  }));
  const requested = [];
  const bytes = await makeTrainingRosterXlsx(model(rows), { readSignature: async (key) => { requested.push(key); return png(240, 80); } });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const sheet = workbook.getWorksheet("Sheet1");
  assert.equal(sheet.getCell("C85").value, "교직원 82");
  assert.equal(sheet.getCell("E85").value, "10.6.(화)");
  assert.equal(sheet.pageSetup.printArea, "A1:E85");
  assert.equal(sheet.getImages().length, 2);
  assert.deepEqual(requested, ["2026/GROUP/request-shared.png", "2026/GROUP/request-shared.png"]);
  for (const image of sheet.getImages()) {
    assert.equal(image.range.ext.width <= 184, true);
    assert.equal(image.range.ext.height <= 25, true);
  }
  const entries = unzipSync(new Uint8Array(bytes));
  const worksheetXml = strFromU8(entries["xl/worksheets/sheet1.xml"]);
  assert.match(worksheetXml, /<brk id="23"/);
  assert.match(worksheetXml, /<brk id="44"/);
  assert.equal(/<brk id="85"/.test(worksheetXml), false);
  const drawingXml = strFromU8(entries["xl/drawings/drawing1.xml"]);
  assert.equal((drawingXml.match(/<xdr:oneCellAnchor\b/g) || []).length, 2);
});

test("roster rejects overflow and malformed signature bytes", async () => {
  const overflow = Array.from({ length: MAX_TEMPLATE_ROWS + 1 }, (_, index) => ({ staffId: String(index), name: String(index), status: "미서명" }));
  await assert.rejects(makeTrainingRosterXlsx(model(overflow)), /최대/);
  await assert.rejects(makeTrainingRosterXlsx(model([{ staffId: "S1", name: "테스트", status: "서명완료", fileId: "key" }]),
    { readSignature: async () => Buffer.from("not-png") }), /형식/);
});

test("pure JavaScript PDF renders A4 Korean roster pages and embedded signatures", async () => {
  const rows = Array.from({ length: ROWS_PER_PAGE + 1 }, (_, index) => ({
    staffId: `STAFF-${index}`, position: "교사", name: `교직원 ${index + 1}`,
    status: index === 0 ? "서명완료" : "미서명", fileId: index === 0 ? "training-signatures/2026/requests/test.png" : "",
  }));
  const requested = [];
  const bytes = await makeTrainingRosterPdf(model(rows), { readSignature: async (key) => { requested.push(key); return png(); } });
  assert.equal(bytes.subarray(0, 5).toString("ascii"), "%PDF-");
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 2);
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 595.28, height: 841.89 });
  assert.deepEqual(requested, ["training-signatures/2026/requests/test.png"]);
  assert.equal(Buffer.from(bytes).includes(Buffer.from("Apps Script")), false);
});

test("PDF roster keeps cancelled or excluded signatures out and rejects malformed signature bytes", async () => {
  const requested = [];
  await makeTrainingRosterPdf(model([
    { staffId: "ACTIVE", position: "교사", name: "정상", status: "서명완료", fileId: "training-signatures/2026/requests/active.png" },
    { staffId: "EXCLUDED", position: "교사", name: "제외", status: "제외", fileId: "training-signatures/2026/requests/excluded.png" },
  ]), { readSignature: async (key) => { requested.push(key); return png(); } });
  assert.deepEqual(requested, ["training-signatures/2026/requests/active.png"]);
  await assert.rejects(makeTrainingRosterPdf(model([
    { staffId: "ACTIVE", position: "교사", name: "정상", status: "서명완료", fileId: "training-signatures/2026/requests/active.png" },
  ]), { readSignature: async () => Buffer.from("not png") }), /형식/);
});
