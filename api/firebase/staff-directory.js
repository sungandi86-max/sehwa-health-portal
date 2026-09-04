import { runHealthMandatoryTrainingDryRun } from "../../server/healthMandatoryTrainingDryRun.js";
import { readStaffDirectory, sendCors, verifyDirectoryAdmin } from "../lib/staffDirectory.js";

function isPermissionError(error) {
  const status = error?.response?.status || error?.code || error?.status;
  return status === 403 || status === 404;
}

export default async function handler(req, res) {
  sendCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });

  try {
    const access = await verifyDirectoryAdmin(req);
    if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });

    if (req.query?.resource === "health-mandatory-training-sync") {
      const summary = await runHealthMandatoryTrainingDryRun();
      return res.status(200).json(summary);
    }

    const { directory, stats } = await readStaffDirectory();
    return res.status(200).json({ ok: true, directory, stats });
  } catch (error) {
    if (req.query?.resource === "health-mandatory-training-sync") {
      if (isPermissionError(error)) {
        return res.status(403).json({ ok: false, message: "연구부 연수 시트를 읽을 권한이 없습니다." });
      }
      return res.status(500).json({ ok: false, message: "연구부 연수 시트 dry-run을 완료하지 못했습니다." });
    }
    return res.status(500).json({ ok: false, message: "교직원명단을 불러오지 못했습니다." });
  }
}
