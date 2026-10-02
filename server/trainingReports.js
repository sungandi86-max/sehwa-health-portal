import ExcelJS from "exceljs";
import { buildPlan, buildSnapshotPlan } from "./healthMandatoryTrainingAnalysis.js";
import { assertSafeApply, getResearchTrainingSummary } from "./healthMandatoryTrainingDryRun.js";

export const TRAINING_REPORTS = {
  violence: {
    title: "4대폭력예방",
    course: "4대폭력예방",
    filename: "2026_교직원_4대폭력예방_이수명부.xlsx",
    headers: ["연번", "직위", "성명", "연수과정명", "이수번호"],
  },
  disability: {
    title: "장애인식개선(사회적)",
    course: "장애인식개선(사회적)",
    filename: "2026_교직원_장애인식개선_사회적_이수명부.xlsx",
    headers: ["연번", "직위", "성명", "교육명", "이수번호"],
  },
  childAbuse: {
    title: "아동학대 신고의무자교육",
    filename: "2026_아동학대_신고의무자교육_이수명부.xlsx",
    headers: ["연번", "직위", "성명", "이수번호", "교육수료일"],
  },
};

const text = (value) => String(value ?? "").normalize("NFKC").trim();

function dateFromSheet(value) {
  const source = text(value);
  if (!source) return null;
  const match = source.match(/^(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})\.?$/);
  if (!match) return "invalid";
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return "invalid";
  }
  return parsed;
}

function flag(value) {
  const normalized = text(value);
  if (!normalized) return false;
  if (normalized === "O") return true;
  throw new Error("교직원명단의 실적 분류값을 확인해야 합니다.");
}

function subgroupCounts(rows, key) {
  const selected = rows.filter(({ match }) => flag(match[key]));
  return {
    target: selected.length,
    completed: selected.filter(({ sourceRow }) => text(sourceRow.sourceStatus) === "이수완료").length,
  };
}

export function buildTrainingReportModel({ reportId, source, exceptions, directory, directoryStats = null, taskEnabled = true }) {
  const report = TRAINING_REPORTS[reportId];
  if (!report) throw new Error("지원하지 않는 보고서입니다.");

  const plan = buildPlan(source.rows, directory, exceptions, 2026);
  const snapshotPlan = buildSnapshotPlan(source.rows, directory, exceptions, { taskYear: 2026 });
  assertSafeApply(source, exceptions, plan, snapshotPlan, taskEnabled);
  if (source.headerInfo.indexes.completionNumber === null) {
    throw new Error("연구부 시트에서 이수 번호 열을 찾지 못했습니다.");
  }
  if (reportId === "childAbuse" && source.headerInfo.indexes.completionDate === null) {
    throw new Error("연구부 시트에서 교육수료일 열을 찾지 못했습니다.");
  }
  if (reportId === "violence" && directoryStats?.reportFlagColumnsPresent === false) {
    throw new Error("교직원명단의 실적 분류 열을 확인해야 합니다.");
  }

  const current = plan.matchedActiveItems;
  const completed = current.filter(({ sourceRow }) => text(sourceRow.sourceStatus) === "이수완료");
  const certificateMissing = completed.filter(({ sourceRow }) => !String(sourceRow.completionNumber ?? "").trim()).length;
  const dateMissing = completed.filter(({ sourceRow }) => !text(sourceRow.completionDate)).length;
  const invalidDates = completed.filter(({ sourceRow }) => {
    return text(sourceRow.completionDate) && dateFromSheet(sourceRow.completionDate) === "invalid";
  }).length;
  const reasons = [];
  if (certificateMissing) reasons.push(`이수완료자의 이수번호 누락 ${certificateMissing}건`);
  if (reportId === "childAbuse" && invalidDates) reasons.push(`교육수료일 형식 오류 ${invalidDates}건`);

  let performance = null;
  if (reportId === "violence") {
    performance = {
      all: { target: current.length, completed: completed.length },
      senior: subgroupCounts(current, "seniorLeader"),
      newEmployee: subgroupCounts(current, "newEmployee"),
      nonRegular: subgroupCounts(current, "nonRegular"),
      principalCompleted: (() => {
        const principals = current.filter(({ match }) => text(match.position) === "교장");
        if (principals.length !== 1) return null;
        return text(principals[0].sourceRow.sourceStatus) === "이수완료";
      })(),
    };
  }

  const rows = completed.map(({ sourceRow, match }, index) => ({
    no: index + 1,
    position: match.position,
    name: match.name,
    certificateNumber: String(sourceRow.completionNumber ?? ""),
    completionDate: dateFromSheet(sourceRow.completionDate),
  }));
  return {
    reportId,
    report,
    rows,
    preview: {
      title: report.title,
      headers: report.headers,
      targetCount: current.length,
      completedCount: completed.length,
      unknownCount: plan.unknown,
      incompleteCount: plan.incomplete,
      certificateMissing,
      completionDateMissing: reportId === "childAbuse" ? dateMissing : undefined,
      invalidDates: reportId === "childAbuse" ? invalidDates : undefined,
      canDownload: reasons.length === 0,
      blockingReasons: reasons,
      sampleRows: rows.slice(0, 5).map(({ no, position, name, completionDate }) => ({
        no, position, name,
        ...(reportId === "childAbuse" ? { completionDate: completionDate instanceof Date ? completionDate.toISOString().slice(0, 10) : "" } : {}),
      })),
      performance,
      ...(reportId === "childAbuse" ? {
        resultReport: {
          institutionName: "세화여자고등학교",
          address: null,
          principal: (() => {
            const principals = directory.filter((item) => item.employmentStatus === "재직" && item.position === "교장");
            return principals.length === 1 ? principals[0].name : null;
          })(),
          totalCount: current.length,
          completedCount: completed.length,
          educationHours: null,
          educationMethod: null,
        },
      } : {}),
    },
  };
}

