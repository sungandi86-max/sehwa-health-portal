import { auth } from "./firebase.js";

const STAFF_IDENTITY_API_PATH = "/api/firebase/staff-directory?resource=staff-identity";

export async function getAuthenticatedStaffIdentity() {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    const error = new Error("로그인이 필요합니다.");
    error.status = 401;
    throw error;
  }

  const idToken = await currentUser.getIdToken();
  const response = await fetch(STAFF_IDENTITY_API_PATH, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  const result = await response.json().catch(() => null);

  if (!response.ok || result?.ok !== true) {
    const error = new Error(result?.message || "교직원 정보를 불러오지 못했습니다.");
    error.status = response.status;
    error.code = result?.code || "";
    throw error;
  }

  return result.identity;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function hasRole(assignment, role) {
  return Array.isArray(assignment?.roles) && assignment.roles.includes(role);
}

export function getStaffDisplayName({ identity, displayName, user } = {}) {
  return normalizeText(identity?.name) || normalizeText(displayName) || normalizeText(user?.displayName) || "교직원 정보 연결 필요";
}

export function getStaffRoleDisplay({ assignment, identity } = {}) {
  if (hasRole(assignment, "health_teacher")) return "보건교사";
  if (hasRole(assignment, "homeroom")) return "담임교사";

  const position = normalizeText(assignment?.position) || normalizeText(identity?.position);
  if (position) return position;

  if (hasRole(assignment, "admin")) return "교직원";
  return "교사";
}
