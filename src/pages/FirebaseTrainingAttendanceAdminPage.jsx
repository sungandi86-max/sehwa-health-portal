import { isCprEvent } from "../../common/cprProjection.js";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import FirebaseAdminRoleAccessGate from "../components/FirebaseAdminRoleAccessGate.jsx";
import { TrainingAdminLayout } from "../components/TrainingAdminLayout.jsx";
import { correctTrainingAttendance, downloadTrainingFinalSheet, downloadTrainingFinalSheetXlsx, getTrainingAttendanceSummary, getTrainingFinalSheet } from "../lib/trainingCenterPhase2.js";
import { trainingAttendanceCounts } from "../lib/trainingAttendancePresentation.js";

const secondary = "inline-flex min-h-11 items-center justify-center rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-sm font-semibold text-[#0D4EA6] disabled:opacity-50";
const ABSENCE_REASONS = [
  ["", "사유 미지정"], ["business_trip", "출장"], ["annual_leave", "연가"], ["sick_leave", "병가"],
  ["official_leave", "공가"], ["special_leave", "특별휴가"], ["other", "기타"],
];

function signedTime(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : value || "서명일시 없음";
}

function Correction({ row, eventId, onSaved, correctAttendance, canReconcile, manualOnly }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function apply(action) {
    if (!reason.trim()) { setMessage("정정 사유를 입력해 주세요."); return; }
    const label = action === "cancel" ? "출석을 취소" : "출석을 관리자 보정";
    if (!window.confirm(`${row.name} 교직원의 ${label}합니다. 계속할까요?`)) return;
    setSaving(true); setMessage("");
    try { const result = await correctAttendance({ eventId, staffId: row.staffId, reason, action }); setReason(""); onSaved(); if (result.cprProjectionSynced === false) setMessage("출석은 저장됐으나 CPR 현황 반영 대기 중입니다. 현황 재계산을 실행해 주세요."); }
    catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }
  async function reconcile() {
    setSaving(true); setMessage("");
    try { await correctAttendance({ eventId, staffId: row.staffId, reason: "CPR 현황 복구", action: "reconcile-cpr" }); onSaved(); setMessage("CPR 현황을 재계산했습니다."); }
    catch { setMessage("CPR 현황 복구를 완료하지 못했습니다. 원본 출석은 유지됩니다."); }
    finally { setSaving(false); }
  }
  if (row.status === "제외") return null;
  return <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="grid gap-1 text-xs text-[#627083]">정정 사유<input className="min-h-11 min-w-0 rounded-[9px] border border-[#DDEAE7] px-3 text-sm text-[#102047]" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} placeholder="필수 입력" /></label>{(!manualOnly || row.status === "관리자 등록") && <button type="button" disabled={saving} onClick={() => apply(["서명 완료","관리자 등록"].includes(row.status) ? "cancel" : "mark-attended")} className={secondary}>{["서명 완료","관리자 등록"].includes(row.status) ? "출석 취소" : "출석 보정"}</button>}{canReconcile && <button type="button" className={secondary} disabled={saving} onClick={reconcile}>CPR 현황 재계산</button>}{message && <p role="alert" className="text-xs text-[#B42318]">{message}</p>}</div>;
}

