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
