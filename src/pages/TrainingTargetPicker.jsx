import { useMemo, useState } from "react";
import { selectTrainingTargets } from "../../common/trainingTargetSelection.js";

const control = "min-h-11 w-full rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-sm text-[#102047] focus:border-[#0D4EA6] focus:outline-none";
const secondary = "min-h-11 rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-sm font-semibold text-[#0D4EA6]";

export function TrainingTargetPicker({ directory, selection, onChange, review = false }) {
  const [query, setQuery] = useState("");
  const departments = useMemo(() => [...new Set(directory.map((person) => person.department).filter(Boolean))].sort(), [directory]);
  let members = [];
  try { members = selectTrainingTargets(directory, selection).members; } catch { /* Empty manual selection is shown below. */ }
  const selectedIds = new Set(members.map((person) => person.staffId));
  const normalizedQuery = query.normalize("NFKC").trim().toLowerCase();
  const shown = directory.filter((person) => person.employmentStatus === "재직" &&
    (!review || selectedIds.has(person.staffId) || normalizedQuery) &&
    (!normalizedQuery || [person.name, person.department, person.position, person.staffId]
      .some((value) => String(value || "").toLowerCase().includes(normalizedQuery))));

  function toggle(staffId, checked) {
    onChange({ ...selection,
      includeStaffIds: checked ? [...new Set([...selection.includeStaffIds, staffId])] : selection.includeStaffIds.filter((id) => id !== staffId),
      excludeStaffIds: checked ? selection.excludeStaffIds.filter((id) => id !== staffId) : [...new Set([...selection.excludeStaffIds, staffId])] });
  }

  return <div className="space-y-3">
    {!review && <div className="grid gap-3 rounded-[10px] border border-[#DDEAE7] bg-[#F3F8F6] p-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm font-semibold text-[#102047]">대상 프리셋<select className={control} value={selection.preset}
        onChange={(event) => onChange({ ...selection, preset: event.target.value,
          includeAdministrativeStaff: event.target.value === "all" })}>
        <option value="all">전체 교직원</option><option value="teachers">교원 중심</option><option value="manual">직접 선택</option>
      </select></label>
      <label className="grid gap-1 text-sm font-semibold text-[#102047]">부서<select className={control} value={selection.department}
        onChange={(event) => onChange({ ...selection, department: event.target.value })}>
        <option value="">모든 부서</option>{departments.map((department) => <option key={department}>{department}</option>)}
      </select></label>
      <label className="flex min-h-11 items-center gap-2 text-sm text-[#102047]"><input type="checkbox" checked={selection.includeAdministrativeStaff}
        onChange={(event) => onChange({ ...selection, includeAdministrativeStaff: event.target.checked })} />행정실 포함</label>
      <label className="flex min-h-11 items-center gap-2 text-sm text-[#102047]"><input type="checkbox" checked={selection.includeHourlyInstructors}
        onChange={(event) => onChange({ ...selection, includeHourlyInstructors: event.target.checked })} />시간강사 포함</label>
      <p className="sm:col-span-2 text-xs text-[#627083]">기간제교사는 현재 명단에서 별도 직군으로 구분되지 않아 자동 필터를 제공하지 않습니다.</p>
    </div>}
    <div className="rounded-[10px] border border-[#DDEAE7] bg-white">
      <div className="flex flex-col gap-2 border-b border-[#DDEAE7] p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-[#102047]">현재 조건으로 {members.length}명이 대상입니다.</p>
        <label className="grid gap-1 text-xs text-[#627083]">교직원 검색<input className={control} value={query}
          onChange={(event) => setQuery(event.target.value)} placeholder="성명 · 부서 · 교직원ID" /></label>
      </div>
      <ul className="max-h-80 divide-y divide-[#DDEAE7] overflow-y-auto">{shown.map((person) => <li key={person.staffId}
        className="flex min-w-0 items-center justify-between gap-2 px-3 py-2">
        <span className="min-w-0 text-sm text-[#102047]"><strong>{person.name}</strong> <span className="text-[#627083]">· {person.department || "부서 미기재"} · {person.position || "직책 미기재"}</span></span>
        <button type="button" className={secondary} onClick={() => toggle(person.staffId, !selectedIds.has(person.staffId))}
          aria-label={`${person.name} ${selectedIds.has(person.staffId) ? "대상 제외" : "대상 추가"}`}>
          {selectedIds.has(person.staffId) ? "제외" : "추가"}
        </button>
      </li>)}</ul>
      {!shown.length && <p className="p-3 text-sm text-[#627083]">{review ? "대상자가 없습니다. 검색하여 추가해 주세요." : "검색 결과가 없습니다."}</p>}
    </div>
  </div>;
}
