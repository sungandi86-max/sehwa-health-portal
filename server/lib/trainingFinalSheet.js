import ExcelJS from "exceljs";

export async function makeTrainingFinalSheetXlsx(model, { readSignature } = {}) {
  if (!model?.event || !Array.isArray(model.rows)) throw new RangeError("서명부 자료를 확인해 주세요.");
  const imageRows = model.rows.map((row, index) => ({ index, fileId: row.fileId })).filter((row) => row.fileId);
  if (imageRows.length && typeof readSignature !== "function") throw new Error("서명 파일을 읽을 수 없습니다.");
  const images = new Map();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(6, imageRows.length) }, async () => {
    while (cursor < imageRows.length) {
      const next = imageRows[cursor++];
      images.set(next.index, await readSignature(next.fileId));
    }
  }));
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "온라인 보건실";
  const sheet = workbook.addWorksheet("최종 서명부", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: "frozen", ySplit: 3 }],
  });
  sheet.columns = [{ width: 7 }, { width: 17 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 25 }, { width: 25 }];
  sheet.mergeCells("A1:G1");
  sheet.getCell("A1").value = `${model.event.title} 최종 서명부`;
  sheet.getCell("A1").font = { name: "맑은 고딕", size: 15, bold: true, color: { argb: "FF102047" } };
  sheet.getRow(1).height = 34;
  sheet.mergeCells("A2:G2");
  sheet.getCell("A2").value = `${model.event.date} · ${model.event.location || "장소 미정"} · 대상 ${model.counts.target}명 · 서명 ${model.counts.signed}명 · 제외 ${model.counts.excluded}명`;
  sheet.getCell("A2").font = { name: "맑은 고딕", size: 10, color: { argb: "FF627083" } };
  sheet.getRow(2).height = 23;
  ["번호", "성명", "부서", "직책", "상태", "서명일시", "전자서명"].forEach((title, index) => { sheet.getRow(3).getCell(index + 1).value = title; });
  sheet.getRow(3).height = 26;
  sheet.getRow(3).eachCell((cell) => {
    cell.font = { name: "맑은 고딕", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D4EA6" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  for (const [index, person] of model.rows.entries()) {
    const row = sheet.addRow([index + 1, person.name, person.department, person.position, person.status, person.signedAt, person.fileId ? "" : person.method === "correction" ? "관리자 보정" : ""]);
    row.height = 58;
    row.eachCell((cell) => {
      cell.font = { name: "맑은 고딕", size: 10, color: { argb: "FF102047" } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDEAE7" } } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });
    if (person.fileId) {
      const bytes = images.get(index);
      const imageId = workbook.addImage({ buffer: bytes, extension: "png" });
      sheet.addImage(imageId, { tl: { col: 6.1, row: index + 3.1 }, br: { col: 6.9, row: index + 3.9 }, editAs: "oneCell" });
    }
  }
  sheet.autoFilter = { from: "A3", to: `G${Math.max(3, sheet.lastRow.number)}` };
  sheet.pageSetup.printTitlesRow = "1:3";
  sheet.pageSetup.printArea = `A1:G${Math.max(3, sheet.lastRow.number)}`;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function finalSheetFilename(event) {
  const safe = String(event.title || "교육").replace(/[\\/:*?"<>|\r\n]/g, "_").slice(0, 60);
  return `${event.date || "교육"}_${safe}_최종서명부.xlsx`;
}
