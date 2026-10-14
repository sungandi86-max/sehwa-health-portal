import { useEffect, useMemo, useRef, useState } from "react";
import { INDIVIDUAL_HEALTH_CHECKUP_DOCUMENT_OPTIONS } from "../data/individualHealthCheckupSubmission.js";
import { getStaffDirectory } from "../lib/staffIdLinking.js";
import { createAdminProxyTbSubmission, validateSelectableSubmissionFile } from "../lib/staffSubmissions.js";

const initialForm = { staffId: "", checkupDate: "", documentType: "", proxyNote: "", file: null };

export default function AdminProxySubmissionDialog({ open, onClose, onSaved }) {
  const dialogRef = useRef(null);
  const [directory, setDirectory] = useState([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(initialForm);
  const [state, setState] = useState({ status: "idle", message: "", duplicate: null });

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.showModal();
    setState({ status: "loading", message: "교직원명단을 불러오는 중입니다.", duplicate: null });
    getStaffDirectory()
      .then(({ directory: items }) => {
        setDirectory(items.filter((item) => item.employmentStatus !== "퇴직"));
        setState({ status: "idle", message: "", duplicate: null });
      })
      .catch(() => setState({ status: "error", message: "교직원명단을 불러오지 못했습니다.", duplicate: null }));
  }, [open]);

  const matches = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return directory.slice(0, 12);
    return directory.filter((item) => [item.name, item.staffId, item.department, item.position]
      .some((value) => String(value || "").toLowerCase().includes(keyword))).slice(0, 20);
  }, [directory, query]);
  const subject = directory.find((item) => item.staffId === form.staffId) || null;

  const close = () => {
    if (state.status === "submitting") return;
    dialogRef.current?.close();
    setForm(initialForm);
    setQuery("");
    onClose();
  };

  const submit = async (event, allowDuplicate = false) => {
    event?.preventDefault();
    if (!subject || !form.checkupDate || !form.documentType || !form.file) {
      setState({ status: "error", message: "대상 교직원, 검진일자, 제출자료 유형, 파일을 모두 확인해 주세요.", duplicate: null });
      return;
    }
    const fileError = validateSelectableSubmissionFile(form.file);
    if (fileError) {
      setState({ status: "error", message: fileError, duplicate: null });
      return;
    }
    setState({ status: "submitting", message: "대리등록 중입니다.", duplicate: null });
    try {
      await createAdminProxyTbSubmission({ subjectStaffId: subject.staffId, subjectName: subject.name,
        checkupDate: form.checkupDate, documentType: form.documentType, proxyNote: form.proxyNote,
        file: form.file, allowDuplicate });
      setState({ status: "success", message: `${subject.name} 교직원의 자료를 대리등록했습니다.`, duplicate: null });
      onSaved();
    } catch (error) {
      if (error?.result?.status === "duplicate" || error?.status === 409) {
        setState({ status: "duplicate", message: "이미 제출 기록이 있습니다.", duplicate: error.result?.duplicate || {} });
      } else {
        setState({ status: "error", message: error instanceof Error ? error.message : "대리등록하지 못했습니다.", duplicate: null });
      }
    }
  };

  if (!open) return null;
  return (
    <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); close(); }}
      className="m-auto max-h-[92vh] w-[min(720px,calc(100%-24px))] overflow-y-auto rounded-[14px] border border-[#DDEAE7] bg-white p-0 text-[#102047] shadow-xl backdrop:bg-[#102047]/30">
      <form onSubmit={submit} className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4 border-b border-[#DDEAE7] pb-4">
          <div><p className="text-xs font-semibold text-[#0D4EA6]">관리자 대리등록</p><h2 className="mt-1 text-xl font-bold">개별 건강검진 확인서</h2>
            <p className="mt-1 text-sm text-[#627083]">종이로 제출받은 자료를 대상 교직원 기록으로 등록합니다.</p></div>
          <button type="button" onClick={close} aria-label="대리등록 닫기" className="min-h-11 min-w-11 rounded-[8px] border border-[#DDEAE7] text-xl">×</button>
        </div>
        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm font-semibold">대상 교직원 검색
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름, 교직원ID, 부서 검색"
              className="min-h-11 rounded-[8px] border border-[#DDEAE7] px-3 outline-none focus:ring-2 focus:ring-[#0D4EA6]/20" />
          </label>
          <div className="max-h-48 overflow-y-auto rounded-[8px] border border-[#DDEAE7]" role="listbox" aria-label="대상 교직원">
            {matches.map((item) => <button key={item.staffId} type="button" onClick={() => setForm({ ...form, staffId: item.staffId })}
              className={`grid w-full grid-cols-[1fr_auto] gap-3 border-b border-[#DDEAE7] px-3 py-3 text-left last:border-0 ${form.staffId === item.staffId ? "bg-[#EEF4FF]" : "bg-white"}`}>
              <span><strong>{item.name}</strong><span className="ml-2 text-xs text-[#627083]">{item.department || "부서 없음"} · {item.position || "직책 없음"}</span></span>
              <span className="text-xs font-semibold text-[#3154A3]">{item.staffId}</span>
            </button>)}
          </div>
          {subject && <p className="rounded-[8px] bg-[#F3F8F6] px-3 py-2 text-sm"><strong>선택:</strong> {subject.name} · {subject.department} · {subject.position} · {subject.staffId}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">검진일자<input type="date" value={form.checkupDate} onChange={(e) => setForm({ ...form, checkupDate: e.target.value })} className="min-h-11 rounded-[8px] border border-[#DDEAE7] px-3" /></label>
            <label className="grid gap-2 text-sm font-semibold">제출자료 유형<select value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })} className="min-h-11 rounded-[8px] border border-[#DDEAE7] px-3"><option value="">선택</option>{INDIVIDUAL_HEALTH_CHECKUP_DOCUMENT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          </div>
          <label className="grid gap-2 text-sm font-semibold">확인서 파일<input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })} className="min-h-11 rounded-[8px] border border-[#DDEAE7] p-2" /></label>
          <label className="grid gap-2 text-sm font-semibold">등록 메모 <span className="font-normal text-[#627083]">선택</span><textarea value={form.proxyNote} maxLength={500} onChange={(e) => setForm({ ...form, proxyNote: e.target.value })} placeholder="종이 제출본 관리자 대리등록" className="min-h-20 resize-y rounded-[8px] border border-[#DDEAE7] p-3" /></label>
        </div>
        {state.message && <p className={`mt-4 rounded-[8px] px-3 py-3 text-sm font-semibold ${state.status === "success" ? "bg-[#F0FBF7] text-[#08754B]" : state.status === "submitting" || state.status === "loading" ? "bg-[#EEF4FF] text-[#3154A3]" : "bg-[#FFF7F7] text-[#B42318]"}`}>{state.message}{state.duplicate?.checkupDate ? ` 검진일자 ${state.duplicate.checkupDate}` : ""}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={close} className="min-h-11 rounded-[8px] border border-[#DDEAE7] px-4 text-sm font-semibold">{state.status === "success" ? "닫기" : "취소"}</button>
          {state.status === "duplicate" ? <button type="button" onClick={(event) => submit(event, true)} className="min-h-11 rounded-[8px] bg-[#0D4EA6] px-4 text-sm font-semibold text-white">추가 등록</button>
            : <button type="submit" disabled={state.status === "submitting" || state.status === "loading"} className="min-h-11 rounded-[8px] bg-[#0D4EA6] px-4 text-sm font-semibold text-white disabled:opacity-50">대리등록</button>}
        </div>
      </form>
    </dialog>
  );
}
