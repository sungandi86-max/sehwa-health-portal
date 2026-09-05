import { useCallback, useEffect, useMemo, useState } from "react";
import FirebaseAdminRoleAccessGate from "../components/FirebaseAdminRoleAccessGate.jsx";
import { FirebaseContentState, FirebaseV2PageShell } from "../components/FirebaseV2PageShell.jsx";
import ResearchTrainingDryRunPanel from "../components/ResearchTrainingDryRunPanel.jsx";
import { getAdminStaffSubmissionStatusOverview } from "../lib/staffSubmissionStatusAdmin.js";

const STATUS_FILTERS = [
  { value: "incomplete", label: "미완료" },
  { value: "all", label: "전체" },
  { value: "completed", label: "완료" },
  { value: "needs_check", label: "확인 필요" },
];

const STATUS_TONES = {
  incomplete: "border-[#F3D8A8] bg-[#FFFDF7] text-[#9A5B00]",
  pending: "border-[#C8D8FF] bg-[#EEF4FF] text-[#3154A3]",
  unknown: "border-[#F3D8A8] bg-[#FFF8E8] text-[#9A5B00]",
  completed: "border-[#BFEBDC] bg-[#F0FBF7] text-[#08754B]",
};
function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function StatusBadge({ status, label }) {
  return (
    <span className={`rounded-[8px] border px-2.5 py-1 text-[12px] font-semibold ${STATUS_TONES[status] || STATUS_TONES.unknown}`}>
      {label}
    </span>
  );
}

