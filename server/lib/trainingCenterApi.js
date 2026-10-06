import { getFirebaseAdminAuth, getFirebaseAdminDb } from "./firebaseAdmin.js";
import { readStaffDirectory, sendCors } from "./staffDirectory.js";
import { buildTrainingView, readTrainingSheets, TrainingSourceNotReadyError } from "./trainingCenter.js";
import { resolveTrainingAccess } from "./trainingCenterAccess.js";

export function createTrainingHandler({ auth = getFirebaseAdminAuth, db = getFirebaseAdminDb, directory = readStaffDirectory, sheets = readTrainingSheets } = {}) {
  return async function handleTrainingResource(req, res) {
    sendCors(res);
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "GET") return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });

    try {
      const access = await resolveTrainingAccess(req, { auth, db, directory });
      if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });

      const resource = req.query?.resource;
      if (!["training-list", "training-detail"].includes(resource)) return res.status(400).json({ ok: false, message: "요청한 교육 자료 종류가 올바르지 않습니다." });
      const eventId = typeof req.query?.eventId === "string" ? req.query.eventId.trim() : "";
      if (resource === "training-detail" && (!eventId || eventId.length > 120)) return res.status(404).json({ ok: false, message: "교육을 찾을 수 없습니다." });

      const source = await sheets();
      const view = buildTrainingView(source, access.assignment.staffId, { eventId: resource === "training-detail" ? eventId : "" });
      if (resource === "training-detail" && !view) return res.status(404).json({ ok: false, message: "교육을 찾을 수 없습니다." });
      return res.status(200).json(resource === "training-detail" ? { ok: true, item: view } : { ok: true, items: view });
    } catch (error) {
      if (error instanceof TrainingSourceNotReadyError) {
        return res.status(503).json({ ok: false, code: error.code, message: error.message });
      }
      return res.status(500).json({ ok: false, message: "교육 자료를 불러오지 못했습니다." });
    }
  };
}

export const handleTrainingResource = createTrainingHandler();
