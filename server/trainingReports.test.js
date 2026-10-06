import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { summarizeResearchRows, summarizeSourceOnlyExceptions } from "./healthMandatoryTrainingAnalysis.js";
import { buildTrainingReportModel, makeTrainingReportXlsx } from "./trainingReports.js";
import { hasDirectoryAdminAccess } from "./lib/staffDirectory.js";
import { createTrainingReportsHandler } from "../api/firebase/admin/training-reports.js";

const sourceHeader = ["순", "직책", "성명", "이수 번호", "교육수료일", "이수상태"];
const exceptionHeader = ["적용연도", "성명", "직책", "제외사유", "확인상태", "비고"];

function fixture() {
  const source = summarizeResearchRows([
    sourceHeader,
    [1, "교장", "가교장", "CERT-001", "2026. 9. 22.", "이수완료"],
    [2, "교사", "나교사", "CERT-002", "", "이수완료"],
    [3, "교사", "다교사", "", "", ""],
    [4, "교사", "라휴직", "CERT-004", "", "이수완료"],
    [5, "시간강사", "마강사", "CERT-005", "", "이수완료"],
    [6, "교사", "바퇴직", "CERT-006", "", "이수완료"],
  ]);
  const exceptions = summarizeSourceOnlyExceptions([
    exceptionHeader,
    [2026, "바퇴직", "교사", "퇴직", "확인완료", ""],
  ], 2026);
  const directory = [
    { staffId: "T001", name: "가교장", position: "교장", department: "관리자", target: "대상", employmentStatus: "재직", seniorLeader: "O", newEmployee: "", nonRegular: "" },
    { staffId: "T002", name: "나교사", position: "교사", department: "교무부", target: "대상", employmentStatus: "재직", seniorLeader: "", newEmployee: "O", nonRegular: "" },
    { staffId: "T003", name: "다교사", position: "교사", department: "교무부", target: "대상", employmentStatus: "재직", seniorLeader: "", newEmployee: "", nonRegular: "O" },
    { staffId: "T004", name: "라휴직", position: "교사", department: "교무부", target: "대상", employmentStatus: "휴직", seniorLeader: "", newEmployee: "", nonRegular: "" },
    { staffId: "T005", name: "마강사", position: "시간강사", department: "교무부", target: "대상", employmentStatus: "재직", seniorLeader: "", newEmployee: "", nonRegular: "" },
  ];
  return { source, exceptions, directory, directoryStats: { reportFlagColumnsPresent: true }, taskEnabled: true };
}

test("completed current targets alone appear in preview and performance counts", () => {
  const model = buildTrainingReportModel({ ...fixture(), reportId: "violence" });
  assert.equal(model.preview.targetCount, 3);
  assert.equal(model.preview.completedCount, 2);
  assert.equal(model.preview.unknownCount, 1);
  assert.deepEqual(model.rows.map((row) => row.name), ["가교장", "나교사"]);
  assert.deepEqual(model.preview.performance, {
    all: { target: 3, completed: 2 },
    senior: { target: 1, completed: 1 },
    newEmployee: { target: 1, completed: 1 },
    nonRegular: { target: 1, completed: 0 },
    principalCompleted: true,
  });
  assert.equal(JSON.stringify(model.preview).includes("CERT-"), false);
});

test("missing certificate blocks download and source reconciliation errors block preview", () => {
  const data = fixture();
  data.source.rows[0].completionNumber = "";
  const model = buildTrainingReportModel({ ...data, reportId: "violence" });
  assert.equal(model.preview.canDownload, false);
  assert.equal(model.preview.certificateMissing, 1);
  data.source.rows.push({ realName: "미확인", position: "교사", sourceStatus: "", completionNumber: "", completionDate: "" });
  data.source.stats.validRows += 1;
  assert.throws(() => buildTrainingReportModel({ ...data, reportId: "violence" }), /source-only/);
});

test("child abuse dates are typed in Excel; disability workbook excludes dates", async () => {
  const data = fixture();
  const child = buildTrainingReportModel({ ...data, reportId: "childAbuse" });
  assert.equal(child.preview.completionDateMissing, 1);
  assert.equal(child.preview.invalidDates, 0);
  const childBook = new ExcelJS.Workbook();
  await childBook.xlsx.load(await makeTrainingReportXlsx(child));
  const childSheet = childBook.getWorksheet("이수명부");
  assert.equal(childSheet.getCell("E3").value, "교육수료일");
  assert.equal(childSheet.getCell("D4").value, "CERT-001");
  assert.equal(childSheet.getCell("E4").value.toISOString().slice(0, 10), "2026-09-22");
  assert.equal(childSheet.getCell("E5").value, "");
  assert.equal(childSheet.getRow(6).hasValues, false);

  const disability = buildTrainingReportModel({ ...data, reportId: "disability" });
  const disabilityBook = new ExcelJS.Workbook();
  await disabilityBook.xlsx.load(await makeTrainingReportXlsx(disability));
  assert.equal(disabilityBook.getWorksheet("이수명부").getCell("E3").value, "이수번호");
  assert.equal(disabilityBook.getWorksheet("이수명부").getCell("D4").value, "장애인식개선(사회적)");
});

test("invalid nonblank completion date blocks child abuse download", () => {
  const data = fixture();
  data.source.rows[0].completionDate = "2026. 2. 30.";
  const model = buildTrainingReportModel({ ...data, reportId: "childAbuse" });
  assert.equal(model.preview.invalidDates, 1);
  assert.equal(model.preview.canDownload, false);
});