function SummaryCell({ label, value, tone = "text-[#102047]" }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-2 rounded-[8px] border border-[#DDEAE7] bg-white px-3 py-1.5">
      <p className="text-[12px] font-semibold text-[#627083]">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function TaskSummary({ task, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-[12px] border p-3 text-left shadow-[var(--shh-soft-shadow)] transition focus:outline-none focus:ring-4 focus:ring-[#20A982]/15 ${
        selected ? "border-[#20A982] bg-[#F0FBF7]" : "border-[#DDEAE7] bg-white hover:border-[#BFEBDC]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold leading-5 text-[#102047]">{task.title}</h2>
          <p className="mt-1 text-[12px] font-semibold text-[#627083]">조회 기준 {task.summary.total}명{task.taskId === "health-mandatory-training-2026" && task.summary.latestSyncedAtLabel ? ` · 최근 갱신 ${task.summary.latestSyncedAtLabel}` : ""}</p>
        </div>
        <span className="rounded-[8px] border border-[#DDEAE7] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#08754B]">
          {task.category === "screening" ? "검진" : "연수"}
        </span>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <SummaryCell label="완료" value={task.summary.completed} tone="text-[#08754B]" />
        <SummaryCell label="미완료" value={task.summary.incomplete} tone="text-[#9A5B00]" />
        <SummaryCell label="확인필요" value={task.summary.unknown + task.summary.pending} tone="text-[#3154A3]" />
      </div>
    </button>
  );
}

function FilterBar({ filters, options, onChange }) {
  return (
    <section className="rounded-[12px] border border-[#DDEAE7] bg-white p-3 shadow-[var(--shh-soft-shadow)]">
      <div className="grid gap-2 md:grid-cols-[1.2fr_1fr_1fr_1.4fr]">
        <select
          value={filters.status}
          onChange={(event) => onChange({ ...filters, status: event.target.value })}
          className="min-h-10 rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-[13px] font-semibold text-[#102047]"
          aria-label="상태 필터"
        >
          {STATUS_FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>{filter.label}</option>
          ))}
        </select>
        <select
          value={filters.department}
          onChange={(event) => onChange({ ...filters, department: event.target.value })}
          className="min-h-10 rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-[13px] font-semibold text-[#102047]"
          aria-label="부서 필터"
        >
          <option value="all">부서 전체</option>
          {options.departments.map((department) => <option key={department} value={department}>{department}</option>)}
        </select>
        <select
          value={filters.position}
          onChange={(event) => onChange({ ...filters, position: event.target.value })}
          className="min-h-10 rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-[13px] font-semibold text-[#102047]"
          aria-label="직책 필터"
        >
          <option value="all">직책 전체</option>
          {options.positions.map((position) => <option key={position} value={position}>{position}</option>)}
        </select>
        <input
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          className="min-h-10 rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-[13px] font-semibold text-[#102047]"
          placeholder="이름 검색"
          aria-label="이름 검색"
        />
      </div>
    </section>
  );
}

function StaffRow({ item }) {
  return (
    <article className="grid gap-3 border-b border-[#DDEAE7] px-3 py-3 last:border-b-0 sm:grid-cols-[1.2fr_1fr_0.8fr_auto] sm:items-center">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-[#102047]">
          {item.realName || "교직원 정보 미연결"}
        </p>
        <p className="mt-1 text-[12px] font-medium text-[#8A96A8]">staffId {item.staffId || "-"}</p>
      </div>
      <p className="text-[13px] font-semibold text-[#627083]">{item.department || "-"}</p>
      <p className="text-[13px] font-semibold text-[#627083]">{item.position || "-"}</p>
      <StatusBadge status={item.status} label={item.statusLabel} />
    </article>
  );
}

function buildFilterOptions(items) {
  return {
    departments: [...new Set(items.map((item) => item.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")),
    positions: [...new Set(items.map((item) => item.position).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")),
  };
}

function filterItems(items, filters) {
  const search = normalizeText(filters.search);
  return items.filter((item) => {
    const statusMatch =
      filters.status === "all" ||
      item.status === filters.status ||
      (filters.status === "needs_check" && ["pending", "unknown"].includes(item.status));
    const departmentMatch = filters.department === "all" || item.department === filters.department;
    const positionMatch = filters.position === "all" || item.position === filters.position;
    const searchMatch = !search || normalizeText(item.realName).includes(search);
    return statusMatch && departmentMatch && positionMatch && searchMatch;
  });
}

function getDefaultStatusFilter(task) {
  if (!task) return "incomplete";
  if (task.summary.incomplete > 0) return "incomplete";
  if (task.summary.unknown + task.summary.pending > 0) return "needs_check";
  return "all";
}

function AdminStatusContent({ displayName }) {
  const [overview, setOverview] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState("tb-screening-2026");
  const [filters, setFilters] = useState({ status: "incomplete", department: "all", position: "all", search: "" });
  const [state, setState] = useState({ status: "loading", message: "" });
  const loadOverview = useCallback(async (options = {}) => {
    const shouldApply = options.shouldApply || (() => true);
    setState({ status: "loading", message: "" });
    try {
      const nextOverview = await getAdminStaffSubmissionStatusOverview();
      if (!shouldApply()) return;
      setOverview(nextOverview);
      setSelectedTaskId((currentTaskId) => {
        if (nextOverview.tasks.some((task) => task.taskId === currentTaskId)) return currentTaskId;
        return nextOverview.tasks[0]?.taskId || "tb-screening-2026";
      });
      setState({ status: nextOverview.tasks.length ? "success" : "empty", message: "" });
    } catch (error) {
      if (!shouldApply()) return;
      setOverview(null);
      setState({
        status: error?.code === "permission-denied" ? "permission-denied" : "error",
        message: "제출·이수 현황을 불러오지 못했습니다.",
      });
    }
  }, []);

  useEffect(() => {
    let shouldIgnore = false;

    loadOverview({ shouldApply: () => !shouldIgnore });
    return () => {
      shouldIgnore = true;
    };
  }, [loadOverview]);

  const selectedTask = overview?.tasks.find((task) => task.taskId === selectedTaskId) || overview?.tasks[0] || null;
  const filterOptions = useMemo(() => buildFilterOptions(selectedTask?.items || []), [selectedTask]);
  const filteredItems = useMemo(() => filterItems(selectedTask?.items || [], filters), [selectedTask, filters]);

  return (
    <FirebaseV2PageShell
      label="관리자"
      title="교직원 제출·이수 현황"
      description="결핵검진, 심폐소생술 연수, 보건 관련 법정의무연수 상태를 Firestore projection 기준으로 확인합니다."
      displayName={displayName}
    >
      <ResearchTrainingDryRunPanel onApplied={loadOverview} />

      {state.status === "success" && selectedTask && (
        <>
          <section className="grid gap-2 lg:grid-cols-3">
            {overview.tasks.map((task) => (
              <TaskSummary
                key={task.taskId}
                task={task}
                selected={task.taskId === selectedTask.taskId}
                onSelect={() => {
                  setSelectedTaskId(task.taskId);
                  setFilters((current) => ({ ...current, status: getDefaultStatusFilter(task), department: "all", position: "all", search: "" }));
                }}
              />
            ))}
          </section>

          {overview.directoryStatus !== "success" && (
            <section className="rounded-[12px] border border-[#F3D8A8] bg-[#FFFDF7] p-4">
              <p className="text-[13px] font-semibold leading-5 text-[#9A5B00]">
                교직원 보조 정보를 일부 불러오지 못했습니다. 상태 집계는 projection 기준으로 표시합니다.
              </p>
            </section>
          )}

          {overview.directoryStatus === "success" && selectedTask.summary.directoryLinked < selectedTask.summary.total && (
            <section className="rounded-[12px] border border-[#DDEAE7] bg-white p-4">
              <p className="text-[13px] font-semibold leading-5 text-[#627083]">
                이름·부서 표시는 현재 학기 staffId가 연결된 계정에 한해 표시됩니다. 나머지는 교직원 directory projection이 준비된 뒤 보강할 수 있습니다.
              </p>
            </section>
          )}

          <FilterBar filters={filters} options={filterOptions} onChange={setFilters} />

          <section className="overflow-hidden rounded-[12px] border border-[#DDEAE7] bg-white shadow-[var(--shh-soft-shadow)]">
            <div className="flex flex-col gap-2 border-b border-[#DDEAE7] bg-[#F3F8F6] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-[15px] font-semibold text-[#102047]">{selectedTask.title}</h2>
              <p className="text-[12px] font-semibold text-[#627083]">표시 {filteredItems.length}명 / 조회 기준 {selectedTask.summary.total}명</p>
            </div>
            {filteredItems.length > 0 ? (
              <div>{filteredItems.map((item) => <StaffRow key={item.id} item={item} />)}</div>
            ) : (
              <div className="px-4 py-8 text-center text-[13px] font-semibold text-[#627083]">
                현재 선택한 조건에 해당하는 교직원이 없습니다.
              </div>
            )}
          </section>
        </>
      )}

      {state.status !== "success" && (
        <FirebaseContentState
          status={state.status}
          message={state.message}
          emptyMessage="현재 확인 가능한 제출·이수 현황이 없습니다."
        />
      )}
    </FirebaseV2PageShell>
  );
}

export default function FirebaseStaffSubmissionStatusAdminPage() {
  return (
    <FirebaseAdminRoleAccessGate deniedTitle="제출·이수 현황 관리자 권한이 없습니다.">
      {({ displayName }) => <AdminStatusContent displayName={displayName} />}
    </FirebaseAdminRoleAccessGate>
  );
}
