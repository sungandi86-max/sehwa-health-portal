import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import FirebaseAdminRoleAccessGate from "../components/FirebaseAdminRoleAccessGate.jsx";
import { TrainingAdminLayout } from "../components/TrainingAdminLayout.jsx";
import { listTrainingDirectory, listTrainingTargets, saveTrainingTargetsBatch } from "../lib/trainingCenterPhase2.js";
import { selectTrainingTargets, toggleTrainingTarget } from "../../common/trainingTargetSelection.js";
import { TrainingTargetPicker } from "./TrainingTargetPicker.jsx";

const control = "min-h-11 min-w-0 rounded-[9px] border border-[var(--shh-border)] bg-white px-2 text-sm text-[var(--shh-primary)] focus:border-[var(--shh-action)] focus:outline-none";
const primary = "min-h-11 rounded-[9px] bg-[var(--shh-action)] px-4 text-sm font-semibold text-white disabled:opacity-50";
const secondary = "min-h-11 rounded-[9px] border border-[var(--shh-border)] bg-white px-4 text-sm font-semibold text-[var(--shh-action)]";

function initialSelection(directory, targets) {
  const active = new Set(directory.filter((person) => person.employmentStatus === "재직").map((person) => person.staffId));
  return { preset: "manual", includeAdministrativeStaff: true, includeHourlyInstructors: true, department: "",
    includeStaffIds: targets.filter((row) => ["대상", "교육 대상"].includes(row["대상상태"]) && row["제외여부"] !== "Y" &&
      active.has(row["교직원ID"])).map((row) => row["교직원ID"]), excludeStaffIds: [] };
}

function statusMeta({ person, selected, detail, previous }) {
  const status = detail?.targetStatus || (selected ? "대상" :
    previous?.["대상상태"] === "제외" || previous?.["제외여부"] === "Y" ? "제외" : "비대상");
  if (status === "대상") {
    const required = detail?.required ?? (previous && ["대상", "교육 대상"].includes(previous["대상상태"])
      ? previous["필수여부"] === "Y" : true);
    return { statusLabel: required ? "대상 · 필수" : "대상 · 선택", tone: "target" };
  }
  if (status === "제외") return { statusLabel: "제외", tone: "excluded" };
  return { statusLabel: previous || person ? "비대상" : "미확인", tone: "neutral" };
}