test("violence workbook uses the requested course column and rejects missing classification headers", async () => {
  const data = fixture();
  const model = buildTrainingReportModel({ ...data, reportId: "violence" });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await makeTrainingReportXlsx(model));
  const sheet = workbook.getWorksheet("이수명부");
  assert.equal(sheet.getCell("D3").value, "연수과정명");
  assert.equal(sheet.getCell("D4").value, "4대폭력예방");
  assert.equal(sheet.getCell("E3").value, "이수번호");
  data.directoryStats.reportFlagColumnsPresent = false;
  assert.throws(() => buildTrainingReportModel({ ...data, reportId: "violence" }), /실적 분류 열/);
});

test("admin role gate accepts only active health teacher or admin assignments", () => {
  assert.equal(hasDirectoryAdminAccess({ active: true, roles: ["admin"] }), true);
  assert.equal(hasDirectoryAdminAccess({ active: true, roles: ["health_teacher"] }), true);
  assert.equal(hasDirectoryAdminAccess({ active: true, roles: ["staff"] }), false);
  assert.equal(hasDirectoryAdminAccess({ active: true, roles: ["homeroom"] }), false);
  assert.equal(hasDirectoryAdminAccess({ active: false, roles: ["admin"] }), false);
});

test("report endpoint returns 401 or 403 before reading source and never returns certificate in preview", async () => {
  const calls = [];
  const response = () => ({
    statusCode: 200, headers: {},
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
  });
  for (const access of [{ ok: false, status: 401, message: "로그인이 필요합니다." }, { ok: false, status: 403, message: "관리자 권한이 없습니다." }]) {
    const handler = createTrainingReportsHandler({ verifyAdmin: async () => access, readModel: async () => { calls.push("read"); } });
    const res = response();
    await handler({ method: "GET", query: { report: "violence" } }, res);
    assert.equal(res.statusCode, access.status);
  }
  assert.deepEqual(calls, []);

  const handler = createTrainingReportsHandler({
    verifyAdmin: async () => ({ ok: true, db: {} }),
    readModel: async () => ({ preview: { targetCount: 1, sampleRows: [], canDownload: true }, rows: [{ certificateNumber: "CERT-SECRET" }] }),
  });
  const res = response();
  await handler({ method: "GET", query: { report: "violence" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.stringify(res.body).includes("CERT-SECRET"), false);
});

test("child abuse HWPX endpoint accepts confirmed inputs and returns the official content type", async () => {
  let received = null;
  const handler = createTrainingReportsHandler({
    verifyAdmin: async () => ({ ok: true, db: {} }),
    readModel: async () => ({
      preview: {
        canDownload: false,
        resultReport: {
          institutionName: "세화여자고등학교",
          principal: "교장",
          totalCount: 84,
          completedCount: 51,
        },
      },
    }),
    makeHwpx: async (input) => {
      received = input;
      return Buffer.from("hwpx");
    },
  });
  const res = {
    statusCode: 200, headers: {},
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
  };
  await handler({
    method: "POST",
    query: { report: "childAbuse", action: "hwpx" },
    body: JSON.stringify({
      institutionName: "확인한 기관명",
      address: "서울 서초구",
      principal: "확인한 기관장",
      trainingPeriod: "2026. 3. 2. ~ 9. 30.",
      educationHours: "1시간",
      educationMethod: "(인터넷) 복지부 위탁 기관",
      totalCount: 80,
      completedCount: 50,
      referenceDate: "2026-12-31",
    }),
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "application/hwp+zip");
  assert.match(res.headers["Content-Disposition"], /filename\*=UTF-8''/);
  assert.equal(received.totalCount, 80);
  assert.equal(received.completedCount, 50);
  assert.equal(received.institutionName, "확인한 기관명");
  assert.equal(received.principal, "확인한 기관장");

  const blockedExcel = {
    statusCode: 200, headers: {},
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
  };
  await handler({
    method: "GET",
    query: { report: "childAbuse", action: "download" },
  }, blockedExcel);
  assert.equal(blockedExcel.statusCode, 409);

  const validatingHandler = createTrainingReportsHandler({
    verifyAdmin: async () => ({ ok: true, db: {} }),
    readModel: async () => ({
      preview: {
        canDownload: true,
        resultReport: {
          institutionName: "세화여자고등학교",
          principal: "교장",
          totalCount: 84,
          completedCount: 51,
        },
      },
    }),
  });
  const missingCounts = {
    statusCode: 200, headers: {},
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
  };
  await validatingHandler({
    method: "POST",
    query: { report: "childAbuse", action: "hwpx" },
    body: JSON.stringify({
      institutionName: "확인한 기관명",
      address: "서울 서초구",
      principal: "확인한 기관장",
      trainingPeriod: "2026. 3. 2. ~ 9. 30.",
      educationHours: "1시간",
      educationMethod: "(인터넷) 복지부 위탁 기관",
    }),
  }, missingCounts);
  assert.equal(missingCounts.statusCode, 400);

  const oversized = {
    statusCode: 200, headers: {},
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
  };
  await handler({
    method: "POST",
    query: { report: "childAbuse", action: "hwpx" },
    body: JSON.stringify({ ignored: "가".repeat(20_000) }),
  }, oversized);
  assert.equal(oversized.statusCode, 413);
});

test("child abuse HWPX endpoint keeps fatal source validation blocking", async () => {
  const handler = createTrainingReportsHandler({
    verifyAdmin: async () => ({ ok: true, db: {} }),
    readModel: async () => { throw new Error("연구부 source-only 정합성 오류"); },
  });
  const res = {
    statusCode: 200, headers: {},
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
  };
  await handler({
    method: "POST",
    query: { report: "childAbuse", action: "hwpx" },
    body: "{}",
  }, res);
  assert.equal(res.statusCode, 409);
});
