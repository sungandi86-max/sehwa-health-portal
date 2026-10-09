import { useCallback, useEffect, useState } from "react";
import { requestSubmissionConfig } from "../lib/submissionConfigAdmin.js";

const TYPES = ["cpr", "tb", "recruit", "infection", "student_tb_reply", "tb_registration"];
const EMPTY = { canonicalType: "cpr", title: "", titleLine1: "", titleLine2: "", description: "", target: "",
  submissionMaterial: "", deadlineText: "", guideText: "", buttonLabel: "", publicUrl: "", statusText: "",
  emphasis: false, sortOrder: 999, visible: false, active: true, startAt: "", endAt: "" };
const TEXT_FIELDS = [["title", "제목"], ["titleLine1", "제목 첫 줄"], ["titleLine2", "제목 둘째 줄"],
  ["description", "설명"], ["target", "대상"], ["submissionMaterial", "제출 자료"],
  ["deadlineText", "마감 안내"], ["guideText", "제출 안내"], ["buttonLabel", "버튼명"],
  ["publicUrl", "공개 링크"], ["statusText", "상태 문구"]];
const inputClass = "min-h-11 w-full rounded-xl border border-[#C9DFFF] bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#1A3B8B] focus:outline-none focus:ring-2 focus:ring-[#C9DFFF]";

export default function AdminSubmissionConfigPage() {
  const [cards, setCards] = useState([]);
  const [registration, setRegistration] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const data = await requestSubmissionConfig();
    setCards(data.cards || []);
    setRegistration(data.registration || null);
  }, []);
  useEffect(() => { refresh().catch((cause) => setError(cause.message)); }, [refresh]);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const change = async (payload) => {
    setBusy(true); setError(""); setMessage("");
    try {
      await requestSubmissionConfig(payload);
      await refresh();
      setMessage("변경 내용을 저장했습니다.");
      if (["add", "update"].includes(payload.action)) { setForm(EMPTY); setEditing(""); }
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5">
    <header className="rounded-[24px] border border-[#C9DFFF] bg-white p-5 shadow-sm">
      <p className="text-xs font-bold text-[#D94F70]">SUBMISSION CONFIG</p>
      <h1 className="mt-1 text-2xl font-semibold text-[#1A3B8B]">제출센터 설정</h1>
      <p className="mt-2 break-keep text-sm text-slate-600">공개 카드와 신청 기간을 관리합니다.<span className="block">저장 대상과 인증 정책은 서버에서 고정합니다.</span></p>
    </header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-[#F2FBF7] p-3 text-sm text-[#2E7D32]">{message}</p>}
    <section className="rounded-[24px] bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-[#1A3B8B]">{editing ? "카드 수정" : "카드 추가"}</h2>
      <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); change({ action: editing ? "update" : "add", id: editing, card: form }); }}>
        <label className="grid gap-1 text-sm font-semibold">제출 유형<select className={inputClass} value={form.canonicalType} disabled={Boolean(editing)} onChange={(event) => update("canonicalType", event.target.value)}>
          {TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select></label>
        <label className="grid gap-1 text-sm font-semibold">정렬순서<input className={inputClass} type="number" min="1" value={form.sortOrder} onChange={(event) => update("sortOrder", event.target.value)} /></label>
        {TEXT_FIELDS.map(([key, label]) => <label key={key} className={`grid gap-1 text-sm font-semibold ${key === "description" || key === "guideText" ? "md:col-span-2" : ""}`}>{label}
          {key === "description" || key === "guideText" ? <textarea className={`${inputClass} min-h-24`} value={form[key]} onChange={(event) => update(key, event.target.value)} />
            : <input className={inputClass} value={form[key]} onChange={(event) => update(key, event.target.value)} />}
        </label>)}
        <label className="grid gap-1 text-sm font-semibold">노출 시작일<input className={inputClass} type="date" value={form.startAt} onChange={(event) => update("startAt", event.target.value)} /></label>
        <label className="grid gap-1 text-sm font-semibold">노출 종료일<input className={inputClass} type="date" value={form.endAt} onChange={(event) => update("endAt", event.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.visible} onChange={(event) => update("visible", event.target.checked)} /> 공개 노출</label>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.emphasis} onChange={(event) => update("emphasis", event.target.checked)} /> 강조 표시</label>
        <div className="flex gap-2 md:col-span-2"><button disabled={busy} className="min-h-11 rounded-xl bg-[#1A3B8B] px-5 text-sm font-semibold text-white">{editing ? "수정 저장" : "카드 추가"}</button>
          {editing && <button type="button" className="min-h-11 rounded-xl border border-[#C9DFFF] px-5 text-sm text-[#1A3B8B]" onClick={() => { setEditing(""); setForm(EMPTY); }}>취소</button>}</div>
      </form>
    </section>
    <section className="rounded-[24px] bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-[#1A3B8B]">카드 {cards.length}건</h2>
      <div className="mt-4 space-y-3">{cards.map((card) => <article className="rounded-xl border border-slate-200 p-4" key={card.id}>
        <h3 className="font-semibold text-slate-800">{card.title}</h3><p className="text-xs text-slate-500">{card.canonicalType} · {card.active ? card.visible ? "노출" : "숨김" : "비활성"} · 정렬 {card.sortOrder}</p>
        <div className="mt-3 flex flex-wrap gap-2">{[
          ["수정", () => { setEditing(card.id); setForm(card); }],
          [card.visible ? "숨김" : "노출", () => change({ action: card.visible ? "hide" : "show", id: card.id })],
          [card.active ? "비활성화" : "복원", () => change({ action: card.active ? "deactivate" : "restore", id: card.id })],
        ].map(([label, onClick]) => <button key={label} type="button" disabled={busy} onClick={onClick} className="min-h-11 rounded-xl border border-[#C9DFFF] px-3 text-sm font-semibold text-[#1A3B8B]">{label}</button>)}</div>
      </article>)}</div>
    </section>
    {registration && <section className="rounded-[24px] bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-[#1A3B8B]">단체검진 신청 운영 설정</h2>
      <p className="mt-1 break-keep text-sm text-slate-600">기간과 상태만 관리합니다.<span className="block">제출 시트·폴더는 서버에서 고정합니다.</span></p>
      <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); change({ action: "registration", registration }); }}>
        {["startAt", "endAt"].map((key) => <label key={key} className="grid gap-1 text-sm font-semibold">{key === "startAt" ? "시작일" : "종료일"}<input className={inputClass} type="date" value={registration[key] || ""} onChange={(event) => setRegistration((current) => ({ ...current, [key]: event.target.value }))} /></label>)}
        {["status", "operationNote"].map((key) => <label key={key} className="grid gap-1 text-sm font-semibold">{key === "status" ? "상태" : "운영 메모"}<input className={inputClass} value={registration[key] || ""} onChange={(event) => setRegistration((current) => ({ ...current, [key]: event.target.value }))} /></label>)}
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={registration.enabled === true} onChange={(event) => setRegistration((current) => ({ ...current, enabled: event.target.checked }))} /> 신청 사용</label>
        <div><button disabled={busy} className="min-h-11 rounded-xl bg-[#1A3B8B] px-5 text-sm font-semibold text-white">운영 설정 저장</button></div>
      </form>
    </section>}
  </div>;
}
