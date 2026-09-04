import { auth } from "./firebase.js";

const DIRECTORY_API_PATH = "/api/firebase/staff-directory";
const STAFF_ID_LINK_API_PATH = "/api/firebase/admin/staff-id-link";

async function getIdToken() {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("로그인이 필요합니다.");
  return currentUser.getIdToken();
}

async function requestJson(path, options = {}) {
  const idToken = await getIdToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const result = await response.json().catch(() => null);

  if (!response.ok || result?.ok !== true) {
    const error = new Error(result?.message || "교직원ID 연결 정보를 처리하지 못했습니다.");
    error.code = result?.code || "";
    error.status = response.status;
    error.result = result;
    throw error;
  }

  return result;
}

export async function getStaffDirectory() {
  const result = await requestJson(DIRECTORY_API_PATH);
  return {
    directory: Array.isArray(result.directory) ? result.directory : [],
    stats: result.stats || { count: 0, duplicateStaffIds: 0 },
  };
}

export function linkStaffIdToAssignment(payload) {
  return requestJson(STAFF_ID_LINK_API_PATH, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
