import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase.js";
import { getAssignmentId } from "../config/school.js";
import { ensureNewUserRegistration } from "./teamStaffAccess.js";

const GOOGLE_SIGNUP_PENDING_SOURCE = "google_signup_pending";

export async function getUserProfile(uid) {
  if (!uid) return null;

  const profileRef = doc(db, "users", uid);
  const profileSnapshot = await getDoc(profileRef);

  return profileSnapshot.exists() ? profileSnapshot.data() : null;
}

export async function ensureUserProfile(firebaseUser) {
  if (!firebaseUser?.uid) return null;

  const profileRef = doc(db, "users", firebaseUser.uid);
  const profileSnapshot = await getDoc(profileRef);

  if (profileSnapshot.exists()) {
    return profileSnapshot.data();
  }

  const registration = await ensureNewUserRegistration(firebaseUser);
  if (registration.ok === false) throw new Error(registration.message);

  const registeredProfileSnapshot = await getDoc(profileRef);
  if (!registeredProfileSnapshot.exists()) {
    throw new Error("신규 사용자 기본 정보가 생성되지 않았습니다.");
  }

  return registeredProfileSnapshot.data();
}

export async function getUserAssignment(uid, schoolYear, semester) {
  if (!uid || !schoolYear || !semester) return null;

  const assignmentRef = doc(db, "user_assignments", getAssignmentId(uid, schoolYear, semester));
  const assignmentSnapshot = await getDoc(assignmentRef);

  return assignmentSnapshot.exists() ? assignmentSnapshot.data() : null;
}

export async function getUserAssignmentResult(uid, schoolYear, semester) {
  const assignmentId = getAssignmentId(uid, schoolYear, semester);

  if (!uid || !schoolYear || !semester) {
    return {
      status: "error",
      assignment: null,
      assignmentId,
      errorCode: "missing-argument",
      message: "권한 조회에 필요한 사용자 또는 학기 정보가 없습니다.",
    };
  }

  try {
    const assignmentRef = doc(db, "user_assignments", assignmentId);
    const assignmentSnapshot = await getDoc(assignmentRef);

    if (!assignmentSnapshot.exists()) {
      return {
        status: "not-found",
        assignment: null,
        assignmentId,
        errorCode: null,
        message: "현재 학기의 이용 권한이 아직 등록되지 않았습니다.",
      };
    }

    const assignment = assignmentSnapshot.data();
    if (
      assignment.assignmentSource === GOOGLE_SIGNUP_PENDING_SOURCE &&
      (!Array.isArray(assignment.roles) || assignment.roles.length === 0)
    ) {
      return {
        status: "not-found",
        assignment: null,
        assignmentId,
        errorCode: null,
        message: "현재 학기의 이용 권한이 아직 등록되지 않았습니다.",
      };
    }

    return {
      status: "found",
      assignment,
      assignmentId,
      errorCode: null,
      message: "권한이 확인되었습니다.",
    };
  } catch (error) {
    const isPermissionDenied = error?.code === "permission-denied";

    return {
      status: isPermissionDenied ? "permission-denied" : "error",
      assignment: null,
      assignmentId,
      errorCode: error?.code || "unknown",
      message: isPermissionDenied
        ? "권한 정보를 읽을 수 없습니다. Firestore 보안 설정을 확인해 주세요."
        : "권한 정보를 불러오는 중 문제가 발생했습니다.",
    };
  }
}

function normalizeDisplayName(value) {
  return String(value || "").trim();
}

export function getInternalDisplayName({ profile, user, displayName, email } = {}) {
  const override = normalizeDisplayName(profile?.displayNameOverride);
  if (override) return override;

  const profileName = normalizeDisplayName(profile?.displayName);
  if (profileName) return profileName;

  const providedName = normalizeDisplayName(displayName);
  if (providedName) return providedName;

  const userName = normalizeDisplayName(user?.displayName);
  if (userName) return userName;

  const fallbackEmail = normalizeDisplayName(email || user?.email);
  return fallbackEmail ? fallbackEmail.split("@")[0] : "";
}

export function hasRole(assignment, role) {
  return Array.isArray(assignment?.roles) && assignment.roles.includes(role);
}

export function isHealthTeacher(assignment) {
  return hasRole(assignment, "health_teacher");
}

export function isAdmin(assignment) {
  return hasRole(assignment, "admin");
}

export function isHomeroom(assignment) {
  return hasRole(assignment, "homeroom");
}

export function isStaff(assignment) {
  return hasRole(assignment, "staff");
}
