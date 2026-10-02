import { readTrainingReportModel, makeTrainingReportXlsx, TRAINING_REPORTS } from "../../../server/trainingReports.js";
import { verifyDirectoryAdmin } from "../../../server/lib/staffDirectory.js";

export function createTrainingReportsHandler({ verifyAdmin = verifyDirectoryAdmin, readModel = readTrainingReportModel, makeXlsx = makeTrainingReportXlsx } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });

    const reportId = String(req.query?.report || "");
    const action = String(req.query?.action || "preview");
    if (!Object.hasOwn(TRAINING_REPORTS, reportId) || !["preview", "download"].includes(action)) {
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

      const bytes = await makeXlsx(model);
      const filename = model.report.filename;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="training-report.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`);
      return res.status(200).send(bytes);
    } catch (error) {
      if (String(error?.code || "").startsWith("auth/")) {
        return res.status(401).json({ ok: false, message: "로그인이 필요합니다." });
      }
      if (/보고서 생성 전|연구부|교직원명단|법정의무연수|중복 staffId|매칭|반영 대상|task/.test(String(error?.message || ""))) {
        return res.status(409).json({ ok: false, message: "연수 원본과 현재 대상 정합성을 먼저 확인해 주세요." });
      }
      return res.status(500).json({ ok: false, message: "보고서 자료를 불러오지 못했습니다." });
    }
  };
}

export default createTrainingReportsHandler();
