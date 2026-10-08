import { auth } from "./firebase.js";

export async function requestPortalCms({ action, id, item } = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const response = await fetch("/api/firebase/staff-directory?resource=portal-cms", {
    method: action ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      ...(action ? { "Content-Type": "application/json" } : {}),
    },
    ...(action ? { body: JSON.stringify({ action, id, item }) } : {}),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok || result?.ok !== true) throw new Error(result?.message || "콘텐츠를 처리하지 못했습니다.");
  return result;
}
