import { auth } from "./firebase.js";

async function request(resource, { method = "GET", params = {}, body = null, download = false } = {}) {
  if (!auth.currentUser) throw new Error("로그인이 필요합니다.");
  const token = await auth.currentUser.getIdToken();
  const search = new URLSearchParams({ resource, ...params });
  const response = await fetch(`/api/firebase/staff-directory?${search}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.message || "교육 업무를 처리하지 못했습니다.");
  }
  if (download) return response.blob();
  return response.json();
}

export const listManagedTrainings = () => request("training-admin-list");
export const saveManagedTraining = (body) => request("training-admin-save", { method: "POST", body });
export const listTrainingDirectory = () => request("training-admin-directory");
export const listTrainingTargets = (eventId) => request("training-targets", { params: { eventId } });
export const saveTrainingTarget = (body) => request("training-target-save", { method: "POST", body });
export const createTrainingQr = (params) => request("training-qr", { params });
export const checkTrainingAttendance = (params) => request("training-attendance-check", { params });
export const submitTrainingAttendance = (body) => request("training-attendance-submit", { method: "POST", body });
export const getTrainingAttendanceSummary = (eventId) => request("training-attendance-summary", { params: { eventId } });
export const correctTrainingAttendance = (body) => request("training-attendance-correct", { method: "POST", body });
export const getTrainingFinalSheet = (eventId) => request("training-final-sheet", { params: { eventId } });

export async function downloadTrainingFinalSheet(eventId, filename) {
  const blob = await request("training-final-sheet", { params: { eventId, download: "1" }, download: true });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
