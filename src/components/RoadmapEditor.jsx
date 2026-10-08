import { useEffect, useState } from "react";

const BLANK = {
  category: "", taskName: "", step: "", todo: "", status: "not_started",
  scheduledDate: "", dueDate: "", owner: "", note: "", visible: true,
  sortOrder: 100, openMenus: "", hideMenus: "", audience: "",
  messageTitle: "", messageBody: "", privacyNote: "", relatedSheet: "",
  relatedMenuId: "", relatedSheetUrl: "", tools: [],
};

const FIELDS = [
  ["category", "업무분류", true], ["taskName", "업무명", true], ["step", "단계", true],
  ["todo", "지금 할 일", true], ["scheduledDate", "예정일"], ["dueDate", "마감일"],
  ["owner", "담당"], ["note", "비고"], ["sortOrder", "정렬순서"],
];

const EXTRA = [
  ["openMenus", "열어둘 메뉴"], ["hideMenus", "숨길 메뉴"], ["audience", "안내 대상"],
  ["messageTitle", "메신저 제목"], ["messageBody", "메신저 문구"],
  ["privacyNote", "개인정보 주의"], ["relatedSheet", "관련 시트"],
  ["relatedMenuId", "관련 메뉴 ID"], ["relatedSheetUrl", "관련 시트 URL"],
];

const fieldClass = "min-h-11 w-full min-w-0 rounded-xl border border-[#C9DFFF] bg-white px-3 py-2 text-sm text-[#263238]";

export default function RoadmapEditor({ item, onSave, onDeactivate, onRestore, busy }) {
  const [form, setForm] = useState({ ...BLANK });
  useEffect(() => setForm({ ...BLANK, ...item, tools: item?.tools || [] }), [item]);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const updateTool = (index, field, value) => setForm((current) => {
    const tools = [...current.tools];
    tools[index] = { ...tools[index], [field]: value };
    return { ...current, tools };
  });

  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(([field, label, required]) => (
          <label key={field} className="min-w-0 text-xs font-semibold text-slate-600">
            <span className="mb-1 block">{label}</span>
            <input className={fieldClass} required={required} type={field === "scheduledDate" || field === "dueDate" ? "date" : field === "sortOrder" ? "number" : "text"}
              min={field === "sortOrder" ? 1 : undefined} value={form[field] ?? ""}
              onChange={(event) => update(field, event.target.value)} />
          </label>
        ))}
        <label className="text-xs font-semibold text-slate-600">상태
          <select className={fieldClass} value={form.status} onChange={(event) => update("status", event.target.value)}>
            <option value="not_started">예정</option><option value="in_progress">진행 중</option><option value="done">완료</option>
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={form.visible === true} onChange={(event) => update("visible", event.target.checked)} />교직원에게 노출
        </label>
      </div>
      <details className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-[#1A3B8B]">안내 문구 · 관련 도구 상세</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {EXTRA.map(([field, label]) => (
            <label key={field} className="min-w-0 text-xs font-semibold text-slate-600">{label}
              <textarea className={fieldClass} rows={field === "messageBody" ? 4 : 2} value={form[field] ?? ""}
                onChange={(event) => update(field, event.target.value)} />
            </label>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="grid gap-2 rounded-xl bg-[#F7F9FC] p-3 sm:grid-cols-3">
              <input aria-label={`도구 ${index + 1} 이름`} className={fieldClass} placeholder="도구 이름" value={form.tools[index]?.name || ""} onChange={(event) => updateTool(index, "name", event.target.value)} />
              <select aria-label={`도구 ${index + 1} 유형`} className={fieldClass} value={form.tools[index]?.type || "info"} onChange={(event) => updateTool(index, "type", event.target.value)}>
                <option value="info">정보</option><option value="internal">내부 메뉴</option><option value="external">외부 링크</option><option value="sheet">시트</option>
              </select>
              <input aria-label={`도구 ${index + 1} URL`} className={fieldClass} placeholder="URL 또는 메뉴 ID" value={form.tools[index]?.url || ""} onChange={(event) => updateTool(index, "url", event.target.value)} />
            </div>
          ))}
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-[#1A3B8B] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{item ? "수정 저장" : "업무 추가"}</button>
        {item && <button type="button" disabled={busy} onClick={() => item.active ? onDeactivate(item.id) : onRestore(item.id)}
          className="min-h-11 rounded-xl border border-[#C9DFFF] px-4 py-2 text-sm font-semibold text-[#1A3B8B] disabled:opacity-50">{item.active ? "비활성화" : "복원"}</button>}
      </div>
    </form>
  );
}
