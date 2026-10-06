import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import FirebaseStaffSubmissionAccessGate from "../components/FirebaseStaffSubmissionAccessGate.jsx";
import { FirebaseV2PageShell } from "../components/FirebaseV2PageShell.jsx";
import { checkTrainingAttendance, submitTrainingAttendance } from "../lib/trainingCenterPhase2.js";

function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  function point(event) {
    const box = canvasRef.current.getBoundingClientRect();
    return { x: (event.clientX - box.left) * canvasRef.current.width / box.width, y: (event.clientY - box.top) * canvasRef.current.height / box.height };
  }
  function start(event) {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = point(event);
    canvas.setPointerCapture(event.pointerId);
    drawing.current = true;
    ctx.strokeStyle = "#102047";
    ctx.fillStyle = "#102047";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y);
    onChange(true);
  }
  function move(event) {
    if (!drawing.current) return;
    const { x, y } = point(event);
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(x, y); ctx.stroke();
  }
  function stop(event) {
    if (!drawing.current) return;
    drawing.current = false;
    if (canvasRef.current.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId);
  }
  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    onChange(false);
  }
  return <div className="space-y-2"><canvas ref={canvasRef} width={600} height={200} aria-label="전자서명 입력 영역" className="block aspect-[3/1] w-full max-w-[600px] touch-none rounded-[9px] border border-[#DDEAE7] bg-white" onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} /><button type="button" onClick={clear} className="min-h-11 rounded-[9px] border border-[#DDEAE7] bg-white px-4 text-sm font-semibold text-[#0D4EA6]">서명 지우기</button></div>;
}

export function TrainingAttendanceContent({ displayName, group = false, id, challenge, checkAttendance = checkTrainingAttendance, submitAttendance = submitTrainingAttendance }) {
  const [state, setState] = useState({ status: "loading", items: [], canSubmit: false });
  const [hasInk, setHasInk] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const canvasHost = useRef(null);
  const scope = group ? { eventGroupId: id, challenge } : { eventId: id, challenge };
  useEffect(() => {
    let active = true;
    if (!challenge) { setState({ status: "error", message: "QR 링크가 올바르지 않습니다.", items: [], canSubmit: false }); return; }
    checkAttendance(scope).then((result) => { if (active) setState({ status: "ready", items: result.items, canSubmit: result.canSubmit }); })
      .catch((error) => { if (active) setState({ status: "error", message: error.message, items: [], canSubmit: false }); });
    return () => { active = false; };
  }, [id, challenge, group, checkAttendance]);

  async function submit() {
    const canvas = canvasHost.current?.querySelector("canvas");
    if (!canvas || !hasInk) { setMessage("서명을 입력해 주세요."); return; }
    setWorking(true); setMessage("");
    try {
      await submitAttendance({ ...scope, signature: canvas.toDataURL("image/png") });
      setState((current) => ({ ...current, status: "done" }));
    } catch (error) { setMessage(error.message); }
    finally { setWorking(false); }
  }

  return <FirebaseV2PageShell className="training-phase2-surface" label="교직원 교육" title="QR 출석·전자서명" description="본인 계정으로 대상 여부와 서명 시간을 확인합니다." displayName={displayName}>
    <Link to="/training" className="inline-flex min-h-11 items-center rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-sm font-semibold text-[#0D4EA6]">교육 목록으로</Link>
    {state.status === "loading" && <p className="text-sm text-[#627083]">출석 가능 여부를 확인하는 중입니다.</p>}
    {state.status === "error" && <p role="alert" className="rounded-[10px] border border-[#F6D8D8] bg-[#FFF7F7] p-3 text-sm text-[#B42318]">{state.message}</p>}
    {state.status === "done" && <div role="status" className="rounded-[10px] border border-[#BFEBDC] bg-[#F0FBF7] p-3 text-sm font-semibold text-[#08754B]">전자서명 출석이 완료되었습니다.</div>}
    {state.status === "ready" && <section className="space-y-3 rounded-[12px] border border-[#DDEAE7] bg-white p-3 sm:p-4">
      <h2 className="text-base font-bold text-[#102047]">{group ? "묶음 교육 출석" : "교육 출석"}</h2>
      <ul className="divide-y divide-[#DDEAE7]">{state.items.map((item) => <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" key={item.eventId}><span className="break-keep font-semibold text-[#102047]">{item.title}</span><span className={item.eligible ? "text-[#08754B]" : "text-[#B42318]"}>{item.eligible ? "서명 가능" : item.reason}</span></li>)}</ul>
      {!state.canSubmit && <p className="break-keep text-sm text-[#627083]">묶음 교육은 모든 교육이 출석 가능해야 한 번에 서명할 수 있습니다.</p>}
      {state.canSubmit && <div ref={canvasHost} className="space-y-3 border-t border-[#DDEAE7] pt-3"><label className="block text-sm font-semibold text-[#102047]">전자서명</label><SignaturePad onChange={setHasInk} /><p className="text-xs text-[#627083]">손가락이나 마우스로 직접 서명해 주세요. 이 서명은 비공개 파일로 저장됩니다.</p><button type="button" disabled={working || !hasInk} onClick={submit} className="min-h-11 rounded-[9px] bg-[#0D4EA6] px-5 text-sm font-semibold text-white disabled:opacity-50">{working ? "저장 중" : "서명 제출"}</button></div>}
      {message && <p role="alert" className="break-keep text-sm text-[#B42318]">{message}</p>}
    </section>}
  </FirebaseV2PageShell>;
}

export default function TrainingAttendancePage({ group = false }) {
  const { eventId, eventGroupId } = useParams();
  const [search] = useSearchParams();
  return <FirebaseStaffSubmissionAccessGate accessTitle="교육 출석" readOnly>{({ displayName }) => <TrainingAttendanceContent displayName={displayName} group={group} id={group ? eventGroupId : eventId} challenge={search.get("challenge") || ""} />}</FirebaseStaffSubmissionAccessGate>;
}
