import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { CURRENT_SCHOOL_YEAR } from "../config/school.js";
import { SCREENING_TYPE_OPTIONS, canEditHealthScreeningYear, hasSelfScreeningConfirmation, personalTbEvidenceRequired, screeningConfirmationLabel, screeningSourceLabel, loadHealthScreeningTypes, saveHealthScreeningType, screeningTypeLabel } from "../lib/healthScreeningTypes.js";
import { reviewTbScreeningEvidence, tbEvidenceLabel } from "../lib/tbScreeningWorkflowClient.js";

function auditLabel(value) {
  if (!value) return "—";
  if (typeof value === "string") return "기록 있음";
  return value.name || value.displayName || value.role || "기록 있음";
}

function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ko-KR");
}

function RecordDetails({ item }) {
  const original = typeof item.selfChoice === "string" ? item.selfChoice : item.selfChoice?.screeningType;
  return <div className="text-xs text-[#627083] leading-5">
    <p>확인자료: {personalTbEvidenceRequired(item.screeningType) ? tbEvidenceLabel(item.workflow) : "개인 확인자료 제출 불필요"}</p>
    <p>결핵검진 상태: {item.workflow?.completed ? "완료" : "확인 필요"}</p>
    {item.workflow?.routeMismatch && <p className="text-[#3154A3]">검진 경로와 자료 유형이 다릅니다.</p>}
    {item.workflow?.status?.discrepancy && <p className="text-[#B42318]">확인자료 보완 필요 · 기존 완료 이력 유지</p>}
    <p>최근 변경: {screeningSourceLabel(item)}{item.source !== "legacy_firestore_backfill" && <> · {auditLabel(item.confirmedBy)} · {dateLabel(item.confirmedAt)}</>}</p>
    <p>최근 본인 선택: {screeningTypeLabel(original)}{item.selfChoice?.confirmedAt && ` · ${dateLabel(item.selfChoice.confirmedAt)}`}</p>
  </div>;
}

