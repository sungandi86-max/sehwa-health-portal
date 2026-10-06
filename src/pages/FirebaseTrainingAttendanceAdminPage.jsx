import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import FirebaseAdminRoleAccessGate from "../components/FirebaseAdminRoleAccessGate.jsx";
import { FirebaseV2PageShell } from "../components/FirebaseV2PageShell.jsx";
import { correctTrainingAttendance, downloadTrainingFinalSheet, getTrainingAttendanceSummary, getTrainingFinalSheet } from "../lib/trainingCenterPhase2.js";

const secondary = "inline-flex min-h-11 items-center justify-center rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-sm font-semibold text-[#0D4EA6] disabled:opacity-50";

function signedTime(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : value || "서명일시 없음";
}

function Correction({ row, eventId, onSaved, correctAttendance }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function apply(action) {
    if (!reason.trim()) { setMessage("정정 사유를 입력해 주세요."); return; }
    const label = action === "cancel" ? "출석을 취소" : "출석을 관리자 보정";
    if (!window.confirm(`${row.name} 교직원의 ${label}합니다. 계속할까요?`)) return;
    setSaving(true); setMessage("");
    try { await correctAttendance({ eventId, staffId: row.staffId, reason, action }); setReason(""); onSaved(); }
    catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }
  if (row.status === "제외") return null;
  return <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="grid gap-1 text-xs text-[#627083]">정정 사유<input className="min-h-11 min-w-0 rounded-[9px] border border-[#DDEAE7] px-3 text-sm text-[#102047]" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} placeholder="필수 입력" /></label><button type="button" disabled={saving} onClick={() => apply(row.status === "서명 완료" ? "cancel" : "mark-attended")} className={secondary}>{row.status === "서명 완료" ? "출석 취소" : "출석 보정"}</button>{message && <p role="alert" className="text-xs text-[#B42318]">{message}</p>}</div>;
}

export function TrainingAttendanceAdminContent({ displayName, eventId, finalSheet = false, loadSummary = getTrainingAttendanceSummary, loadFinal = getTrainingFinalSheet, correctAttendance = correctTrainingAttendance, downloadSheet = downloadTrainingFinalSheet }) {
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
  const shown = useMemo(() => model?.rows.filter((row) => filter === "전체" || (filter === "완료" && row.status === "서명 완료") || (filter === "미완료" && row.status === "미서명") || (filter === "제외" && row.status === "제외")) || [], [model, filter]);
  async function download() {
    setWorking(true); setMessage("");
    try { await downloadSheet(eventId, `${model.event.date}_${model.event.title.replace(/[\\/:*?"<>|]/g, "_")}_연수등록부.pdf`); }
    catch (error) { setMessage(error.message); }
    finally { setWorking(false); }
  }
  return <FirebaseV2PageShell className="training-phase2-surface" label="교직원 교육" title={finalSheet ? "연수등록부 미리보기" : "교육 출석 현황"} description={finalSheet ? "현재 유효한 대상과 전자서명을 확인하고 공식 연수등록부 PDF를 생성합니다." : "대상별 출석을 확인하고 사유를 남겨 정정합니다."} displayName={displayName}>
    <div className="flex flex-wrap gap-2"><Link className={secondary} to="/firebase-admin/trainings">교육 관리로</Link><Link className={secondary} to={`/firebase-admin/trainings/${encodeURIComponent(eventId)}/${finalSheet ? "attendance" : "final-sheet"}`}>{finalSheet ? "출석 현황" : "연수등록부 미리보기"}</Link></div>
    {state === "loading" && <p className="text-sm text-[#627083]">서명 기록을 불러오는 중입니다.</p>}
    {state === "error" && <p role="alert" className="text-sm text-[#B42318]">{message}</p>}
    {state === "ready" && model && <section className="space-y-3">
      <div className="rounded-[12px] border border-[#DDEAE7] bg-white p-3"><h2 className="break-keep text-base font-bold text-[#102047]">{model.event.title}</h2><p className="mt-1 text-xs text-[#627083]">{model.event.date} · {model.event.location}</p><dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm"><div><dt className="text-xs text-[#627083]">대상</dt><dd className="font-bold tabular-nums">{model.counts.target}</dd></div><div><dt className="text-xs text-[#627083]">서명 완료</dt><dd className="font-bold tabular-nums">{model.counts.signed}</dd></div><div><dt className="text-xs text-[#627083]">제외</dt><dd className="font-bold tabular-nums">{model.counts.excluded}</dd></div></dl></div>
      <div className="flex flex-wrap items-center justify-between gap-2"><label className="grid gap-1 text-xs text-[#627083]">상태 필터<select className="min-h-11 rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-sm text-[#102047]" value={filter} onChange={(event) => setFilter(event.target.value)}><option>전체</option><option>완료</option><option>미완료</option><option>제외</option></select></label>{finalSheet && <button type="button" className="min-h-11 rounded-[9px] bg-[#0D4EA6] px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={working} onClick={download}>{working ? "생성 중" : "PDF 다운로드"}</button>}</div>
      {shown.length === 0 && <p className="rounded-[10px] border border-[#DDEAE7] bg-white p-3 text-sm text-[#627083]">표시할 교직원이 없습니다.</p>}
      <ol className="space-y-2">{shown.map((row, index) => <li key={row.staffId} className="min-w-0 rounded-[10px] border border-[#DDEAE7] bg-white p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="text-sm font-semibold text-[#102047]">{index + 1}. {row.name} · {row.position}</p><p className="mt-1 text-xs text-[#627083]">{row.department} · {signedTime(row.signedAt)}</p></div><span className="text-xs font-semibold text-[#3154A3]">{row.status}{row.hasSignatureImage ? " · 서명 이미지" : ""}</span></div>{!finalSheet && <Correction row={row} eventId={eventId} onSaved={reload} correctAttendance={correctAttendance} />}</li>)}</ol>
      {message && <p role="alert" className="text-sm text-[#B42318]">{message}</p>}
    </section>}
  </FirebaseV2PageShell>;
}

export default function FirebaseTrainingAttendanceAdminPage({ finalSheet = false }) {
  const { eventId } = useParams();
  return <FirebaseAdminRoleAccessGate deniedTitle="교육 출석 관리 권한이 없습니다.">{({ displayName }) => <TrainingAttendanceAdminContent displayName={displayName} eventId={eventId} finalSheet={finalSheet} />}</FirebaseAdminRoleAccessGate>;
}
