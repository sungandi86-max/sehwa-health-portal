import { auth } from "./firebase.js";

const USER_ACCOUNT_API_PATH = "/api/firebase/admin/user-account";

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
    const error = new Error(result?.message || "계정 관리 작업을 완료하지 못했습니다.");
    error.status = response.status;
    error.references = result?.references || null;
    throw error;
  }

  return result;
}

export function checkUserDeletion(uid) {
  return requestJson(`${USER_ACCOUNT_API_PATH}?uid=${encodeURIComponent(uid)}`);
}

export function deactivateUserAccount(payload) {
  return requestJson(USER_ACCOUNT_API_PATH, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteUserAccount(payload) {
  return requestJson(USER_ACCOUNT_API_PATH, {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}
