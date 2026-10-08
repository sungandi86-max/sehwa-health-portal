import { useEffect, useState } from "react";
import {
  listResearchTrainingExceptions,
  releaseResearchTrainingException,
  saveResearchTrainingException,
} from "../lib/researchTrainingDryRun.js";

const EMPTY_FORM = {
  identityType: "source_only_exact", year: 2026, staffId: "", sourceName: "", sourcePosition: "",
  reason: "퇴직", confirmationStatus: "확인완료", note: "",
};

export default function ResearchTrainingExceptionsPanel() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function reload() {
    const result = await listResearchTrainingExceptions();
    setItems(result.items || []);
  }

  useEffect(() => {
    reload().catch(() => setMessage("예외 목록을 불러오지 못했습니다.")).finally(() => setLoading(false));
  }, []);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await saveResearchTrainingException(form);
      await reload();
      setForm(EMPTY_FORM);
      setMessage("예외를 등록했습니다.");
    } catch (error) {
      setMessage(error.message || "예외를 등록하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function release(id) {
    if (!window.confirm("이 예외를 해제할까요? 기록은 삭제되지 않습니다.")) return;
    setBusy(true);
    setMessage("");
    try {
      await releaseResearchTrainingException(id);
      await reload();
      setMessage("예외를 해제했습니다.");
    } catch (error) {
      setMessage(error.message || "예외를 해제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[12px] border border-[#DDEAE7] bg-white p-3 shadow-[var(--shh-soft-shadow)]">
      <h2 className="text-[15px] font-semibold text-[#102047]">법정의무연수 원본 전용 예외</h2>
      <p className="mt-1 text-[12px] leading-5 text-[#627083]">현행 교직원은 명단의 staffId로, 과거 원본 전용자는 연구부 원본의 정확한 성명·직책으로 구분합니다. 이름으로 staffId를 추정하지 않습니다.</p>
      <div className="mt-3 space-y-2">
        {loading && <p className="text-[13px] text-[#627083]">목록을 불러오는 중...</p>}
        {!loading && items.length === 0 && <p className="text-[13px] text-[#627083]">등록된 예외가 없습니다.</p>}
        {items.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#DDEAE7] px-3 py-2 text-[13px]">
            <div>
              <p className="font-semibold text-[#102047]">{item.identityType === "canonical_staff" ? `교직원ID ${item.staffId}` : `${item.sourceName} · ${item.sourcePosition}`} · {item.year}년</p>
              <p className="text-[12px] text-[#627083]">보건 관련 법정의무연수 · {item.reason} · {item.confirmationStatus} · {item.active ? "적용 중" : "해제됨"}{item.note ? ` · ${item.note}` : ""}</p>
            </div>
            {item.active && <button type="button" disabled={busy} onClick={() => release(item.id)} className="min-h-10 rounded-[8px] border border-[#DDEAE7] px-3 font-semibold text-[#102047] disabled:opacity-60">예외 해제</button>}
          </div>
        ))}
      </div>
      <form onSubmit={save} className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1 text-[12px] font-semibold text-[#627083]">예외 대상<select value={form.identityType} onChange={(event) => setForm({ ...EMPTY_FORM, identityType: event.target.value })} className="min-h-10 rounded-[8px] border border-[#DDEAE7] px-2 text-[#102047]"><option value="source_only_exact">과거 원본 전용자</option><option value="canonical_staff">현행 교직원</option></select></label>
        <label className="grid gap-1 text-[12px] font-semibold text-[#627083]">적용 연도<input type="number" required value={form.year} onChange={(event) => setForm({ ...form, year: Number(event.target.value) })} className="min-h-10 rounded-[8px] border border-[#DDEAE7] px-2 text-[#102047]" /></label>
        {form.identityType === "canonical_staff" ? (
          <label className="grid gap-1 text-[12px] font-semibold text-[#627083]">현행 교직원ID<input required maxLength={80} value={form.staffId} onChange={(event) => setForm({ ...form, staffId: event.target.value })} className="min-h-10 rounded-[8px] border border-[#DDEAE7] px-2 text-[#102047]" /></label>
        ) : (
          <>
            <label className="grid gap-1 text-[12px] font-semibold text-[#627083]">연구부 원본 성명<input required maxLength={80} value={form.sourceName} onChange={(event) => setForm({ ...form, sourceName: event.target.value })} className="min-h-10 rounded-[8px] border border-[#DDEAE7] px-2 text-[#102047]" /></label>
            <label className="grid gap-1 text-[12px] font-semibold text-[#627083]">연구부 원본 직책<input required maxLength={80} value={form.sourcePosition} onChange={(event) => setForm({ ...form, sourcePosition: event.target.value })} className="min-h-10 rounded-[8px] border border-[#DDEAE7] px-2 text-[#102047]" /></label>
          </>
        )}
        <label className="grid gap-1 text-[12px] font-semibold text-[#627083]">예외 사유<select value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className="min-h-10 rounded-[8px] border border-[#DDEAE7] px-2 text-[#102047]"><option>퇴직</option><option>전출</option><option>기타</option></select></label>
        <label className="grid gap-1 text-[12px] font-semibold text-[#627083]">확인 상태<select value={form.confirmationStatus} onChange={(event) => setForm({ ...form, confirmationStatus: event.target.value })} className="min-h-10 rounded-[8px] border border-[#DDEAE7] px-2 text-[#102047]"><option>확인완료</option><option>확인필요</option></select></label>
        <label className="grid gap-1 text-[12px] font-semibold text-[#627083]">비고<input maxLength={200} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className="min-h-10 rounded-[8px] border border-[#DDEAE7] px-2 text-[#102047]" /></label>
        <button type="submit" disabled={busy} className="min-h-10 rounded-[8px] bg-[#0D4EA6] px-3 text-[13px] font-semibold text-white disabled:opacity-60 sm:col-span-2 lg:col-span-3">{busy ? "저장 중..." : "예외 추가"}</button>
      </form>
      {message && <p role="status" className="mt-2 text-[12px] font-semibold text-[#627083]">{message}</p>}
    </section>
  );
}