export function TrainingTargetsContent({ displayName, eventId, loadDirectory = listTrainingDirectory,
  loadTargets = listTrainingTargets, saveTargets = saveTrainingTargetsBatch }) {
  const [directory, setDirectory] = useState([]);
  const [targets, setTargets] = useState([]);
  const [revision, setRevision] = useState("");
  const [selection, setSelection] = useState(null);
  const [details, setDetails] = useState({});
  const [openDetailId, setOpenDetailId] = useState("");
  const [listExpanded, setListExpanded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState("loading");
  const [message, setMessage] = useState("");
  async function reload() {
    try {
      const [staff, target] = await Promise.all([loadDirectory(), loadTargets(eventId)]);
      setDirectory(staff.items); setTargets(target.items); setRevision(target.revision);
      setSelection(initialSelection(staff.items, target.items)); setDetails({}); setDirty(false);
      setMessage(""); setState("ready");
    } catch (error) { setMessage(error.message); setState("error"); }
  }
  useEffect(() => { reload(); }, [eventId]);
  const currentIds = useMemo(() => new Set(targets.filter((row) => ["대상", "교육 대상"].includes(row["대상상태"]) &&
    row["제외여부"] !== "Y").map((row) => row["교직원ID"])), [targets]);
  let members = [];
  let selectionError = "";
  if (selection) try { members = selectTrainingTargets(directory, selection).members; }
  catch (error) { selectionError = error.message; }
  const nextIds = new Set(members.map((person) => person.staffId));
  const added = members.filter((person) => !currentIds.has(person.staffId)).length;
  const removed = [...currentIds].filter((staffId) => !nextIds.has(staffId)).length;
  const activeIds = new Set(directory.map((person) => person.staffId));
  const archived = [...currentIds].filter((staffId) => !activeIds.has(staffId));
  const currentById = new Map(targets.map((row) => [row["교직원ID"], row]));
  const changedDetails = Object.keys(details).length;

  function changeSelection(next) {
    let selected = new Set();
    try { selected = new Set(selectTrainingTargets(directory, next).members.map((person) => person.staffId)); } catch { selected = new Set(); }
    setDetails((current) => Object.fromEntries(Object.entries(current)
      .filter(([staffId, detail]) => (detail.targetStatus === "대상") === selected.has(staffId))));
    setSelection(next); setDirty(true); setMessage("");
  }
  function setDetail(staffId, value) {
    setDetails((current) => ({ ...current, [staffId]: { ...(current[staffId] || {}), ...value } }));
    setDirty(true); setMessage("");
  }
  function setStatus(staffId, status) {
    changeSelection(toggleTrainingTarget(selection, staffId, status === "대상"));
    setDetail(staffId, { targetStatus: status, required: status === "대상",
      excludedReason: status === "제외" ? details[staffId]?.excludedReason || currentById.get(staffId)?.["제외사유"] || "" : "" });
  }
  function renderDetail(person, selected) {
    const previous = currentById.get(person.staffId);
    const detail = details[person.staffId];
    const status = detail?.targetStatus || (selected ? "대상" :
      previous?.["대상상태"] === "제외" || previous?.["제외여부"] === "Y" ? "제외" : "비대상");
    const required = detail?.required ?? (previous && selected && ["대상", "교육 대상"].includes(previous["대상상태"])
      ? previous["필수여부"] === "Y" : true);
    return <div className="mt-2 grid gap-2 rounded-[9px] bg-[var(--shh-surface-muted)] p-3 sm:grid-cols-3">
      <label className="grid gap-1 text-xs text-[var(--shh-muted)]">대상 상태<select className={control} value={status}
        onChange={(event) => setStatus(person.staffId, event.target.value)}><option value="대상">대상</option><option value="비대상">비대상</option><option value="제외">제외</option></select></label>
      <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--shh-primary)]"><input type="checkbox" checked={status === "대상" && required}
        disabled={status !== "대상"} onChange={(event) => setDetail(person.staffId, { targetStatus: "대상", required: event.target.checked, excludedReason: "" })} />필수</label>
      {status === "제외" && <label className="grid gap-1 text-xs text-[var(--shh-muted)]">제외 사유<input className={control}
        value={detail?.excludedReason ?? previous?.["제외사유"] ?? ""} maxLength={200}
        onChange={(event) => setDetail(person.staffId, { targetStatus: "제외", required: false, excludedReason: event.target.value })} /></label>}
    </div>;
  }
  async function save() {
    if (!dirty || selectionError || archived.length) return;
    setSaving(true); setMessage("");
    try {
      await saveTargets({ eventId, revision, targetSelection: selection,
        reviewedTargets: members.map(({ staffId, name, position, department }) => ({ staffId, name, position, department })),
        targetDetails: Object.entries(details).map(([staffId, detail]) => ({ staffId,
          targetStatus: detail.targetStatus || (nextIds.has(staffId) ? "대상" : "비대상"),
          required: detail.required ?? nextIds.has(staffId), excludedReason: detail.excludedReason || "" })) });
      await reload();
      setMessage("교육 대상자 변경을 저장했습니다.");
    } catch (error) {
      setMessage(error.message);
      if (error.message.includes("명단이 변경되었습니다")) {
        try { const result = await loadDirectory(); setDirectory(result.items); } catch { setState("error"); }
      }
    } finally { setSaving(false); }
  }
  return <TrainingAdminLayout displayName={displayName} eventId={eventId} active="targets" title="교육 대상 관리" description="그룹을 선택하고 예외만 조정한 뒤 한 번에 저장합니다.">
    {state === "loading" && <p className="text-sm text-[var(--shh-muted)]">대상 정보를 불러오는 중입니다.</p>}
    {state === "error" && <p role="alert" className="text-sm text-[var(--shh-danger)]">{message}</p>}
    {state === "ready" && selection && <section className="training-target-manager">
      <div className="training-target-workflow">
        <div className="training-target-section-title">
          <h2>대상자 설정</h2>
          <p>현재 저장된 대상자 snapshot을 기준으로 시작합니다. 조건을 바꿔도 저장 전에는 기록이 변경되지 않습니다.</p>
        </div>
        <TrainingTargetPicker directory={directory} selection={selection} onChange={changeSelection}
          listExpanded={listExpanded} onListExpandedChange={setListExpanded}
          summary={<section className="training-target-summary-grid" aria-label="대상자 변경 요약">
            <div className="training-target-summary-card"><span>기존 대상</span><strong>{currentIds.size}<small>명</small></strong></div>
            <div className="training-target-summary-card is-primary"><span>{dirty ? "변경 후" : "현재 대상"}</span><strong>{dirty ? members.length : currentIds.size}<small>명</small></strong></div>
            <div className="training-target-summary-card"><span>추가 예정</span><strong>{dirty ? added : 0}<small>명</small></strong></div>
            <div className="training-target-summary-card"><span>제외 예정</span><strong>{dirty ? removed : 0}<small>명</small></strong></div>
          </section>}
          actions={<div className="training-target-savebar training-admin-panel">
            <div><h2>변경 확인</h2>
              <p>{dirty ? `기존 대상 ${currentIds.size}명에서 ${members.length}명으로 변경됩니다.` : "아직 저장할 변경 사항이 없습니다."}</p>
              {dirty && <p className="training-target-savebar-detail">추가 {added}명 · 제외 {removed}명 · 개별 예외 {changedDetails}건</p>}</div>
            <div className="training-target-actions"><button type="button" className={`${secondary} training-target-list-mobile`}
              aria-expanded={listExpanded} onClick={() => setListExpanded(!listExpanded)}>
              {listExpanded ? "대상자 명단 접기" : "대상자 명단 보기"}</button>
              <button type="button" className={secondary} disabled={!dirty || saving}
              onClick={() => { setSelection(initialSelection(directory, targets)); setDetails({}); setDirty(false); setMessage(""); }}>변경 취소</button>
              <button type="button" className={primary} disabled={!dirty || saving || Boolean(selectionError) || archived.length > 0}
                onClick={save}>{saving ? "저장 중" : "변경 저장"}</button></div>
          </div>}
          onToggleMember={(staffId) => { setDetails((current) => {
            const next = { ...current }; delete next[staffId]; return next;
          }); }}
          mode="manager"
          rowDetails={{ openId: openDetailId,
            getMeta: (person, selected) => statusMeta({ person, selected, detail: details[person.staffId], previous: currentById.get(person.staffId) }),
            toggle: (staffId) => setOpenDetailId((current) => current === staffId ? "" : staffId),
            render: renderDetail }} />
      </div>
      {archived.length > 0 && <p role="alert" className="text-sm text-[var(--shh-danger)]">현재 명단에 없는 기존 대상 {archived.length}명이 있어 일괄 저장할 수 없습니다. 기존 대상 기록은 변경되지 않았습니다.</p>}
      {dirty && selectionError && <p role="alert" className="text-sm text-[var(--shh-danger)]">{selectionError}</p>}
      {message && <p role={message.includes("저장했습니다") ? "status" : "alert"} className="text-sm text-[var(--shh-primary)]">{message}</p>}
    </section>}
  </TrainingAdminLayout>;
}

export default function FirebaseTrainingTargetsPage() {
  const { eventId } = useParams();
  return <FirebaseAdminRoleAccessGate allowTrainingAdmin deniedTitle="교육 대상 관리 권한이 없습니다.">{({ displayName }) => <TrainingTargetsContent displayName={displayName} eventId={eventId} />}</FirebaseAdminRoleAccessGate>;
}
