import { getFirebaseAdminAuth, getFirebaseAdminDb } from "./firebaseAdmin.js";
import { getAssignmentId, getBearerToken, readJsonBody } from "./staffDirectory.js";
import { readSubmissionConfig, saveRegistrationConfig, saveSubmissionCard, SubmissionConfigError } from "./submissionConfig.js";

const ADMIN_ROLES = new Set(["health_teacher", "admin"]);

export async function handleSubmissionConfigResource(req, res, { auth, db, context = process.env } = {}) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ ok: false, message: "로그인이 필요합니다." });
  try {
    const database = db || getFirebaseAdminDb();
    const decoded = await (auth || getFirebaseAdminAuth()).verifyIdToken(token);
    const assignment = await database.collection("user_assignments").doc(getAssignmentId(decoded.uid)).get();
    const roles = Array.isArray(assignment.data()?.roles) ? assignment.data().roles : [];
    if (!assignment.exists || assignment.data()?.active !== true || !roles.some((role) => ADMIN_ROLES.has(role))) {
      return res.status(403).json({ ok: false, message: "관리자 권한이 없습니다." });
    }
    if (req.method === "GET") {
      const { cards, registration, adminRecords } = await readSubmissionConfig(database, { context });
      return res.status(200).json({ ok: true, cards, registration, workflow: adminRecords.filter((item) => item.kind === "legacy_item") });
    }
    const body = await readJsonBody(req, { maxBytes: 20_000 });
    const result = body.action === "registration"
      ? await saveRegistrationConfig(database, { context, input: body.registration, actorUid: decoded.uid })
      : await saveSubmissionCard(database, { context, action: body.action, id: body.id, input: body.card, actorUid: decoded.uid });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    if (error?.code?.startsWith?.("auth/")) return res.status(401).json({ ok: false, message: "로그인을 확인할 수 없습니다." });
    if (error instanceof SubmissionConfigError) return res.status(error.message.includes("준비되지") || error.message.includes("배포 환경") ? 503 : 409)
      .json({ ok: false, message: error.message });
    return res.status(500).json({ ok: false, message: "제출 설정을 처리하지 못했습니다." });
  }
}
