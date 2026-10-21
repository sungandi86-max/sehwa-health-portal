import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  approveTrainingGroupEvent,
  createTrainingGroupQr,
  listTrainingGroupCandidates,
  listTrainingGroups,
  saveTrainingGroup,
} from "../lib/trainingCenterPhase2.js";

const fieldClass = "mt-1 min-h-11 w-full min-w-0 rounded-[9px] border border-[#DDEAE7] bg-white px-3 py-2 text-sm text-[#102047] outline-none focus:border-[#0D4EA6] focus:ring-4 focus:ring-[#0D4EA6]/10";
const primaryClass = "inline-flex min-h-11 items-center justify-center rounded-[9px] border border-[#0D4EA6] bg-[#0D4EA6] px-4 text-sm font-semibold text-white disabled:opacity-50";
const secondaryClass = "inline-flex min-h-11 items-center justify-center rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-sm font-semibold text-[#0D4EA6] disabled:opacity-50";

function blankGroup(actorStaffId) {
  return { groupId: "", name: "", managerStaffId: actorStaffId || "", eventIds: [], revision: null };
}

export function TrainingGroupManager({
  hasTopLevelAdminAccess,
  loadCandidates = listTrainingGroupCandidates,
  loadGroups = listTrainingGroups,
  saveGroup = saveTrainingGroup,
  approveEvent = approveTrainingGroupEvent,
  createQr = createTrainingGroupQr,
}) {
  const [state, setState] = useState("loading");
  const [groups, setGroups] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [actorStaffId, setActorStaffId] = useState("");
  const [editing, setEditing] = useState(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [qr, setQr] = useState(null);

  async function reload() {
    setState("loading");
    setMessage("");
    try {
      const [groupResult, candidateResult] = await Promise.all([loadGroups(), loadCandidates()]);
      setGroups(groupResult.items || []);
      setCandidates(candidateResult.items || []);
      setActorStaffId(groupResult.actorStaffId || "");
      setState("ready");
    } catch (error) {
      setMessage(error.message);
      setState("error");
    }
  }

  useEffect(() => { reload(); }, []);
  const managers = useMemo(() => [...new Map(candidates.filter((item) => editing?.eventIds.includes(item.eventId))
    .map((item) => [item.ownerStaffId, { staffId: item.ownerStaffId, name: item.ownerName, department: item.department }])).values()], [candidates, editing?.eventIds]);

  function startCreate() {
    setQr(null);
    setEditing(blankGroup(actorStaffId));
  }

  function startEdit(group) {
    setQr(null);
    setEditing({ groupId: group.groupId, name: group.name, managerStaffId: group.managerStaffId,
      eventIds: [...group.eventIds], revision: group.revision });
  }

  function toggleEvent(eventId) {
    setEditing((current) => ({ ...current, eventIds: current.eventIds.includes(eventId)
      ? current.eventIds.filter((id) => id !== eventId) : [...current.eventIds, eventId] }));
  }

  async function submit(event) {
    event.preventDefault();
    setWorking(true);
    setMessage("");
    try {
      await saveGroup(editing);
      setEditing(null);
      await reload();
    } catch (error) { setMessage(error.message); }
    finally { setWorking(false); }
  }

  async function approve(groupId, eventId) {
    setWorking(true);
    setMessage("");
    try { await approveEvent({ groupId, eventId }); await reload(); }
    catch (error) { setMessage(error.message); }
    finally { setWorking(false); }
  }

  async function generateQr(group) {
    setWorking(true);
    setMessage("");
    try {
      const result = await createQr(group.groupId);
      setQr({ ...result, url: `${window.location.origin}${result.path}` });
    } catch (error) { setMessage(error.message); }
    finally { setWorking(false); }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-lg font-bold text-[#102047]">묶음 관리</h2><p className="mt-1 break-keep text-sm text-[#627083]">각 교육 담당자의 승인을 받은 뒤 전자서명 QR을 발급합니다.</p></div>
      <button className={primaryClass} type="button" onClick={startCreate}>묶음 만들기</button>
    </div>
    {editing && <form className="training-admin-panel space-y-4 p-4 sm:p-5" onSubmit={submit}>
      <div className="flex items-center justify-between gap-3"><h3 className="text-base font-bold text-[#102047]">{editing.groupId ? "묶음 수정" : "새 묶음"}</h3><button className={secondaryClass} type="button" onClick={() => setEditing(null)}>닫기</button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold text-[#102047]">묶음 이름<input className={fieldClass} value={editing.name} maxLength={120} required onChange={(event) => setEditing((current) => ({ ...current, name: event.target.value }))} /></label>
        {hasTopLevelAdminAccess ? <label className="text-sm font-semibold text-[#102047]">묶음 관리자<select className={fieldClass} required value={editing.managerStaffId} onChange={(event) => setEditing((current) => ({ ...current, managerStaffId: event.target.value }))}><option value="">선택</option>{managers.map((person) => <option value={person.staffId} key={person.staffId}>{person.name} · {person.department} · {person.staffId}</option>)}</select></label>
          : <div className="text-sm"><p className="font-semibold text-[#102047]">묶음 관리자</p><p className="mt-2 text-[#627083]">현재 로그인한 담당자</p></div>}
      </div>
      <fieldset><legend className="text-sm font-semibold text-[#102047]">참여 교육</legend><p className="mt-1 text-xs text-[#627083]">담당자가 다른 교육도 선택할 수 있으며, 각 담당자의 별도 승인이 필요합니다.</p><div className="mt-2 max-h-72 divide-y divide-[#DDEAE7] overflow-y-auto rounded-[9px] border border-[#DDEAE7]">{candidates.map((item) => <label className="flex min-h-12 cursor-pointer items-start gap-3 px-3 py-2 text-sm" key={item.eventId}><input className="mt-1 h-4 w-4 shrink-0" type="checkbox" checked={editing.eventIds.includes(item.eventId)} onChange={() => toggleEvent(item.eventId)} /><span className="min-w-0"><strong className="block break-keep text-[#102047]">{item.title}</strong><span className="break-keep text-xs text-[#627083]">{item.date} · {item.department} · {item.ownerName}</span></span></label>)}</div></fieldset>
      <button className={primaryClass} disabled={working || editing.eventIds.length < 2} type="submit">{working ? "저장 중" : "묶음 저장"}</button>
    </form>}
    {message && <p role="alert" className="break-keep text-sm text-[#B42318]">{message}</p>}
    {state === "loading" && <p className="text-sm text-[#627083]">묶음 목록을 불러오는 중입니다.</p>}
    {state === "ready" && groups.length === 0 && <p className="training-admin-panel p-5 text-sm text-[#627083]">등록된 교육 묶음이 없습니다.</p>}
    {state === "ready" && groups.map((group) => <section className="training-admin-panel overflow-hidden" key={group.groupId}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#DDEAE7] px-4 py-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-bold text-[#102047]">{group.name}</h3><span className="rounded-full border border-[#DDEAE7] px-2 py-0.5 text-xs text-[#627083]">revision {group.revision}</span>{group.lockedAt && <span className="rounded-full bg-[#F0FBF7] px-2 py-0.5 text-xs font-semibold text-[#08754B]">출석 시작됨</span>}</div><p className="mt-1 text-xs text-[#627083]">묶음 관리자 {group.managerName} · 교육 {group.events.length}건</p></div><div className="flex flex-wrap gap-2">{group.canEdit && !group.lockedAt && <button className={secondaryClass} type="button" onClick={() => startEdit(group)}>구성 수정</button>}{group.canManageQr && <button className={primaryClass} disabled={working || !group.ready} type="button" onClick={() => generateQr(group)}>묶음 QR 생성</button>}</div></div>
      <ul className="divide-y divide-[#DDEAE7]">{group.events.map((item) => <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm" key={item.eventId}><div className="min-w-0"><strong className="block break-keep text-[#102047]">{item.title}</strong><span className="text-xs text-[#627083]">{item.date} · {item.department} · 담당 {item.ownerName}</span></div><div className="flex items-center gap-2"><span className={item.approved ? "text-xs font-semibold text-[#08754B]" : "text-xs font-semibold text-[#B54708]"}>{item.approved ? "참여 승인" : "승인 대기"}</span>{item.canApprove && <button className={secondaryClass} disabled={working} type="button" onClick={() => approve(group.groupId, item.eventId)}>내 교육 승인</button>}</div></li>)}</ul>
    </section>)}
    {qr && <section id="training-group-qr-print" className="training-admin-panel p-4 sm:p-5"><div className="text-center"><h3 className="text-lg font-bold text-[#102047]">{qr.group.name}</h3><p className="mt-1 text-sm text-[#627083]">포함 교육 {qr.group.events.length}건 · revision {qr.group.revision}</p></div><div className="mx-auto mt-4 aspect-square w-full max-w-[300px] rounded-[10px] border border-[#DDEAE7] p-3"><QRCodeSVG className="h-full w-full" size={276} title="묶음 교육 출석 QR" value={qr.url} /></div><ul className="mx-auto mt-4 max-w-xl list-disc space-y-1 pl-5 text-sm text-[#102047]">{qr.group.events.map((item) => <li className="break-keep" key={item.eventId}>{item.title}</li>)}</ul><div className="mt-4 flex justify-center print:hidden"><button className={secondaryClass} type="button" onClick={() => window.print()}>QR 인쇄</button></div></section>}
    <style>{`@media print { body * { visibility: hidden !important; } #training-group-qr-print, #training-group-qr-print * { visibility: visible !important; } #training-group-qr-print { position: absolute; inset: 0 auto auto 0; width: 100%; border: 0; } }`}</style>
  </div>;
}
