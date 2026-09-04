import { getFirebaseAdminDb } from "../lib/firebaseAdmin.js";
import { applyHealthMandatoryTrainingSnapshot } from "../../server/healthMandatoryTrainingDryRun.js";

function isAuthorizedCron(req) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization || req.headers.Authorization;
  return Boolean(cronSecret) && authorization === `Bearer ${cronSecret}`;
}

function pickCronSummary(result, schedule) {
  return {
    ok: true,
    taskId: result.taskId,
    schedule,
    sourceRows: result.rows?.sourceRows ?? 0,
    validRows: result.rows?.validRows ?? 0,
    matched: result.matching?.matched ?? 0,
    unmatched: result.matching?.unmatched ?? 0,
    ambiguous: result.matching?.ambiguous ?? 0,
    duplicateStaffIds: result.matching?.duplicateStaffIds ?? 0,
    completed: result.status?.completed ?? 0,
    incomplete: result.status?.incomplete ?? 0,
    unknown: result.status?.unknown ?? 0,
    docsWritten: result.apply?.docsWritten ?? 0,
    orphanSnapshots: result.apply?.orphanSnapshots ?? 0,
    deletedSnapshots: result.apply?.deletedSnapshots ?? 0,
    sheetWrite: result.apply?.sheetWrite === true,
    firestoreWrite: result.apply?.firestoreWrite === true,
    syncedAt: result.apply?.syncedAt ?? null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });
  }

  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ ok: false, message: "인증되지 않은 요청입니다." });
  }

  try {
    const result = await applyHealthMandatoryTrainingSnapshot({ db: getFirebaseAdminDb() });
    const schedule = req.headers["x-vercel-cron-schedule"] || null;
    return res.status(200).json(pickCronSummary(result, schedule));
  } catch {
    return res.status(500).json({
      ok: false,
      message: "연구부 연수 자동 갱신을 완료하지 못했습니다. 기존 현황은 유지됩니다.",
    });
  }
}
