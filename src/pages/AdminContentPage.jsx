import { useCallback, useEffect, useState } from "react";
import { requestPortalCms } from "../lib/portalCms.js";

const TYPES = [
  { value: "notice", label: "공지" },
  { value: "faq", label: "FAQ" },
  { value: "health_event", label: "건강정보 · 이벤트" },
  { value: "education", label: "교육자료" },
];
const FIELDS = {
  notice: [["titleLine1", "제목 첫 줄"], ["titleLine2", "제목 둘째 줄"], ["date", "안내 일시"], ["target", "대상"], ["actionText", "이동 안내"], ["status", "상태"], ["badgeType", "배지색"]],
  faq: [],
  health_event: [["buttonText", "버튼명"]],
  education: [["target", "대상"], ["duration", "소요시간"], ["schedule", "일정"], ["confirmation", "확인방법"], ["buttonText", "버튼명"], ["status", "상태"]],
};
const EMPTY = { type: "notice", title: "", content: "", category: "", link: "", attachment: "", visible: true, sortOrder: 999, startAt: "", endAt: "", fields: {} };
const fieldClass = "min-h-11 w-full rounded-xl border border-[#C9DFFF] bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#1A3B8B] focus:outline-none focus:ring-2 focus:ring-[#C9DFFF]";

function Input({ label, value, onChange, type = "text", textarea = false }) {
  return <label className="grid gap-1 text-sm font-semibold text-slate-700">
    <span>{label}</span>
    {textarea ? <textarea className={`${fieldClass} min-h-28`} value={value || ""} onChange={(event) => onChange(event.target.value)} />
      : <input className={fieldClass} type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />}
  </label>;
}

export default function AdminContentPage() {
  const [type, setType] = useState("notice");
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const result = await requestPortalCms();
    setItems(result.items || []);
  }, []);
  useEffect(() => {
    refresh().catch((cause) => setError(cause.message));
  }, [refresh]);

  const selectType = (next) => {
    setType(next);
    setEditing(null);
    setForm({ ...EMPTY, type: next, fields: {} });
    setError("");
    setMessage("");
  };
  const edit = (item) => {
    setEditing(item.id);
    setForm({ ...EMPTY, ...item, fields: { ...item.fields } });
    setError("");
    setMessage("");
  };
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const change = async (action, item = form, id = editing) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await requestPortalCms({ action, id, item });
      await refresh();
      setMessage("변경 내용을 저장했습니다.");
      if (action === "add" || action === "update") {
        setEditing(null);
        setForm({ ...EMPTY, type, fields: {} });
      }
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  const current = items.filter((item) => item.type === type);
  return <div className="space-y-5">
    <header className="rounded-[24px] border border-[#C9DFFF] bg-white p-5 shadow-sm">
      <p className="text-xs font-bold text-[#D94F70]">CONTENT CMS</p>
      <h1 className="mt-1 text-2xl font-semibold text-[#1A3B8B]">포털 콘텐츠 관리</h1>
      <p className="mt-2 break-keep text-sm text-slate-600">공지·FAQ·건강정보·교육자료를 Firestore에서 관리합니다. 삭제는 기록 보존을 위해 비활성화로 처리합니다.</p>
    </header>
    <div role="tablist" aria-label="콘텐츠 유형" className="flex flex-wrap gap-2">
      {TYPES.map((entry) => <button key={entry.value} type="button" role="tab" aria-selected={type === entry.value}
        onClick={() => selectType(entry.value)} className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold ${type === entry.value ? "bg-[#1A3B8B] text-white" : "border border-[#C9DFFF] bg-white text-[#1A3B8B]"}`}>
        {entry.label}
      </button>)}
    </div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-[#F2FBF7] p-3 text-sm font-semibold text-[#2E7D32]">{message}</p>}
    <section className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm md:p-5">
      <h2 className="text-lg font-semibold text-[#1A3B8B]">{editing ? "콘텐츠 수정" : "새 콘텐츠 등록"}</h2>
      <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); change(editing ? "update" : "add"); }}>
        <Input label={type === "faq" ? "질문" : "제목"} value={form.title} onChange={(value) => update("title", value)} />
        <Input label="정렬순서" type="number" value={form.sortOrder} onChange={(value) => update("sortOrder", value)} />
        <div className="md:col-span-2"><Input label={type === "faq" ? "답변" : "내용·설명"} textarea value={form.content} onChange={(value) => update("content", value)} /></div>
        <Input label="카테고리" value={form.category} onChange={(value) => update("category", value)} />
        <Input label="링크 (HTTPS 또는 내부 경로)" value={form.link} onChange={(value) => update("link", value)} />
        <Input label="첨부 링크" value={form.attachment} onChange={(value) => update("attachment", value)} />
        <Input label="노출 시작일" type="date" value={form.startAt} onChange={(value) => update("startAt", value)} />
        <Input label="노출 종료일" type="date" value={form.endAt} onChange={(value) => update("endAt", value)} />
        {FIELDS[type].map(([key, label]) => <Input key={key} label={label} value={form.fields?.[key]}
          onChange={(value) => setForm((currentForm) => ({ ...currentForm, fields: { ...currentForm.fields, [key]: value } }))} />)}
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.visible} onChange={(event) => update("visible", event.target.checked)} /> 공개 노출</label>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-[#1A3B8B] px-5 text-sm font-semibold text-white disabled:opacity-50">{editing ? "수정 저장" : "콘텐츠 등록"}</button>
          {editing && <button type="button" onClick={() => { setEditing(null); setForm({ ...EMPTY, type, fields: {} }); }} className="min-h-11 rounded-xl border border-[#C9DFFF] px-5 text-sm font-semibold text-[#1A3B8B]">취소</button>}
        </div>
      </form>
    </section>
    <section className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm md:p-5">
      <h2 className="text-lg font-semibold text-[#1A3B8B]">{TYPES.find((entry) => entry.value === type)?.label} {current.length}건</h2>
      <div className="mt-4 space-y-3">
        {current.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><h3 className="font-semibold text-slate-800">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{item.active ? item.visible ? "노출" : "숨김" : "비활성"} · 정렬 {item.sortOrder} · {item.category || "카테고리 없음"}</p></div>
            <div className="flex flex-wrap gap-2 text-sm font-semibold">
              <button type="button" disabled={busy} onClick={() => edit(item)} className="rounded-lg border border-[#C9DFFF] px-3 py-2 text-[#1A3B8B]">수정</button>
              {item.active && <button type="button" disabled={busy} onClick={() => change(item.visible ? "hide" : "show", item, item.id)} className="rounded-lg border border-[#C9DFFF] px-3 py-2 text-[#1A3B8B]">{item.visible ? "숨김" : "노출"}</button>}
              <button type="button" disabled={busy} onClick={() => change(item.active ? "deactivate" : "restore", item, item.id)} className="rounded-lg border border-[#C9DFFF] px-3 py-2 text-[#1A3B8B]">{item.active ? "비활성화" : "복원"}</button>
            </div>
          </div>
        </article>)}
        {!current.length && <p className="text-sm text-slate-500">등록된 콘텐츠가 없습니다.</p>}
      </div>
    </section>
  </div>;
}
