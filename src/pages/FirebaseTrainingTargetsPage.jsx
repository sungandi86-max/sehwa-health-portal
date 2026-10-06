import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import FirebaseAdminRoleAccessGate from "../components/FirebaseAdminRoleAccessGate.jsx";
import { FirebaseV2PageShell } from "../components/FirebaseV2PageShell.jsx";
import { listTrainingDirectory, listTrainingTargets, saveTrainingTarget } from "../lib/trainingCenterPhase2.js";

const control = "min-h-11 min-w-0 rounded-[9px] border border-[#DDEAE7] bg-white px-2 text-sm text-[#102047] focus:border-[#0D4EA6] focus:outline-none";

function TargetRow({ person, current, eventId, onSaved, saveTarget }) {
  const [status, setStatus] = useState(current?.["대상상태"] || "비대상");
  const [required, setRequired] = useState(current?.["필수여부"] === "Y");
  const [reason, setReason] = useState(current?.["제외사유"] || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    setSaving(true);
    setMessage("");
    try { await saveTarget({ eventId, staffId: person.staffId, targetStatus: status, required, excludedReason: reason }); onSaved(); }
    catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }
  return <li className="min-w-0 border-t border-[#DDEAE7] px-3 py-3">
    <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="text-sm font-semibold text-[#102047]">{person.name} <span className="font-normal text-[#627083]">· {person.position} · {person.department}</span></p><p className="text-xs text-[#627083]">교직원ID: {person.staffId}</p></div><span className="text-xs text-[#627083]">현재 {current?.["대상상태"] || "미지정"}</span></div>
    <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-center">
      <label className="grid gap-1 text-xs text-[#627083]">대상 상태<select className={control} value={status} onChange={(event) => { setStatus(event.target.value); if (event.target.value !== "대상") setRequired(false); }}><option value="비대상">비대상</option><option value="대상">대상</option><option value="제외">제외</option></select></label>
      <label className="flex min-h-11 items-center gap-2 text-sm text-[#102047]"><input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} disabled={status !== "대상"} />필수</label>
      <label className="grid gap-1 text-xs text-[#627083]">제외 사유<input className={control} value={reason} onChange={(event) => setReason(event.target.value)} disabled={status !== "제외"} maxLength={200} placeholder={status === "제외" ? "제외 사유 입력" : "제외 시 입력"} /></label>
      <button className="min-h-11 rounded-[9px] bg-[#0D4EA6] px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={saving} onClick={save} type="button">{saving ? "저장 중" : "저장"}</button>
    </div>
    {message && <p role="alert" className="mt-1 text-xs text-[#B42318]">{message}</p>}
  </li>;
}

export function TrainingTargetsContent({ displayName, eventId, loadDirectory = listTrainingDirectory, loadTargets = listTrainingTargets, saveTarget = saveTrainingTarget }) {
  const [directory, setDirectory] = useState([]);
  const [targets, setTargets] = useState([]);
  const [query, setQuery] = useState("");
  const [state, setState] = useState("loading");
  const [message, setMessage] = useState("");
  async function reload() {
    try {
      const [staff, target] = await Promise.all([loadDirectory(), loadTargets(eventId)]);
      setDirectory(staff.items); setTargets(target.items); setState("ready");
    } catch (error) { setMessage(error.message); setState("error"); }
  }
  useEffect(() => { reload(); }, [eventId]);
  const shown = useMemo(() => directory.filter((person) => [person.name, person.department, person.position, person.staffId].some((value) => value?.includes(query.trim()))), [directory, query]);
  const count = targets.filter((target) => ["대상", "교육 대상"].includes(target["대상상태"]) && target["제외여부"] !== "Y").length;
  return <FirebaseV2PageShell className="training-phase2-surface" label="교직원 교육" title="교육 대상 관리" description="재직 교직원의 교직원ID로 대상 여부를 지정합니다." displayName={displayName}>
    <Link to="/firebase-admin/trainings" className="inline-flex min-h-11 items-center rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-sm font-semibold text-[#0D4EA6]">교육 관리로</Link>
    {state === "loading" && <p className="text-sm text-[#627083]">대상 정보를 불러오는 중입니다.</p>}
    {state === "error" && <p role="alert" className="text-sm text-[#B42318]">{message}</p>}
    {state === "ready" && <section className="overflow-hidden rounded-[12px] border border-[#DDEAE7] bg-white">
      <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-semibold text-[#102047]">현재 대상 {count}명</p><label className="grid gap-1 text-xs text-[#627083]">교직원 검색<input className={control} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="성명 · 부서 · 교직원ID" /></label></div>
      <ul>{shown.map((person) => <TargetRow key={person.staffId} person={person} current={targets.find((target) => target["교직원ID"] === person.staffId)} eventId={eventId} onSaved={reload} saveTarget={saveTarget} />)}</ul>
      {shown.length === 0 && <p className="border-t border-[#DDEAE7] p-3 text-sm text-[#627083]">검색 결과가 없습니다.</p>}
    </section>}
  </FirebaseV2PageShell>;
}

export default function FirebaseTrainingTargetsPage() {
  const { eventId } = useParams();
  return <FirebaseAdminRoleAccessGate deniedTitle="교육 대상 관리 권한이 없습니다.">{({ displayName }) => <TrainingTargetsContent displayName={displayName} eventId={eventId} />}</FirebaseAdminRoleAccessGate>;
}
