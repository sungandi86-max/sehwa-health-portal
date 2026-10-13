import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import FirebaseAdminRoleAccessGate from "../components/FirebaseAdminRoleAccessGate.jsx";
import { TrainingAdminLayout } from "../components/TrainingAdminLayout.jsx";
import { bootstrapTrainingSignatureStorage, getTrainingAttendanceSummary, getTrainingRuntimePreflight, listManagedTrainings, listTrainingDirectory, saveManagedTraining } from "../lib/trainingCenterPhase2.js";
import { getTrainingStorageBootstrapUiState, performTrainingStorageBootstrap, summarizeTrainingRuntimePreflight } from "../lib/trainingRuntimePreflight.js";
import { trainingAttendanceCounts } from "../lib/trainingAttendancePresentation.js";
import { selectTrainingTargets } from "../../common/trainingTargetSelection.js";
import { TrainingTargetPicker } from "./TrainingTargetPicker.jsx";

const fieldClass = "mt-1 min-h-11 w-full min-w-0 rounded-[9px] border border-[#DDEAE7] bg-white px-3 py-2 text-sm text-[#102047] outline-none focus:border-[#0D4EA6] focus:ring-4 focus:ring-[#0D4EA6]/10";
const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-[9px] border border-[#0D4EA6] bg-[#0D4EA6] px-4 text-sm font-semibold text-white disabled:opacity-50";
const secondaryClass = "inline-flex min-h-11 items-center justify-center rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-sm font-semibold text-[#0D4EA6]";
const blank = { eventId: "", eventGroupId: "", "교육연도": "2026", "사용여부": "미사용", "상태": "예정", "교육명": "", "담당부서": "", "담당자": "", "일자": "", "시작시간": "", "종료시간": "", "장소": "", "교육내용": "", "이수기준": "", signatureOpenAt: "", signatureCloseAt: "", "정렬순서": "0" };

function localInputValue(value) {
  return value ? value.slice(0, 16) : "";
}

function TrainingForm({ initial, onSaved, onCancel, saveTraining = saveManagedTraining, loadDirectory = listTrainingDirectory }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [step, setStep] = useState("details");
  const [directory, setDirectory] = useState([]);
  const [directoryState, setDirectoryState] = useState("loading");
  const [selection, setSelection] = useState({ preset: "all", includeAdministrativeStaff: true,
    includeHourlyInstructors: true, department: "", includeStaffIds: [], excludeStaffIds: [] });
  useEffect(() => { setForm(initial); setStep("details"); }, [initial]);
  useEffect(() => {
    if (initial.eventId) return;
    let active = true;
    loadDirectory().then((result) => { if (active) { setDirectory(result.items); setDirectoryState("ready"); } })
      .catch(() => { if (active) setDirectoryState("error"); });
    return () => { active = false; };
  }, [initial.eventId, loadDirectory]);
  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    try {
      let reviewedTargets;
      if (!initial.eventId && step === "details") { setStep("targets"); return; }
      if (!initial.eventId) {
        if (directoryState !== "ready") throw new Error("교직원명단을 불러온 뒤 대상자를 선택해 주세요.");
        reviewedTargets = selectTrainingTargets(directory, selection).members;
        if (step === "targets") { setStep("confirm"); return; }
      }
      setSaving(true);
      const payload = { ...form,
        ...(!initial.eventId ? { targetSelection: selection,
          reviewedTargets: reviewedTargets.map(({ staffId, name, position, department }) => ({ staffId, name, position, department })) } : {}),
        signatureOpenAt: form.signatureOpenAt ? `${localInputValue(form.signatureOpenAt)}:00+09:00` : "",
        signatureCloseAt: form.signatureCloseAt ? `${localInputValue(form.signatureCloseAt)}:00+09:00` : "" };
      const result = await saveTraining(payload);
      onSaved(result.item);
    } catch (error) {
      if (error.message.includes("대상자 명단이 변경되었습니다")) {
        setDirectoryState("loading");
        setStep("targets");
        try { const result = await loadDirectory(); setDirectory(result.items); setDirectoryState("ready"); }
        catch { setDirectoryState("error"); }
      }
      setMessage(error.message);
    }
    finally { setSaving(false); }
  }

  return <form className="training-admin-panel space-y-4 p-4 sm:p-5" onSubmit={submit}>
    <div className="flex items-center justify-between gap-3"><h2 className="text-base font-bold text-[#102047]">{initial.eventId ? "교육 수정" : "교육 등록"}</h2><button type="button" onClick={onCancel} className={secondaryClass}>닫기</button></div>
    {!initial.eventId && <ol className="grid grid-cols-3 border-y border-[#DDEAE7] py-2 text-center text-xs font-semibold text-[#627083]" aria-label="교육 등록 단계">
      {[["details", "1. 기본 정보"], ["targets", "2. 대상자 설정"], ["confirm", "3. 대상자 확인"]].map(([key, label]) => <li key={key} className={step === key ? "text-[#0D4EA6]" : ""} aria-current={step === key ? "step" : undefined}>{label}</li>)}
    </ol>}
    {(initial.eventId || step === "details") && <>
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
    </>}
    {!initial.eventId && step !== "details" && <>
      {directoryState === "loading" && <p role="status" className="text-sm text-[#627083]">교직원명단을 불러오는 중입니다.</p>}
      {directoryState === "error" && <p role="alert" className="text-sm text-[#B42318]">교직원명단을 불러오지 못했습니다. 교육 등록을 다시 시작해 주세요.</p>}
      {directoryState === "ready" && <TrainingTargetPicker directory={directory} selection={selection} onChange={setSelection} review={step === "confirm"} />}
    </>}
    {message && <p role="alert" className="break-keep text-sm text-[#B42318]">{message}</p>}
    <div className="flex flex-wrap gap-2">
      {!initial.eventId && step !== "details" && <button className={secondaryClass} type="button" onClick={() => { setMessage(""); setStep(step === "confirm" ? "targets" : "details"); }}>이전</button>}
      <button className={buttonClass} type="submit" disabled={saving || (!initial.eventId && step !== "details" && directoryState !== "ready")}>
        {saving ? "저장 중" : initial.eventId ? "교육 저장" : step === "details" ? "대상자 설정" : step === "targets" ? "대상자 확인" : "교육 생성"}
      </button>
    </div>
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

export function TrainingAdminContent({ displayName, hasTopLevelAdminAccess = true, loadTrainings = listManagedTrainings, loadSummary = getTrainingAttendanceSummary, saveTraining = saveManagedTraining, runPreflight = getTrainingRuntimePreflight }) {
  const [items, setItems] = useState([]);
  const [summaries, setSummaries] = useState({});
  const [summaryFailures, setSummaryFailures] = useState(0);
  const [state, setState] = useState("loading");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(null);
  async function reload() {
    setState("loading");
    try { const result = await loadTrainings(); setItems(result.items); setState("ready"); }
    catch (error) { setMessage(error.message); setState("error"); }
  }
  useEffect(() => { reload(); }, []);
  useEffect(() => {
    if (state !== "ready" || !items.length) return;
    let active = true;
    Promise.all(items.map(async (item) => {
      try { return [item.eventId, trainingAttendanceCounts((await loadSummary(item.eventId)).counts)]; }
      catch { return [item.eventId, null]; }
    })).then((entries) => {
      if (!active) return;
      setSummaries(Object.fromEntries(entries));
      setSummaryFailures(entries.filter(([, counts]) => counts === null).length);
    });
    return () => { active = false; };
  }, [items, state, loadSummary]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const upcoming = items.filter((item) => item["사용여부"] === "사용" && item["일자"] >= today)
    .sort((left, right) => left["일자"].localeCompare(right["일자"]))[0];
  const currentCounts = upcoming && summaries[upcoming.eventId];
  return <TrainingAdminLayout displayName={displayName} active="manage" title="교직원 교육 운영관리" description="교육 등록과 대상·QR·출석 업무를 한곳에서 관리합니다.">
    <div className="flex flex-wrap items-center justify-between gap-2"><Link className={secondaryClass} to={hasTopLevelAdminAccess ? "/firebase-dashboard" : "/training"}>{hasTopLevelAdminAccess ? "관리자 화면으로" : "교육센터로"}</Link><button className={buttonClass} type="button" onClick={() => setEditing({ ...blank })}>교육 등록</button></div>
    {editing && <TrainingForm initial={editing} saveTraining={saveTraining} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    {state === "loading" && <p className="text-sm text-[#627083]">교육 목록을 불러오는 중입니다.</p>}
    {state === "error" && <p role="alert" className="text-sm text-[#B42318]">{message}</p>}
    {state === "ready" && summaryFailures > 0 && <p role="alert" className="text-sm text-[#B42318]">{summaryFailures}건의 출석 집계를 불러오지 못했습니다. 해당 교육의 출석 화면에서 다시 확인해 주세요.</p>}
    {state === "ready" && <section className="training-admin-panel overflow-hidden" aria-label="오늘의 교육">
      <div className="border-b border-[#DDEAE7] px-4 py-3"><h2 className="text-base font-bold text-[#102047]">오늘의 교육 · 다음 일정</h2></div>
      {upcoming ? <><div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4"><div><h3 className="break-keep text-lg font-bold text-[#102047]">{upcoming["교육명"]}</h3><p className="mt-1 text-sm text-[#627083]">{upcoming["일자"]} {upcoming["시작시간"]}~{upcoming["종료시간"]} · {upcoming["장소"] || "장소 미정"}</p><p className="mt-1 text-xs text-[#627083]">{upcoming["담당부서"]} · {upcoming["상태"]}</p></div><Link className={secondaryClass} to={`/firebase-admin/trainings/${encodeURIComponent(upcoming.eventId)}/qr`}>QR 출석 화면</Link></div>
        <dl className="grid grid-cols-3 border-t border-[#DDEAE7]"><div className="training-admin-metric"><dt className="text-xs text-[#627083]">대상자</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{currentCounts ? currentCounts.target : "—"}</dd></div><div className="training-admin-metric"><dt className="text-xs text-[#627083]">출석 완료</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-[#08754B]">{currentCounts ? currentCounts.signed : "—"}</dd></div><div className="training-admin-metric"><dt className="text-xs text-[#627083]">미출석</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{currentCounts ? currentCounts.missing : "—"}</dd></div></dl></>
        : <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-5"><p className="text-sm text-[#627083]">예정된 교육이 없습니다.</p><button type="button" className={secondaryClass} onClick={() => setEditing({ ...blank })}>새 교육 만들기</button></div>}
    </section>}
    {state === "ready" && <section className="training-admin-panel overflow-hidden" aria-label="교육 목록">
      <div className="border-b border-[#DDEAE7] px-4 py-3"><h2 className="text-base font-bold text-[#102047]">교육 목록</h2><p className="mt-1 text-xs text-[#627083]">관리 권한이 있는 교육 {items.length}건</p></div>
      {items.length === 0 ? <p className="px-4 py-5 text-sm text-[#627083]">등록된 교육이 없습니다.</p> : <div className="divide-y divide-[#DDEAE7]">{items.map((item) => {
        const counts = summaries[item.eventId];
        const path = `/firebase-admin/trainings/${encodeURIComponent(item.eventId)}`;
        return <article className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center" key={item.eventId}>
          <div className="min-w-0"><h3 className="break-keep text-sm font-bold text-[#102047]">{item["교육명"]}</h3><p className="mt-1 text-xs text-[#627083]">{item["일자"]} {item["시작시간"]} · {item["장소"] || "장소 미정"} · {item["상태"]} · {item["사용여부"]}</p><p className="mt-1 text-xs tabular-nums text-[#627083]">대상 {counts ? counts.target : "—"} · 출석 {counts ? counts.signed : "—"} · 미출석 {counts ? counts.missing : "—"}</p></div>
          <div className="flex flex-wrap gap-2"><button className={secondaryClass} type="button" onClick={() => setEditing(item)}>수정</button><Link className={secondaryClass} to={`${path}/targets`}>대상</Link><Link className={secondaryClass} to={`${path}/qr`}>QR</Link><Link className={secondaryClass} to={`${path}/attendance`}>출석</Link><Link className={secondaryClass} to={`${path}/final-sheet`}>등록부</Link></div>
        </article>;
      })}</div>}
    </section>}
    {hasTopLevelAdminAccess && <TrainingRuntimePreflight runPreflight={runPreflight} />}
  </TrainingAdminLayout>;
}

export default function FirebaseTrainingAdminPage() {
  return <FirebaseAdminRoleAccessGate allowTrainingAdmin deniedTitle="교육 관리자 권한이 없습니다.">{({ displayName, hasTopLevelAdminAccess }) => <TrainingAdminContent displayName={displayName} hasTopLevelAdminAccess={hasTopLevelAdminAccess} />}</FirebaseAdminRoleAccessGate>;
}
