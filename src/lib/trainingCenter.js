import { auth } from "./firebase.js";

async function requestTraining(params) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const token = await user.getIdToken();
  const response = await fetch(`/api/firebase/staff-directory?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result?.message || "교육 자료를 불러오지 못했습니다.");
    error.code = result?.code;
    throw error;
  }
  return result;
}

export async function getTrainingList() {
  return (await requestTraining({ resource: "training-list" })).items;
}

export async function getTrainingDetail(eventId) {
  return (await requestTraining({ resource: "training-detail", eventId })).item;
}
