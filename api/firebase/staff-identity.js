import { getFirebaseAdminAuth, getFirebaseAdminDb } from "../lib/firebaseAdmin.js";
import { getAssignmentId, getBearerToken, readStaffDirectory, sendCors } from "../lib/staffDirectory.js";

const STAFF_ROLES = ["staff", "homeroom", "health_teacher", "admin"];

function hasStaffAccess(assignment) {
  const roles = Array.isArray(assignment?.roles) ? assignment.roles : [];
  return assignment?.active === true && roles.some((role) => STAFF_ROLES.includes(role));
}

function safeIdentity(directoryItem, assignment) {
  const name = directoryItem?.name || "";
  const department = directoryItem?.department || assignment?.department || "";

  if (!name || !department) return null;

  return {
    staffId: assignment.staffId,
    name,
    department,
  };
}

export default async function handler(req, res) {
  sendCors(res, "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });

  try {
    const idToken = getBearerToken(req);
    if (!idToken) return res.status(401).json({ ok: false, message: "로그인이 필요합니다." });

    const decodedToken = await getFirebaseAdminAuth().verifyIdToken(idToken);
    const db = getFirebaseAdminDb();
    const assignmentSnapshot = await db.collection("user_assignments").doc(getAssignmentId(decodedToken.uid)).get();

    if (!assignmentSnapshot.exists) {
      return res.status(403).json({ ok: false, message: "현재 학기 교직원 정보가 등록되지 않았습니다." });
    }

    const assignment = assignmentSnapshot.data();
    if (!hasStaffAccess(assignment)) {
      return res.status(403).json({ ok: false, message: "현재 학기 교직원 이용 권한이 없습니다." });
    }

    if (!assignment.staffId) {
      return res.status(409).json({
        ok: false,
        code: "missing-staff-id",
        message: "교직원 정보가 연결되지 않아 신청할 수 없습니다. 관리자에게 문의해 주세요.",
      });
    }

    const { directory } = await readStaffDirectory();
    const directoryItem = directory.find((item) => item.staffId === assignment.staffId);
    const identity = safeIdentity(directoryItem, assignment);

    if (!identity) {
      return res.status(409).json({
        ok: false,
        code: "missing-directory-identity",
        message: "교직원명단에서 신청자 정보를 확인할 수 없습니다. 관리자에게 문의해 주세요.",
      });
    }

    return res.status(200).json({ ok: true, identity });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "교직원 정보를 불러오지 못했습니다." });
  }
}
