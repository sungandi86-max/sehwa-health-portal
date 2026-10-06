import { getFirebaseAdminAuth, getFirebaseAdminDb } from "./firebaseAdmin.js";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER, getAssignmentId, getBearerToken, readStaffDirectory, sendCors } from "./staffDirectory.js";
import { buildTrainingView, readTrainingSheets, TrainingSourceNotReadyError } from "./trainingCenter.js";

const STAFF_ROLES = new Set(["staff", "homeroom", "health_teacher", "admin"]);

export function createTrainingHandler({ auth = getFirebaseAdminAuth, db = getFirebaseAdminDb, directory = readStaffDirectory, sheets = readTrainingSheets } = {}) {
  return async function handleTrainingResource(req, res) {
    sendCors(res);
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "GET") return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });

    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ ok: false, message: "로그인이 필요합니다." });

    let decoded;
    try {
      decoded = await auth().verifyIdToken(token);
    } catch {
      return res.status(401).json({ ok: false, message: "로그인 정보를 확인할 수 없습니다." });
    }

    try {
      const assignmentSnapshot = await db().collection("user_assignments").doc(getAssignmentId(decoded.uid)).get();
      const assignment = assignmentSnapshot.exists ? assignmentSnapshot.data() : null;
      if (assignment?.active !== true || assignment.uid !== decoded.uid || Number(assignment.schoolYear) !== CURRENT_SCHOOL_YEAR || Number(assignment.semester) !== CURRENT_SEMESTER || !assignment.staffId || !Array.isArray(assignment.roles) || !assignment.roles.some((role) => STAFF_ROLES.has(role))) {
        return res.status(403).json({ ok: false, message: "현재 학기 교직원 이용 권한이 없습니다." });
      }

      const { directory: staff, stats } = await directory({ allowInvalidEmploymentStatus: false });
      const matches = staff.filter((row) => row.staffId === assignment.staffId);
      if (stats.duplicateStaffIds > 0 || matches.length !== 1 || matches[0].employmentStatus !== "재직") {
        return res.status(403).json({ ok: false, message: "현재 재직 교직원 정보를 확인할 수 없습니다." });
      }

      const resource = req.query?.resource;
      if (!["training-list", "training-detail"].includes(resource)) return res.status(400).json({ ok: false, message: "요청한 교육 자료 종류가 올바르지 않습니다." });
      const eventId = typeof req.query?.eventId === "string" ? req.query.eventId.trim() : "";
      if (resource === "training-detail" && (!eventId || eventId.length > 120)) return res.status(404).json({ ok: false, message: "교육을 찾을 수 없습니다." });

      const source = await sheets();
      const view = buildTrainingView(source, assignment.staffId, { eventId: resource === "training-detail" ? eventId : "" });
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
