import { getFirebaseAdminAuth, getFirebaseAdminDb } from "./firebaseAdmin.js";
import { getAssignmentId, getBearerToken, readJsonBody } from "./staffDirectory.js";
import { CmsInputError, readCms, saveCmsItem } from "./portalContentCms.js";

const ADMIN_ROLES = new Set(["health_teacher", "admin"]);

export async function handlePortalCmsResource(req, res, { auth, db, context = process.env } = {}) {
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
    if (!assignment.exists || assignment.data()?.active !== true || !roles.some((role) => ADMIN_ROLES.has(role))) {
      return res.status(403).json({ ok: false, message: "관리자 권한이 없습니다." });
    }
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, items: await readCms(database, { context }) });
    }
    const body = await readJsonBody(req, { maxBytes: 20_000 });
    const result = await saveCmsItem(database, {
      action: body.action, id: body.id, input: body.item, actorUid: decoded.uid, context,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    if (error?.code?.startsWith?.("auth/")) return res.status(401).json({ ok: false, message: "로그인 상태를 확인할 수 없습니다." });
    if (error instanceof CmsInputError) return res.status(error.message.includes("준비되지") || error.message.includes("배포 환경") ? 503 : 409).json({ ok: false, message: error.message });
    return res.status(500).json({ ok: false, message: "콘텐츠를 처리하지 못했습니다." });
  }
}
