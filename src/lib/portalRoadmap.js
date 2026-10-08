import { auth } from "./firebase.js";

export async function requestPortalRoadmap({ action, id, item } = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const token = await user.getIdToken();
  const response = await fetch("/api/firebase/staff-directory?resource=portal-roadmap", {
    method: action ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(action ? { "Content-Type": "application/json" } : {}),
    },
    ...(action ? { body: JSON.stringify({ action, id, item }) } : {}),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok || result?.ok !== true) throw new Error(result?.message || "업무 로드맵을 불러오지 못했습니다.");
  return result;
}
