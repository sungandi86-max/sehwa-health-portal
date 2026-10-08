import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import FirebaseAdminRoleAccessGate from "../components/FirebaseAdminRoleAccessGate.jsx";
import { FirebaseV2PageShell } from "../components/FirebaseV2PageShell.jsx";
import { bootstrapTrainingSignatureStorage, getTrainingRuntimePreflight, listManagedTrainings, saveManagedTraining } from "../lib/trainingCenterPhase2.js";
import { getTrainingStorageBootstrapUiState, performTrainingStorageBootstrap, summarizeTrainingRuntimePreflight } from "../lib/trainingRuntimePreflight.js";

const fieldClass = "mt-1 min-h-11 w-full min-w-0 rounded-[9px] border border-[#DDEAE7] bg-white px-3 py-2 text-sm text-[#102047] outline-none focus:border-[#0D4EA6] focus:ring-4 focus:ring-[#0D4EA6]/10";
const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-[9px] border border-[#0D4EA6] bg-[#0D4EA6] px-4 text-sm font-semibold text-white disabled:opacity-50";
const secondaryClass = "inline-flex min-h-11 items-center justify-center rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-sm font-semibold text-[#0D4EA6]";
const blank = { eventId: "", eventGroupId: "", "교육연도": "2026", "사용여부": "미사용", "상태": "예정", "교육명": "", "담당부서": "", "담당자": "", "일자": "", "시작시간": "", "종료시간": "", "장소": "", "교육내용": "", "이수기준": "", signatureOpenAt: "", signatureCloseAt: "", "정렬순서": "0" };

function localInputValue(value) {
  return value ? value.slice(0, 16) : "";
}

function TrainingForm({ initial, onSaved, onCancel, saveTraining = saveManagedTraining }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => setForm(initial), [initial]);
  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const payload = { ...form,
        signatureOpenAt: form.signatureOpenAt ? `${localInputValue(form.signatureOpenAt)}:00+09:00` : "",
        signatureCloseAt: form.signatureCloseAt ? `${localInputValue(form.signatureCloseAt)}:00+09:00` : "" };
      const result = await saveTraining(payload);
      onSaved(result.item);
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  return <form className="space-y-3 rounded-[12px] border border-[#DDEAE7] bg-white p-3 sm:p-4" onSubmit={submit}>
    <div className="flex items-center justify-between gap-3"><h2 className="text-base font-bold text-[#102047]">{initial.eventId ? "교육 수정" : "교육 등록"}</h2><button type="button" onClick={onCancel} className={secondaryClass}>닫기</button></div>
    <p className="text-xs text-[#627083]">새 교육은 기본적으로 미사용으로 저장됩니다. 대상과 QR 준비를 확인한 뒤 사용으로 전환하세요.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold text-[#102047]">교육명<input className={fieldClass} value={form["교육명"]} onChange={set("교육명")} maxLength={150} required /></label>
      <label className="text-sm font-semibold text-[#102047]">묶음 ID<input className={fieldClass} value={form.eventGroupId} onChange={set("eventGroupId")} placeholder="묶음 교육일 때만 입력" /></label>
      <label className="text-sm font-semibold text-[#102047]">상태<select className={fieldClass} value={form["상태"]} onChange={set("상태")}><option>예정</option><option>진행중</option><option>완료</option><option>비활성</option></select></label>
      <label className="text-sm font-semibold text-[#102047]">사용여부<select className={fieldClass} value={form["사용여부"]} onChange={set("사용여부")}><option>미사용</option><option>사용</option></select></label>
      <label className="text-sm font-semibold text-[#102047]">일자<input className={fieldClass} type="date" value={form["일자"]} onChange={set("일자")} required /></label>
      <label className="text-sm font-semibold text-[#102047]">장소<input className={fieldClass} value={form["장소"]} onChange={set("장소")} maxLength={120} /></label>
      <label className="text-sm font-semibold text-[#102047]">시작시간<input className={fieldClass} type="time" value={form["시작시간"]} onChange={set("시작시간")} required /></label>
      <label className="text-sm font-semibold text-[#102047]">종료시간<input className={fieldClass} type="time" value={form["종료시간"]} onChange={set("종료시간")} required /></label>
      <label className="text-sm font-semibold text-[#102047]">담당부서<input className={fieldClass} value={form["담당부서"]} onChange={set("담당부서")} maxLength={100} required /></label>
      <label className="text-sm font-semibold text-[#102047]">담당자<input className={fieldClass} value={form["담당자"]} onChange={set("담당자")} maxLength={100} /></label>
      <label className="text-sm font-semibold text-[#102047]">서명 시작<input className={fieldClass} type="datetime-local" value={localInputValue(form.signatureOpenAt)} onChange={set("signatureOpenAt")} required /></label>
      <label className="text-sm font-semibold text-[#102047]">서명 종료<input className={fieldClass} type="datetime-local" value={localInputValue(form.signatureCloseAt)} onChange={set("signatureCloseAt")} required /></label>
      <label className="text-sm font-semibold text-[#102047]">정렬순서<input className={fieldClass} type="number" value={form["정렬순서"]} onChange={set("정렬순서")} /></label>
      <label className="text-sm font-semibold text-[#102047]">이수기준<input className={fieldClass} value={form["이수기준"]} onChange={set("이수기준")} maxLength={200} /></label>
    </div>
    <label className="block text-sm font-semibold text-[#102047]">교육내용<textarea className={`${fieldClass} min-h-28`} value={form["교육내용"]} onChange={set("교육내용")} maxLength={2000} /></label>
    {message && <p role="alert" className="break-keep text-sm text-[#B42318]">{message}</p>}
    <button className={buttonClass} type="submit" disabled={saving}>{saving ? "저장 중" : "교육 저장"}</button>
  </form>;
}

export function TrainingRuntimePreflight({
  runPreflight = getTrainingRuntimePreflight,
  bootstrapStorage = bootstrapTrainingSignatureStorage,
  confirmAction = (message) => window.confirm(message),
}) {
  const [state, setState] = useState("idle");
  const [result, setResult] = useState(null);
  const [bootstrapState, setBootstrapState] = useState("idle");

  async function check({ throwOnError = false } = {}) {
    setState("loading");
    setResult(null);
    try {
      const next = summarizeTrainingRuntimePreflight(await runPreflight());
      setResult(next);
      setState("ready");
      return next;
    } catch {
      setState("error");
      if (throwOnError) throw new Error("runtime-preflight-failed");
      return null;
    }
  }

  async function bootstrap() {
    if (!bootstrapUi.enabled || bootstrapState === "loading") return;
    setBootstrapState("loading");
    const outcome = await performTrainingStorageBootstrap({
      confirmAction,
      bootstrapStorage,
      refresh: () => check({ throwOnError: true }),
    });
    setBootstrapState(outcome.status === "success" ? "success" : outcome.status === "error" ? "error" : "idle");
  }

  const failed = result?.checks.filter(({ passed }) => !passed) || [];
  const bootstrapUi = getTrainingStorageBootstrapUiState(result);
  const message = state === "idle" ? "아직 검사하지 않음" : state === "loading" ? "점검 중..."
    : state === "error" ? "점검 요청에 실패했습니다." : result?.ready ? "전체 준비 완료" : "점검 필요";

  return <section aria-label="런타임 점검" className="rounded-[10px] border border-[#DDEAE7] bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0"><h2 className="text-sm font-bold text-[#102047]">런타임 점검</h2><p className="mt-1 break-keep text-xs text-[#627083]" role="status" aria-live="polite">{message}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        {bootstrapUi.visible && <button className={secondaryClass} type="button" onClick={bootstrap} disabled={!bootstrapUi.enabled || bootstrapState === "loading"}>
          {bootstrapState === "loading" ? "초기화 중..." : bootstrapUi.label}
        </button>}
        <button className={secondaryClass} type="button" onClick={() => check()} disabled={state === "loading" || bootstrapState === "loading"}>{state === "loading" ? "점검 중..." : "런타임 점검"}</button>
      </div>
    </div>
    {bootstrapState === "success" && <p className="mt-3 break-keep text-xs text-[#08754B]" role="status">서명 저장소 초기화를 완료했습니다.</p>}
    {bootstrapState === "error" && <p className="mt-3 break-keep text-xs text-[#B42318]" role="alert">서명 저장소를 초기화하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>}
    {state === "ready" && result?.ready && <ul className="mt-3 grid gap-x-4 gap-y-1 border-t border-[#DDEAE7] pt-3 sm:grid-cols-2 lg:grid-cols-4">
      {result.checks.map(({ key, label }) => <li className="break-keep text-xs text-[#08754B]" key={key}>{label} PASS</li>)}
    </ul>}
    {state === "ready" && !result?.ready && <p className="mt-3 break-keep border-t border-[#DDEAE7] pt-3 text-xs text-[#B42318]">{failed.length ? failed.map(({ label }) => label).join(" · ") : "전체 판정을 확인해 주세요."}</p>}
  </section>;
}

export function TrainingAdminContent({ displayName, loadTrainings = listManagedTrainings, saveTraining = saveManagedTraining, runPreflight = getTrainingRuntimePreflight }) {
  const [items, setItems] = useState([]);
  const [state, setState] = useState("loading");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(null);
  async function reload() {
    setState("loading");
    try { setItems((await loadTrainings()).items); setState("ready"); }
    catch (error) { setMessage(error.message); setState("error"); }
  }
  useEffect(() => { reload(); }, []);
  return <FirebaseV2PageShell className="training-phase2-surface" label="교직원 교육" title="교육 관리" description="교육 등록과 대상·QR·출석 업무를 관리합니다." displayName={displayName}>
    <div className="flex flex-wrap items-center justify-between gap-2"><Link className={secondaryClass} to="/firebase-dashboard">관리자 화면으로</Link><button className={buttonClass} type="button" onClick={() => setEditing({ ...blank })}>교육 등록</button></div>
    <TrainingRuntimePreflight runPreflight={runPreflight} />
    {editing && <TrainingForm initial={editing} saveTraining={saveTraining} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    {state === "loading" && <p className="text-sm text-[#627083]">교육 목록을 불러오는 중입니다.</p>}
    {state === "error" && <p role="alert" className="text-sm text-[#B42318]">{message}</p>}
    {state === "ready" && items.length === 0 && <p className="rounded-[10px] border border-[#DDEAE7] bg-white px-3 py-4 text-sm text-[#627083]">등록된 교육이 없습니다.</p>}
    {state === "ready" && items.length > 0 && <section aria-label="교육 목록" className="space-y-2">
      {items.map((item) => <article className="rounded-[10px] border border-[#DDEAE7] bg-white p-3" key={item.eventId}>
        <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h2 className="break-keep text-sm font-bold text-[#102047]">{item["교육명"]}</h2><p className="mt-1 text-xs text-[#627083]">{item["일자"]} {item["시작시간"]} · {item["담당부서"]} · {item["상태"]} · {item["사용여부"]}</p></div><button className={secondaryClass} type="button" onClick={() => setEditing(item)}>수정</button></div>
        <div className="mt-3 flex flex-wrap gap-2"><Link className={secondaryClass} to={`/firebase-admin/trainings/${encodeURIComponent(item.eventId)}/targets`}>대상 관리</Link><Link className={secondaryClass} to={`/firebase-admin/trainings/${encodeURIComponent(item.eventId)}/qr`}>QR</Link><Link className={secondaryClass} to={`/firebase-admin/trainings/${encodeURIComponent(item.eventId)}/attendance`}>출석 현황</Link><Link className={secondaryClass} to={`/firebase-admin/trainings/${encodeURIComponent(item.eventId)}/final-sheet`}>연수등록부 미리보기</Link></div>
      </article>)}
    </section>}
  </FirebaseV2PageShell>;
}

export default function FirebaseTrainingAdminPage() {
  return <FirebaseAdminRoleAccessGate deniedTitle="교육 관리자 권한이 없습니다.">{({ displayName }) => <TrainingAdminContent displayName={displayName} />}</FirebaseAdminRoleAccessGate>;
}
