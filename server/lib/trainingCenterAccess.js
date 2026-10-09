import { getFirebaseAdminAuth, getFirebaseAdminDb } from "./firebaseAdmin.js";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER, getAssignmentId, getBearerToken, readStaffDirectory } from "./staffDirectory.js";
import { trainingEnvironment } from "./trainingDeployment.js";

const STAFF_ROLES = new Set(["staff", "homeroom", "health_teacher", "admin"]);
const ADMIN_ROLES = new Set(["health_teacher", "admin"]);

export async function resolveTrainingAccess(req, { auth = getFirebaseAdminAuth, db = getFirebaseAdminDb, directory = readStaffDirectory,
  environment = trainingEnvironment } = {}) {
  const token = getBearerToken(req);
  if (!token) return { ok: false, status: 401, message: "로그인이 필요합니다." };
  let decoded;
  try { decoded = await auth().verifyIdToken(token); }
  catch { return { ok: false, status: 401, message: "로그인 정보를 확인할 수 없습니다." }; }

  const database = db();
  const assignmentSnapshot = await database.collection("user_assignments").doc(getAssignmentId(decoded.uid)).get();
  const assignment = assignmentSnapshot.exists ? assignmentSnapshot.data() : null;
  const qaSigner = environment() === "qa" && assignment?.active === false && assignment?.environment === "qa" &&
    assignment?.qaOnly === true && assignment?.staffId === "QA-SIGN-TEST-001" &&
    assignment?.roles?.length === 1 && assignment.roles[0] === "qa_training_signer" &&
    Date.parse(assignment?.qaExpiresAt) > Date.now();
  if ((!qaSigner && (assignment?.active !== true || !Array.isArray(assignment?.roles) ||
    !assignment.roles.some((role) => STAFF_ROLES.has(role)))) || assignment?.uid !== decoded.uid ||
    Number(assignment.schoolYear) !== CURRENT_SCHOOL_YEAR || Number(assignment.semester) !== CURRENT_SEMESTER || !assignment.staffId) {
    return { ok: false, status: 403, message: "현재 학기 교직원 이용 권한이 없습니다." };
  }
  const { directory: staff, stats } = await directory({ allowInvalidEmploymentStatus: false });
  const matches = staff.filter((row) => row.staffId === assignment.staffId);
  if (stats.duplicateStaffIds > 0 || matches.length !== 1 || matches[0].employmentStatus !== "재직") {
    return { ok: false, status: 403, message: "현재 재직 교직원 정보를 확인할 수 없습니다." };
  }
  return { ok: true, assignment, staff: matches[0], directory: staff, decoded, db: database,
    isAdmin: assignment.roles.some((role) => ADMIN_ROLES.has(role)) };
}
