import { useMemo, useState } from "react";
import { selectTrainingTargets, toggleTrainingTarget } from "../../common/trainingTargetSelection.js";

const control = "min-h-11 w-full rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-sm text-[#102047] focus:border-[#0D4EA6] focus:outline-none";
const secondary = "min-h-11 rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-sm font-semibold text-[#0D4EA6]";

const PRESET_OPTIONS = [
  ["all", "전체 교직원", "재직 교직원을 기본 대상으로 설정"],
  ["teachers", "교원 중심", "교원 직군을 중심으로 설정"],
  ["manual", "직접 선택", "검색 후 개별 추가·제외"],
];

export function TrainingTargetPicker({ directory, selection, onChange, review = false, listExpanded = true,
  onListExpandedChange, rowDetails, onToggleMember, mode = "default", summary = null, actions = null }) {
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
    onChange(toggleTrainingTarget(selection, staffId, checked));
    onToggleMember?.(staffId, checked);
  }

  if (mode === "manager") {
    return <div className="training-target-picker training-target-picker--manager">
      {!review && <section className="training-target-controls training-admin-panel" aria-label="대상자 설정">
        <fieldset className="training-target-fieldset">
          <legend>대상 범위</legend>
          <div className="training-target-preset-grid">
            {PRESET_OPTIONS.map(([value, label, description]) => <label key={value} className={`training-target-preset${selection.preset === value ? " is-selected" : ""}`}>
              <input type="radio" name="training-target-preset" value={value} checked={selection.preset === value}
                onChange={() => onChange({ ...selection, preset: value, includeAdministrativeStaff: value === "all" })} />
              <span>{label}</span>
              <small>{description}</small>
            </label>)}
          </div>
        </fieldset>
        <div className="training-target-options-grid">
          <fieldset className="training-target-fieldset">
            <legend>포함/제외</legend>
            <div className="training-target-toggle-row">
              <label className="training-target-toggle"><input type="checkbox" checked={selection.includeAdministrativeStaff}
                onChange={(event) => onChange({ ...selection, includeAdministrativeStaff: event.target.checked })} />행정실 포함</label>
              <label className="training-target-toggle"><input type="checkbox" checked={selection.includeHourlyInstructors}
                onChange={(event) => onChange({ ...selection, includeHourlyInstructors: event.target.checked })} />시간강사 포함</label>
            </div>
          </fieldset>
          <label className="training-target-field">부서
            <select className={control} value={selection.department}
              onChange={(event) => onChange({ ...selection, department: event.target.value })}>
              <option value="">전체 부서</option>{departments.map((department) => <option key={department}>{department}</option>)}
            </select>
          </label>
        </div>
        <p className="training-target-note">기간제교사 자동 필터는 현재 명단에서 지원되지 않습니다.</p>
      </section>}
      {summary}
      {actions}

      <section className="training-target-roster training-admin-panel" aria-label="대상자 명단">
        <div className="training-target-roster-head">
          <div>
            <h2>대상자 명단</h2>
            <p>현재 조건으로 {members.length}명이 대상입니다. 필요할 때만 펼쳐 개별 예외를 조정하세요.</p>
          </div>
          {onListExpandedChange && <button type="button" className={secondary} aria-expanded={listExpanded}
            onClick={() => onListExpandedChange(!listExpanded)}>{listExpanded ? "대상자 명단 접기" : "대상자 명단 보기"}</button>}
        </div>
        {listExpanded && <div className="training-target-roster-body">
          <label className="training-target-search">검색
            <input className={control} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="성명 · 부서 · 교직원ID" />
          </label>
          <div className="training-target-table-head" aria-hidden="true">
            <span>선택</span><span>이름</span><span>부서</span><span>직군</span><span>상태</span><span>예외</span>
          </div>
          <ul className="training-target-row-list">{shown.map((person) => {
            const selected = selectedIds.has(person.staffId);
            const meta = rowDetails?.getMeta?.(person, selected) || { statusLabel: selected ? "대상" : "비대상", tone: selected ? "target" : "neutral" };
            return <li key={person.staffId} className="training-target-row">
              <label className="training-target-row-check">
                <input type="checkbox" checked={selected} onChange={(event) => toggle(person.staffId, event.target.checked)}
                  aria-label={`${person.name} 교육 대상`} />
              </label>
              <div className="training-target-row-person">
                <strong>{person.name}</strong>
                <span>{person.staffId}</span>
              </div>
              <span className="training-target-row-meta">{person.department || "부서 미기재"}</span>
              <span className="training-target-row-meta">{person.position || "직책 미기재"}</span>
              <span className={`training-target-status training-target-status--${meta.tone}`}>{meta.statusLabel}</span>
              <button type="button" className={secondary} aria-expanded={rowDetails?.openId === person.staffId}
                onClick={() => rowDetails?.toggle(person.staffId)}>예외 설정</button>
              {rowDetails?.openId === person.staffId && <div className="training-target-row-detail">{rowDetails.render(person, selected)}</div>}
            </li>;
          })}</ul>
          {!shown.length && <p className="training-target-empty">{review ? "대상자가 없습니다. 검색하여 추가해 주세요." : "검색 결과가 없습니다."}</p>}
        </div>}
      </section>
    </div>;
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
        {onListExpandedChange && <button type="button" className={secondary} aria-expanded={listExpanded}
          onClick={() => onListExpandedChange(!listExpanded)}>{listExpanded ? "대상자 명단 접기" : "대상자 명단 보기"}</button>}
        {listExpanded && <label className="grid gap-1 text-xs text-[#627083]">교직원 검색<input className={control} value={query}
          onChange={(event) => setQuery(event.target.value)} placeholder="성명 · 부서 · 교직원ID" /></label>
        }
      </div>
      {listExpanded && <><ul className="max-h-96 divide-y divide-[#DDEAE7] overflow-y-auto">{shown.map((person) => <li key={person.staffId}
        className="min-w-0 px-3 py-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          {rowDetails ? <label className="flex min-w-0 flex-1 items-center gap-3 text-sm text-[#102047]">
            <input type="checkbox" checked={selectedIds.has(person.staffId)} onChange={(event) => toggle(person.staffId, event.target.checked)}
              aria-label={`${person.name} 교육 대상`} />
            <span className="min-w-0"><strong>{person.name}</strong> <span className="text-[#627083]">· {person.department || "부서 미기재"} · {person.position || "직책 미기재"}</span></span>
          </label> : <span className="min-w-0 text-sm text-[#102047]"><strong>{person.name}</strong> <span className="text-[#627083]">· {person.department || "부서 미기재"} · {person.position || "직책 미기재"}</span></span>}
          {!rowDetails && <button type="button" className={secondary} onClick={() => toggle(person.staffId, !selectedIds.has(person.staffId))}
            aria-label={`${person.name} ${selectedIds.has(person.staffId) ? "대상 제외" : "대상 추가"}`}>
            {selectedIds.has(person.staffId) ? "제외" : "추가"}
          </button>}
          {rowDetails && <button type="button" className={secondary} onClick={() => rowDetails.toggle(person.staffId)}>예외 설정</button>}
        </div>
        {rowDetails?.openId === person.staffId && rowDetails.render(person, selectedIds.has(person.staffId))}
      </li>)}</ul>
      {!shown.length && <p className="p-3 text-sm text-[#627083]">{review ? "대상자가 없습니다. 검색하여 추가해 주세요." : "검색 결과가 없습니다."}</p>}</>}
    </div>
  </div>;
}
