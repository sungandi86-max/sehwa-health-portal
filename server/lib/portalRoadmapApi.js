import { getFirebaseAdminAuth, getFirebaseAdminDb } from "./firebaseAdmin.js";
import { getAssignmentId, getBearerToken, readJsonBody } from "./staffDirectory.js";
import { readRoadmap, RoadmapInputError, saveRoadmapItem } from "./portalRoadmap.js";

const STAFF_ROLES = new Set(["staff", "homeroom", "health_teacher", "admin"]);
const ADMIN_ROLES = new Set(["health_teacher", "admin"]);

export async function handlePortalRoadmapResource(req, res, { auth, db } = {}) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ ok: false, message: "로그인이 필요합니다." });

  try {
    const firebaseAuth = auth || getFirebaseAdminAuth();
    const database = db || getFirebaseAdminDb();
    const decoded = await firebaseAuth.verifyIdToken(token);
    const assignment = await database.collection("user_assignments").doc(getAssignmentId(decoded.uid)).get();
    const roles = Array.isArray(assignment.data()?.roles) ? assignment.data().roles : [];
    if (!assignment.exists || assignment.data()?.active !== true || !roles.some((role) => STAFF_ROLES.has(role))) {
      return res.status(403).json({ ok: false, message: "현재 교직원 이용 권한이 없습니다." });
    }
    const canEdit = roles.some((role) => ADMIN_ROLES.has(role));
    if (req.method === "GET") {
      const roadmap = await readRoadmap(database, { includeHidden: canEdit });
      if (roadmap.adminOnly && !canEdit) return res.status(403).json({ ok: false, message: "관리자 전용 업무 로드맵입니다." });
      return res.status(200).json({ ok: true, roadmap, canEdit });
    }
    if (!canEdit) return res.status(403).json({ ok: false, message: "관리자 권한이 없습니다." });
    const body = await readJsonBody(req, { maxBytes: 20_000 });
    const result = await saveRoadmapItem(database, { action: body.action, id: body.id, input: body.item, actorUid: decoded.uid });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    if (error?.code?.startsWith?.("auth/")) return res.status(401).json({ ok: false, message: "로그인 상태를 확인할 수 없습니다." });
    if (error instanceof RoadmapInputError) return res.status(409).json({ ok: false, message: error.message });
    return res.status(500).json({ ok: false, message: "업무 로드맵을 처리하지 못했습니다." });
  }
}