export async function readTrainingReportModel({ db, reportId }) {
  const { source, exceptions, directory, directoryStats, taskSnapshot } = await getResearchTrainingSummary({ db });
  return buildTrainingReportModel({
    reportId, source, exceptions, directory, directoryStats,
    taskEnabled: taskSnapshot?.exists === true && taskSnapshot.data()?.enabled === true,
  });
}

export async function makeTrainingReportXlsx(model) {
  if (!model.preview.canDownload) throw new Error("보고서 생성 전 누락 항목을 확인해야 합니다.");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "온라인 보건실";
  const sheet = workbook.addWorksheet("이수명부", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: "frozen", ySplit: 3 }],
  });
  sheet.columns = [{ width: 9 }, { width: 18 }, { width: 18 }, { width: 34 }, { width: 42 }];
  sheet.mergeCells("A1:E1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `2026학년도 ${model.report.title} 이수명부`;
  titleCell.font = { name: "맑은 고딕", size: 15, bold: true, color: { argb: "FF102047" } };
  titleCell.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 32;
  sheet.mergeCells("A2:E2");
  sheet.getCell("A2").value = `대상 ${model.preview.targetCount}명 · 이수 ${model.preview.completedCount}명 · 확인필요 ${model.preview.unknownCount}명`;
  sheet.getCell("A2").font = { name: "맑은 고딕", size: 10, color: { argb: "FF627083" } };
  sheet.getRow(2).height = 22;

  const header = sheet.getRow(3);
  model.report.headers.forEach((label, index) => { header.getCell(index + 1).value = label; });
  header.height = 24;
  header.eachCell((cell) => {
    cell.font = { name: "맑은 고딕", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D4EA6" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  model.rows.forEach((item) => {
    const values = model.reportId === "childAbuse"
      ? [item.no, item.position, item.name, item.certificateNumber, item.completionDate instanceof Date ? item.completionDate : ""]
      : [item.no, item.position, item.name, model.report.course, item.certificateNumber];
    const row = sheet.addRow(values);
    row.height = 22;
    row.eachCell((cell) => {
      cell.font = { name: "맑은 고딕", size: 10, color: { argb: "FF102047" } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDEAE7" } } };
      cell.alignment = { vertical: "middle" };
    });
    row.getCell(model.reportId === "childAbuse" ? 4 : 5).numFmt = "@";
    if (model.reportId === "childAbuse" && item.completionDate instanceof Date) row.getCell(5).numFmt = "yyyy-mm-dd";
  });
  sheet.autoFilter = { from: "A3", to: `E${Math.max(sheet.lastRow.number, 3)}` };
  sheet.pageSetup.printTitlesRow = "1:3";
  sheet.pageSetup.printArea = `A1:E${Math.max(sheet.lastRow.number, 3)}`;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