function AbsenceReasonEditor({ row, eventId, onSaved, correctAttendance }) {
  const [absenceReason, setAbsenceReason] = useState(row.absenceReason || "");
  const [absenceNote, setAbsenceNote] = useState(row.absenceNote || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { setAbsenceReason(row.absenceReason || ""); setAbsenceNote(row.absenceNote || ""); }, [row.absenceReason, row.absenceNote]);
  async function save() {
    setSaving(true); setMessage("");
    try {
      await correctAttendance({ eventId, staffId: row.staffId, action: "set-absence-reason", reason: "미참석 사유 등록",
        absenceReason: absenceReason || null, absenceNote: absenceReason === "other" ? absenceNote : "" });
      onSaved();
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }
  return <div className="mt-3 grid gap-2 border-t border-[#EEF3F2] pt-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
    <label className="grid gap-1 text-xs text-[#627083]">미참석 사유<select className="min-h-11 min-w-0 rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-sm text-[#102047]" value={absenceReason} onChange={(event) => setAbsenceReason(event.target.value)}>{ABSENCE_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {absenceReason === "other" ? <label className="grid gap-1 text-xs text-[#627083]">기타 비고<input className="min-h-11 min-w-0 rounded-[9px] border border-[#DDEAE7] px-3 text-sm text-[#102047]" value={absenceNote} onChange={(event) => setAbsenceNote(event.target.value)} maxLength={200} placeholder="선택 입력" /></label> : <span />}
    <button type="button" className={`${secondary} self-end`} disabled={saving} onClick={save}>{saving ? "저장 중" : "사유 저장"}</button>
    {message && <p role="alert" className="text-xs text-[#B42318] sm:col-span-3">{message}</p>}
  </div>;
}

export function TrainingAttendanceAdminContent({ displayName, eventId, finalSheet = false, canReconcile = false, loadSummary = getTrainingAttendanceSummary, loadFinal = getTrainingFinalSheet, correctAttendance = correctTrainingAttendance, downloadSheet = downloadTrainingFinalSheet, downloadXlsx = downloadTrainingFinalSheetXlsx }) {
  const [model, setModel] = useState(null);
  const [state, setState] = useState("loading");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("전체");
  const [working, setWorking] = useState(false);
  async function reload() {
    try { setModel(await (finalSheet ? loadFinal(eventId) : loadSummary(eventId))); setState("ready"); }
    catch (error) { setMessage(error.message); setState("error"); }
  }
  useEffect(() => { reload(); }, [eventId, finalSheet]);
  const shown = useMemo(() => model?.rows.filter((row) => filter === "전체" || (filter === "완료" && ["서명 완료","관리자 등록"].includes(row.status)) || (filter === "미완료" && row.status === "미서명") || (filter === "제외" && row.status === "제외")) || [], [model, filter]);
  const counts = trainingAttendanceCounts(model?.counts);
  async function download(format) {
    setWorking(true); setMessage("");
    try {
      const base = `${model.event.date}_${model.event.title.replace(/[\\/:*?"<>|]/g, "_")}_연수등록부`;
      await (format === "xlsx" ? downloadXlsx(eventId, `${base}.xlsx`) : downloadSheet(eventId, `${base}.pdf`));
    }
    catch (error) { setMessage(error.message); }
    finally { setWorking(false); }
  }
  return <TrainingAdminLayout displayName={displayName} eventId={eventId} active={finalSheet ? "final-sheet" : "attendance"} title={finalSheet ? "연수등록부 미리보기" : "교육 출석 현황"} description={finalSheet ? "현재 유효한 대상과 전자서명을 확인하고 공식 연수등록부 PDF를 생성합니다." : "대상별 출석을 확인하고 사유를 남겨 정정합니다."}>
    {state === "loading" && <p className="text-sm text-[#627083]">서명 기록을 불러오는 중입니다.</p>}
    {state === "error" && <p role="alert" className="text-sm text-[#B42318]">{message}</p>}
    {state === "ready" && model && <section className="space-y-3">
      <div className="training-admin-panel overflow-hidden"><div className="p-4"><h2 className="break-keep text-lg font-bold text-[#102047]">{model.event.title}</h2><p className="mt-1 text-xs text-[#627083]">{model.event.date} · {model.event.location}</p></div><dl className="grid grid-cols-2 border-t border-[#DDEAE7] sm:grid-cols-4"><div className="training-admin-metric"><dt className="text-xs text-[#627083]">대상</dt><dd className="mt-1 text-xl font-bold tabular-nums text-[#102047]">{counts.target}</dd></div><div className="training-admin-metric"><dt className="text-xs text-[#627083]">{counts.manual ? "서명·관리자 등록" : finalSheet ? "서명 완료" : "출석 완료"}</dt><dd className="mt-1 text-xl font-bold tabular-nums text-[#08754B]">{counts.attended ?? counts.signed}</dd></div><div className="training-admin-metric"><dt className="text-xs text-[#627083]">{finalSheet ? "미서명" : "미출석"}</dt><dd className="mt-1 text-xl font-bold tabular-nums text-[#102047]">{counts.missing}</dd></div><div className="training-admin-metric"><dt className="text-xs text-[#627083]">제외</dt><dd className="mt-1 text-xl font-bold tabular-nums text-[#102047]">{counts.excluded}</dd></div></dl></div>
      <div className="flex flex-wrap items-center justify-between gap-2"><label className="grid gap-1 text-xs text-[#627083]">상태 필터<select className="min-h-11 rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-sm text-[#102047]" value={filter} onChange={(event) => setFilter(event.target.value)}><option>전체</option><option>완료</option><option>미완료</option><option>제외</option></select></label>{finalSheet && <div className="flex flex-wrap gap-2"><button type="button" className={secondary} disabled={working} onClick={() => download("xlsx")}>XLSX 다운로드</button><button type="button" className="min-h-11 rounded-[9px] bg-[#0D4EA6] px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={working} onClick={() => download("pdf")}>{working ? "생성 중" : "PDF 다운로드"}</button></div>}</div>
      {shown.length === 0 ? <p className="training-admin-panel p-4 text-sm text-[#627083]">표시할 교직원이 없습니다.</p> : <div className="training-admin-panel overflow-hidden"><div className="hidden grid-cols-[44px_minmax(90px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(150px,1.3fr)_minmax(100px,1fr)] gap-2 border-b border-[#DDEAE7] bg-[#F3F8F6] px-4 py-2 text-xs font-semibold text-[#627083] lg:grid"><span>No.</span><span>교직원ID</span><span>이름</span><span>부서</span><span>출석시간</span><span>상태</span></div>
      <ol className="divide-y divide-[#DDEAE7]">{shown.map((row, index) => <li key={row.staffId} className="min-w-0 px-4 py-3"><div className="grid gap-1 text-sm lg:grid-cols-[44px_minmax(90px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(150px,1.3fr)_minmax(100px,1fr)] lg:gap-2"><span className="hidden tabular-nums text-[#627083] lg:block">{index + 1}</span><span className="order-2 break-all text-xs tabular-nums text-[#627083] lg:order-none lg:text-sm"><span className="lg:hidden">교직원ID · </span>{row.staffId}</span><span className="order-1 font-semibold text-[#102047] lg:order-none"><span className="lg:hidden">{index + 1}. </span>{row.name} <span className="font-normal text-[#627083]">· {row.position}</span></span><span className="order-3 text-xs text-[#627083] lg:order-none lg:text-sm">{row.department}</span><span className="order-4 text-xs tabular-nums text-[#627083] lg:order-none lg:text-sm">{row.method === "admin_offline_cpr_2026" ? `관리자 등록 ${signedTime(row.registeredAt)}` : signedTime(row.signedAt)}</span><span className="order-5 font-semibold text-[#3154A3] lg:order-none">{row.status}{row.absenceLabel && row.absenceLabel !== "미참석" ? ` · ${row.absenceLabel}` : ""}{row.hasSignatureImage ? " · 서명 이미지" : ""}{row.registrationBasis && <span className="block text-xs">오프라인 명부 확인 · {row.registeredBy} · {row.registrationBasis}</span>}</span></div>{!finalSheet && row.status === "미서명" && <AbsenceReasonEditor row={row} eventId={eventId} onSaved={reload} correctAttendance={correctAttendance} />}{!finalSheet && <Correction row={row} manualOnly={model.event.registrationMode === "admin_offline_cpr_2026"} canReconcile={canReconcile && isCprEvent(model.event)} eventId={eventId} onSaved={reload} correctAttendance={correctAttendance} />}</li>)}</ol></div>}
      {message && <p role="alert" className="text-sm text-[#B42318]">{message}</p>}
    </section>}
  </TrainingAdminLayout>;
}

export default function FirebaseTrainingAttendanceAdminPage({ finalSheet = false }) {
  const { eventId } = useParams();
  return <FirebaseAdminRoleAccessGate allowTrainingAdmin deniedTitle="교육 출석 관리 권한이 없습니다.">{({ displayName, hasTopLevelAdminAccess }) => <TrainingAttendanceAdminContent canReconcile={hasTopLevelAdminAccess} displayName={displayName} eventId={eventId} finalSheet={finalSheet} />}</FirebaseAdminRoleAccessGate>;
}
