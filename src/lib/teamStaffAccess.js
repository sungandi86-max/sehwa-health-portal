import { getAuthProvider } from "./firebaseAuth.js";

const TEAM_STAFF_API_PATH = "/api/firebase/ensure-team-staff";

export async function ensureTeamStaffAssignment(firebaseUser, profile) {
  if (!firebaseUser?.uid || getAuthProvider(firebaseUser) !== "microsoft") {
    return { ok: true, status: "skipped" };
  }

  if (profile?.active === false) {
    return { ok: false, status: "inactive-user", message: "비활성 계정은 기본 이용 권한을 설정할 수 없습니다." };
  }

  const idToken = await firebaseUser.getIdToken();
  const response = await fetch(TEAM_STAFF_API_PATH, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
  });
  const result = await response.json().catch(() => null);

  if (!response.ok || result?.ok !== true) {
    return {
      ok: false,
      status: result?.status || "error",
      message: result?.message || "기본 이용 권한을 설정하지 못했습니다. 보건실에 문의해 주세요.",
    };
  }

  return result;
}
