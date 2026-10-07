import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { TrainingAdminContent } from "../../src/pages/FirebaseTrainingAdminPage.jsx";
import { TrainingTargetsContent } from "../../src/pages/FirebaseTrainingTargetsPage.jsx";
import { TrainingQrContent } from "../../src/pages/FirebaseTrainingQrPage.jsx";
import { TrainingAttendanceContent } from "../../src/pages/TrainingAttendancePage.jsx";
import { TrainingAttendanceAdminContent } from "../../src/pages/FirebaseTrainingAttendanceAdminPage.jsx";
import "../../src/index.css";

const eventId = "QA-TRAINING-001";
const item = { eventId, eventGroupId: "QA-GROUP-001", "교육명": "모바일 화면에서 긴 한글 교육명을 확인하는 교직원 안전 연수", "일자": "2026-10-10", "시작시간": "15:00", "종료시간": "16:00", "장소": "본관 대강당", "담당부서": "보건실", "상태": "예정", "사용여부": "사용", signatureOpenAt: "2026-10-10T14:30:00+09:00", signatureCloseAt: "2026-10-10T16:30:00+09:00" };
const loadTrainings = async () => ({ items: [item] });
const preflightMode = new URLSearchParams(window.location.search).get("preflight") || "success";
const runPreflight = async () => {
  if (preflightMode === "loading") return new Promise(() => {});
  return { ok: preflightMode === "success", checks: {
    qrSecretConfigured: true, qrSecretValid: true, signatureStorageConfigured: true,
    signatureDriveAuthReady: preflightMode === "success", signatureDriveRootReady: preflightMode === "success",
    signatureDriveRootPrivate: preflightMode === "success", signatureStorageReadReady: preflightMode === "success",
    signatureSheetReady: true, firebaseAdminReady: true,
  } };
};
const loadDirectory = async () => ({ items: [{ staffId: "QA001", name: "테스트 교직원", department: "보건실", position: "교사" }, { staffId: "QA002", name: "다른 교직원", department: "교무실", position: "교사" }] });
const loadTargets = async () => ({ items: [{ eventId, "교직원ID": "QA001", "대상상태": "대상", "필수여부": "Y", "제외여부": "N" }] });
const createQr = async () => ({ path: `/training/attendance/${eventId}?challenge=fixture`, expiresAt: "2026-10-10T15:15:00+09:00", eventCount: 1 });
const checkAttendance = async () => ({ ok: true, canSubmit: true, items: [{ eventId, title: item["교육명"], eligible: true, reason: "" }] });
const model = { event: { eventId, title: item["교육명"], date: "2026-10-10", location: "본관 대강당" }, counts: { target: 1, signed: 1, excluded: 1 }, rows: [{ staffId: "QA001", name: "테스트 교직원", department: "보건실", position: "교사", status: "서명 완료", signedAt: "2026-10-10T15:02:00+09:00", hasSignatureImage: true }, { staffId: "QA002", name: "다른 교직원", department: "교무실", position: "교사", status: "제외", signedAt: "", hasSignatureImage: false }] };
const loadModel = async () => model;
const view = new URLSearchParams(window.location.search).get("view") || "admin";

createRoot(document.getElementById("root")).render(<MemoryRouter>
  {view === "admin" && <TrainingAdminContent displayName="테스트 관리자" loadTrainings={loadTrainings} runPreflight={runPreflight} />}
  {view === "targets" && <TrainingTargetsContent displayName="테스트 관리자" eventId={eventId} loadDirectory={loadDirectory} loadTargets={loadTargets} saveTarget={async () => ({ ok: true })} />}
  {view === "qr" && <TrainingQrContent displayName="테스트 관리자" eventId={eventId} loadTrainings={loadTrainings} createQr={createQr} />}
  {view === "attendance" && <TrainingAttendanceContent displayName="테스트 교직원" id={eventId} challenge="fixture" checkAttendance={checkAttendance} submitAttendance={async () => ({ ok: true })} />}
  {view === "summary" && <TrainingAttendanceAdminContent displayName="테스트 관리자" eventId={eventId} loadSummary={loadModel} />}
  {view === "final" && <TrainingAttendanceAdminContent displayName="테스트 관리자" eventId={eventId} finalSheet loadFinal={loadModel} downloadSheet={async () => {}} />}
</MemoryRouter>);
