import { auth } from "./firebase.js";

async function request(reportId, action) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const token = await user.getIdToken();
  const response = await fetch(`/api/firebase/admin/training-reports?report=${encodeURIComponent(reportId)}&action=${action}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.message || "보고서 자료를 불러오지 못했습니다.");
  }
  return response;
}

export async function previewTrainingReport(reportId) {
  const response = await request(reportId, "preview");
  const result = await response.json();
  return result.preview;
}

export async function downloadTrainingReport(reportId, filename) {
  const response = await request(reportId, "download");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