export default function HealthScreeningTypeAdminPanel({ initialSchoolYear = CURRENT_SCHOOL_YEAR, onChange }) {
  const id = useId();
  const dialog = useRef(null);
  const opener = useRef(null);
  const [year, setYear] = useState(initialSchoolYear);
  const canEdit = canEditHealthScreeningYear(year);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [choice, setChoice] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState("");
  const [reviewing, setReviewing] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setItems([]); setNotice("");
    loadHealthScreeningTypes({ schoolYear: year, scope: "admin", signal: controller.signal }).then((data) => setItems(data.items || []))
      .catch((cause) => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [year, refresh]);
  useEffect(() => {
    if (editing && !dialog.current.open) dialog.current.showModal();
  }, [editing]);
  const visible = useMemo(() => items.filter((item) => {
    const matches = filter === "all" || (filter === "unconfirmed" ? !hasSelfScreeningConfirmation(item) : item.screeningType === filter);
    const query = search.trim().toLocaleLowerCase();
    return matches && `${item.name || ""} ${item.department || ""} ${item.position || ""}`.toLocaleLowerCase().includes(query);
  }), [items, filter, search]);
  function open(item, event) {
    if (!canEdit) return;
    opener.current = event.currentTarget; setEditing(item); setChoice(item.screeningType || ""); setSaveError(""); setConflict(false);
  }
  function close() {
    if (saving) return;
    dialog.current.close(); setEditing(null); opener.current?.focus();
  }
  async function save(event) {
    event.preventDefault();
    if (!canEdit) return;
    setSaving(true); setSaveError("");
    try {
      const data = await saveHealthScreeningType({ schoolYear: year, scope: "admin", staffId: editing.staffId, screeningType: choice, expectedRevision: editing.revision || 0 });
      const updated = { ...editing, ...data.item };
      setItems((current) => current.map((item) => item.staffId === editing.staffId ? updated : item));
      setNotice(`${editing.name || "교직원"}의 검진 유형을 저장했습니다.`); onChange?.(updated);
      dialog.current.close(); setEditing(null); opener.current?.focus();
    } catch (cause) { setSaveError(cause.message); setConflict(cause.status === 409); }
    finally { setSaving(false); }
  }
  async function review(item, evidence, action) {
    if (action === "invalidate" && !window.confirm(`${item.name || "선택한 교직원"}의 확인자료를 무효 처리하시겠습니까?`)) return;
    setReviewing(evidence.submissionId); setError("");
    try {
      await reviewTbScreeningEvidence({ staffId: item.staffId, schoolYear: year,
        submissionId: evidence.submissionId, expectedRevision: item.workflow?.status?.revision || 0, action });
      setRefresh((value) => value + 1); onChange?.(item);
    } catch (cause) { setError(cause.message); }
    finally { setReviewing(""); }
  }
  const years = [...new Set([CURRENT_SCHOOL_YEAR, CURRENT_SCHOOL_YEAR + 1, initialSchoolYear])].sort();
  const editButton = (item) => canEdit ? <div className="flex flex-wrap gap-2">
    <button type="button" onClick={(event) => open(item, event)} aria-label={`${item.name || "교직원"} 검진 경로 수정`} className="min-h-11 rounded-lg border border-[#DDEAE7] px-3 text-[#0D4EA6] hover:bg-[#EEF4FF] focus-visible:outline focus-visible:outline-2">수정</button>
    {item.workflow?.evidence?.filter((evidence) => evidence.reviewState === "pending").map((evidence) => <div key={evidence.submissionId} className="w-full rounded-lg border border-[#DDEAE7] p-2 text-xs sm:w-auto">
      <p className="max-w-64 break-words text-[#627083]">{evidence.evidenceFiles?.[0]?.fileName || evidence.documentType || "확인자료"} · {evidence.checkupDate || "검진일 미상"}</p>
      <div className="mt-2 flex flex-wrap gap-2">{evidence.evidenceFiles?.[0]?.fileId && <a href={`https://drive.google.com/open?id=${encodeURIComponent(evidence.evidenceFiles[0].fileId)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-lg border border-[#DDEAE7] px-3 text-[#0D4EA6]">자료 보기</a>}
        <button type="button" disabled={Boolean(reviewing)} onClick={() => review(item, evidence, "confirm")} className="min-h-10 rounded-lg bg-[#0D4EA6] px-3 text-white disabled:opacity-50">확인 완료</button>
        <button type="button" disabled={Boolean(reviewing)} onClick={() => review(item, evidence, "invalidate")} className="min-h-10 rounded-lg border border-[#F6D8D8] px-3 text-[#B42318] disabled:opacity-50">자료 무효</button></div>
    </div>)}
  </div> : <span className="text-xs text-[#627083]">조회 전용</span>;
  return <section className="bogunon-panel p-4 text-sm text-[#102047]" aria-labelledby={`${id}-heading`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 id={`${id}-heading`} className="text-base font-semibold">연도별 건강검진 유형 관리</h3><span className="text-xs text-[#627083]">본인확인 {items.filter(hasSelfScreeningConfirmation).length} / {items.length}명</span></div>
    <div className="mt-3 flex flex-wrap gap-2">
      <label className="flex items-center gap-2">연도<select value={year} onChange={(event) => setYear(Number(event.target.value))} className="min-h-11 rounded-lg border border-[#DDEAE7] px-2">{years.map((value) => <option key={value} value={value}>{value}년</option>)}</select></label>
      <label className="flex items-center gap-2">유형<select value={filter} onChange={(event) => setFilter(event.target.value)} className="min-h-11 rounded-lg border border-[#DDEAE7] px-2"><option value="all">전체</option><option value="unconfirmed">본인 미확인</option>{SCREENING_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-0"><span className="shrink-0 whitespace-nowrap">검색</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="이름·부서·직위" className="min-h-11 w-full min-w-0 rounded-lg border border-[#DDEAE7] px-3" /></label>
      <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)} className="min-h-11 rounded-lg border border-[#DDEAE7] px-3 disabled:opacity-50">새로고침</button>
    </div>
    {notice && <p role="status" className="mt-3 text-[#08754B]">{notice}</p>}
    {loading ? <p role="status" className="mt-3">건강검진 유형을 불러오는 중입니다.</p> : error ? <p role="alert" className="mt-3 text-[#B42318]">{error}</p> : !visible.length ? <p className="mt-3 text-[#627083]">{items.length ? "조건에 맞는 교직원이 없습니다." : "조회할 교직원이 없습니다."}</p> : <>
      <div className="mt-3 hidden md:block"><table className="w-full text-left"><caption className="sr-only">{year}년 교직원 건강검진 유형</caption><thead className="bg-[#F3F8F6] text-xs"><tr>{["이름 / 부서", "검진 유형", "본인확인", "변경 기록", "관리"].map((label) => <th key={label} scope="col" className="p-2 font-semibold">{label}</th>)}</tr></thead><tbody>{visible.map((item) => <tr key={item.staffId} className="border-b border-[#DDEAE7]"><td className="p-2"><span className="font-medium">{item.name || "이름 없음"}</span><p className="text-xs text-[#627083]">{[item.department, item.position].filter(Boolean).join(" · ") || "—"}</p></td><td className="p-2">{screeningTypeLabel(item.screeningType)}</td><td className="p-2">{screeningConfirmationLabel(item)}</td><td className="p-2"><RecordDetails item={item} /></td><td className="p-2">{editButton(item)}</td></tr>)}</tbody></table></div>
      <ul className="mt-3 divide-y divide-[#DDEAE7] md:hidden">{visible.map((item) => <li key={item.staffId} className="py-3"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{item.name || "이름 없음"}</p><p className="text-xs text-[#627083]">{[item.department, item.position].filter(Boolean).join(" · ")}</p></div>{editButton(item)}</div><p className="my-2">유형: {screeningTypeLabel(item.screeningType)} · 본인확인: {screeningConfirmationLabel(item)}</p><RecordDetails item={item} /></li>)}</ul>
    </>}
    <dialog ref={dialog} aria-labelledby={`${id}-dialog-title`} onCancel={(event) => { event.preventDefault(); close(); }} className="w-[calc(100%_-_32px)] max-w-md rounded-2xl border border-[#DDEAE7] p-4 text-[#102047] backdrop:bg-black/30">
      {editing && <form onSubmit={save}><h4 id={`${id}-dialog-title`} className="text-base font-semibold">{editing.name || "교직원"} 검진 유형 수정</h4><p className="mt-1 text-xs text-[#627083]">{year}년 · 관리자 수정은 검진 완료 여부를 변경하지 않습니다.</p><div className="mt-3"><RecordDetails item={editing} /></div>
        <label className="mt-3 block">검진 유형<select autoFocus required disabled={saving || conflict} value={choice} onChange={(event) => setChoice(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-[#DDEAE7] px-3"><option value="" disabled>유형을 선택해주세요</option>{SCREENING_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        {choice === "group" && <p className="mt-2 text-xs text-[#3154A3]">학교 단체검진 경로는 개인 확인자료 제출을 요구하지 않으며, 검진 완료 여부는 별도로 관리됩니다.</p>}
        {saveError && <p role="alert" className="mt-3 text-sm text-[#B42318]">{saveError}</p>}
        <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={saving} onClick={close} className="min-h-11 rounded-lg border border-[#DDEAE7] px-3">닫기</button>{conflict ? <button type="button" onClick={() => { close(); setRefresh((value) => value + 1); }} className="min-h-11 rounded-lg bg-[#0D4EA6] px-3 text-white">최신 내용 다시 확인</button> : <button disabled={!choice || saving} className="min-h-11 rounded-lg bg-[#0D4EA6] px-3 text-white hover:bg-[#183B8F] disabled:opacity-50">{saving ? "저장 중…" : "저장"}</button>}</div>
      </form>}
    </dialog>
  </section>;
}
