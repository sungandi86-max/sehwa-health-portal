import { readTrainingReportModel, makeTrainingReportXlsx, TRAINING_REPORTS } from "../../../server/trainingReports.js";
import {
  CHILD_ABUSE_HWPX_FILENAME,
  ChildAbuseHwpxValidationError,
  generateChildAbuseHwpxReport,
} from "../../../server/childAbuseHwpxReport.js";
import { readJsonBody, verifyDirectoryAdmin } from "../../../server/lib/staffDirectory.js";

const HWPX_BODY_LIMIT_BYTES = 32 * 1024;

export function createTrainingReportsHandler({
  verifyAdmin = verifyDirectoryAdmin,
  readModel = readTrainingReportModel,
  makeXlsx = makeTrainingReportXlsx,
  makeHwpx = generateChildAbuseHwpxReport,
} = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");

    const reportId = String(req.query?.report || "");
    const action = String(req.query?.action || "preview");
    const isExcelRequest = req.method === "GET" && ["preview", "download"].includes(action);
    const isHwpxRequest = req.method === "POST" && reportId === "childAbuse" && action === "hwpx";
    if (!Object.hasOwn(TRAINING_REPORTS, reportId) || (!isExcelRequest && !isHwpxRequest)) {
      if (!["GET", "POST"].includes(req.method)) {
        return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });
      }
      return res.status(400).json({ ok: false, message: "보고서 요청을 확인해 주세요." });
    }

    try {
      const access = await verifyAdmin(req);
      if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });

      const model = await readModel({ db: access.db, reportId });
      if (action === "preview") return res.status(200).json({ ok: true, preview: model.preview });
      if (!model.preview.canDownload) {
        return res.status(409).json({ ok: false, message: "누락 항목을 확인한 뒤 다운로드해 주세요.", preview: model.preview });
      }

      if (isHwpxRequest) {
        const automatic = model.preview.resultReport;
        if (!automatic) return res.status(400).json({ ok: false, message: "아동학대 결과보고서 요청을 확인해 주세요." });
        const body = await readJsonBody(req, { maxBytes: HWPX_BODY_LIMIT_BYTES });
        const input = {
          institutionName: body.institutionName,
          address: body.address,
          principal: body.principal,
          trainingPeriod: body.trainingPeriod,
          instructor: body.instructor,
          totalCount: body.totalCount,
          completedCount: body.completedCount,
          referenceDate: body.referenceDate,
          educationHours: body.educationHours,
          educationMethod: body.educationMethod,
          platformOrg: body.platformOrg,
          platformUrl: body.platformUrl,
        };
        const bytes = await makeHwpx(input);
        res.setHeader("Content-Type", "application/hwp+zip");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Disposition", `attachment; filename="child-abuse-result-report.hwpx"; filename*=UTF-8''${encodeURIComponent(CHILD_ABUSE_HWPX_FILENAME)}`);
        return res.status(200).send(bytes);
      }

      const bytes = await makeXlsx(model);
      const filename = model.report.filename;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="training-report.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`);
      return res.status(200).send(bytes);
    } catch (error) {
      if (String(error?.code || "").startsWith("auth/")) {
        return res.status(401).json({ ok: false, message: "로그인이 필요합니다." });
      }
      if (error instanceof ChildAbuseHwpxValidationError) {
        return res.status(400).json({ ok: false, message: error.message });
      }
      if (error instanceof SyntaxError) {
        return res.status(400).json({ ok: false, message: "요청 내용을 확인해 주세요." });
      }
      if (error?.code === "body-too-large") {
        return res.status(413).json({ ok: false, message: "결과보고서 입력 내용이 너무 깁니다." });
      }
      if (/보고서 생성 전|연구부|교직원명단|법정의무연수|중복 staffId|매칭|반영 대상|task/.test(String(error?.message || ""))) {
        return res.status(409).json({ ok: false, message: "연수 원본과 현재 대상 정합성을 먼저 확인해 주세요." });
      }
      return res.status(500).json({ ok: false, message: "보고서 자료를 불러오지 못했습니다." });
    }
  };
}

export default createTrainingReportsHandler();
