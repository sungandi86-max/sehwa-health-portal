import React, { useEffect, useId, useState } from "react";
import { CURRENT_SCHOOL_YEAR } from "../config/school.js";
import { tbEvidenceLabel } from "../lib/tbScreeningWorkflowClient.js";
import { joinTbScreeningWorkflow } from "../lib/tbScreeningWorkflowModel.js";
import { SCREENING_TYPE_OPTIONS, canEditHealthScreeningYear, hasSelfScreeningConfirmation, personalTbEvidenceRequired, screeningConfirmationLabel, screeningSourceLabel, loadHealthScreeningTypes, saveHealthScreeningType, screeningTypeLabel } from "../lib/healthScreeningTypes.js";

export default function HealthScreeningTypePanel({ schoolYear = CURRENT_SCHOOL_YEAR, completionLabel, initialItem, workflow, onChange }) {
  const id = useId();
  const canEdit = canEditHealthScreeningYear(schoolYear);
  const [item, setItem] = useState(null);
  const [choice, setChoice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (workflow && refresh === 0) {
      setItem({ ...(initialItem || workflow.route || {}), workflow });
      setChoice(initialItem?.screeningType || workflow.route?.screeningType || "");
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true); setError(""); setItem(null); setNotice(""); setConflict(false);
    loadHealthScreeningTypes({ schoolYear, signal: controller.signal }).then((data) => {
      setItem(data.item); setChoice(data.item?.screeningType || "");
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [schoolYear, refresh, initialItem, workflow]);
  async function confirm(event) {
    event.preventDefault();
    if (!canEdit) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const data = await saveHealthScreeningType({ schoolYear, screeningType: choice, expectedRevision: item?.revision || 0 });
      const updated = { ...data.item, ...(item?.workflow ? { workflow: joinTbScreeningWorkflow({ ...item.workflow, route: data.item }) } : {}) };
      setItem(updated); setNotice("올해 결핵검진 경로의 본인확인을 저장했습니다."); onChange?.(updated);
    } catch (cause) { setError(cause.message); setConflict(cause.status === 409); }
    finally { setSaving(false); }
  }
  return <section className="bogunon-panel p-4 text-sm text-[#102047]" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`} className="text-base font-semibold">올해 결핵검진 경로를 확인해주세요</h3>
    <p className="mt-1 text-xs text-[#627083]">{schoolYear}년 · 검진 경로 확인이며 검진 완료 여부와는 별도입니다.</p>
    {loading ? <p className="mt-3" role="status">결핵검진 경로를 불러오는 중입니다.</p> : <>
      {item && <p className="mt-3">검진 경로: <strong>{screeningTypeLabel(item.screeningType)}</strong><span className="ml-3">본인확인: {screeningConfirmationLabel(item)}</span>{["admin", "legacy_firestore_backfill"].includes(item.source) && <span className="ml-3 text-xs text-[#627083]">{screeningSourceLabel(item)}</span>}</p>}
      <p className="mt-1">확인자료: {personalTbEvidenceRequired(item?.screeningType) ? tbEvidenceLabel(item?.workflow) : "개인 확인자료 제출 불필요"}</p>
      {choice === "group" && <p className="mt-2 text-xs text-[#3154A3]">학교에서 실시하는 단체 결핵검진에 참여합니다. 별도 개인 확인자료 제출은 필요하지 않습니다.</p>}
      <p className="mt-1">검진 완료: {item?.workflow ? item.workflow.completed ? "완료" : "미완료" : completionLabel || "확인 필요"}</p>
      {item?.workflow?.routeMismatch && <p className="mt-1 text-xs text-[#3154A3]">검진 경로와 접수자료 유형이 다릅니다. 보건실 확인이 필요합니다.</p>}
      {item?.workflow?.status?.discrepancy && <p className="mt-1 text-xs text-[#B42318]">확인자료에 보완이 필요합니다. 기존 완료 확인 이력은 유지됩니다.</p>}
      {error && <p role="alert" className="mt-3 text-[#B42318]">{error}</p>}
      {notice && <p role="status" className="mt-3 text-[#08754B]">{notice}</p>}
      {!canEdit && <p className="mt-3 text-xs text-[#627083]">올해 기록만 확인·수정할 수 있습니다. 선택한 연도는 조회 전용입니다.</p>}
      {item && canEdit && <form onSubmit={confirm} className="mt-3">
        <fieldset disabled={saving || conflict}><legend className="text-sm font-medium">결핵검진 경로</legend>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{SCREENING_TYPE_OPTIONS.map((option) => <label key={option.value} className="flex min-h-11 items-center gap-2 cursor-pointer"><input type="radio" name={`${id}-type`} value={option.value} checked={choice === option.value} onChange={() => setChoice(option.value)} required className="accent-[#0D4EA6]" />{option.label}</label>)}</div>
        </fieldset>
        <button disabled={!choice || saving || conflict} className="mt-2 min-h-11 rounded-lg bg-[#0D4EA6] px-4 text-white hover:bg-[#183B8F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">{saving ? "저장 중…" : hasSelfScreeningConfirmation(item) ? "수정 후 다시 확인" : "확인 완료"}</button>
      </form>}
      {error && <button type="button" disabled={saving} onClick={() => setRefresh((value) => value + 1)} className="mt-3 min-h-11 rounded-lg border border-[#DDEAE7] px-3">최신 내용 다시 확인</button>}
    </>}
  </section>;
}
