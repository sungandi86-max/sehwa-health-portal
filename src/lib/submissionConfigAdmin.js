import { auth } from "./firebase.js";

export async function requestSubmissionConfig(change) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const response = await fetch("/api/firebase/staff-directory?resource=submission-config", {
    method: change ? "POST" : "GET",
    headers: { Authorization: `Bearer ${await user.getIdToken()}`,
      ...(change ? { "Content-Type": "application/json" } : {}) },
    ...(change ? { body: JSON.stringify(change) } : {}), cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok || data?.ok !== true) throw new Error(data?.message || "제출 설정을 처리하지 못했습니다.");
  return data;
}
