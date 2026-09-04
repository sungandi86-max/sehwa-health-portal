import {
  INFECTION_CASE_STATUS_LABELS,
  INFECTION_CASE_STATUS_OPTIONS,
  INFECTION_SUBMISSION_STATUS,
} from "../lib/infectionStatus.js";
import { getRecommendedCaseStatus } from "../lib/infectionCases.js";

export const ALL_CASE_STATUS = "all";

const GRADE_OPTIONS = ["1", "2", "3"];

function FieldLabel({ children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-semibold text-[#102047]">
      {children}
    </label>
  );
}

export function SummaryRow({ items }) {
  return (
    <section className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="감염병 사례 요약">
      {items.map((item) => (
        <article key={item.status} className="rounded-[14px] border border-[#DDEAE7] bg-white/95 p-3">
          <p className="text-[12px] font-semibold text-[#627083]">{item.label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[#102047]">{item.count}</p>
        </article>
      ))}
    </section>
  );
}

function StatusChip({ label, tone = "info" }) {
  const className =
    tone === "case"
      ? "border-[#F2D6B3] bg-[#FFF8ED] text-[#8A4B12]"
      : "border-[#BFEBDC] bg-[#F0FBF7] text-[#08754B]";

  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

function Recommendation({ infectionCase }) {
  const recommendedStatus = getRecommendedCaseStatus(infectionCase);
  if (!recommendedStatus) return null;

  return (
    <p className="rounded-[10px] border border-[#F2D6B3] bg-[#FFF8ED] px-3 py-2 text-xs font-semibold text-[#8A4B12]">
      등교중지 종료일 기준 {INFECTION_CASE_STATUS_LABELS[recommendedStatus]} 상태를 권장합니다.
    </p>
  );
}

function CaseStatusSelect({ caseStatus, disabled, onChange }) {
  return (
    <select
      aria-label="사례 상태 변경"
      value={caseStatus}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className="min-h-10 rounded-[10px] border border-[#DDEAE7] bg-white px-3 py-2 text-sm font-semibold text-[#102047] outline-none focus:ring-4 focus:ring-[#20A982]/15 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {INFECTION_CASE_STATUS_OPTIONS.map((status) => (
        <option key={status} value={status}>
          {INFECTION_CASE_STATUS_LABELS[status]}
        </option>
      ))}
    </select>
  );
}

function DetailItem({ label, value }) {
  return (
    <div>
      <dt className="text-[12px] font-semibold text-[#627083]">{label}</dt>
      <dd className="mt-1 break-keep text-sm font-semibold text-[#102047]">{value || "-"}</dd>
    </div>
  );
}

export function InfectionCaseCard({ infectionCase, pendingAction, onCaseStatusChange, onReview }) {
  const student = infectionCase.student || {};
  const infection = infectionCase.infection || {};
  const submitter = infectionCase.submittedBy || {};
  const isPending = pendingAction === infectionCase.id;
  const isSubmitted = infectionCase.submissionStatus === INFECTION_SUBMISSION_STATUS.submitted;

  return (
    <article className="rounded-[16px] border border-[#DDEAE7] bg-white/95 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip label={infectionCase.submissionStatusLabel} />
            <StatusChip label={infectionCase.caseStatusLabel} tone="case" />
          </div>
          <h2 className="mt-3 text-base font-bold leading-6 text-[#102047]">
            {student.grade || "-"}학년 {student.classNo || "-"}반 {student.number || "-"}번 {student.name || "-"}
          </h2>
          <p className="mt-1 text-sm font-semibold text-[#627083]">{infection.diseaseName || "감염병명 없음"}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSubmitted && (
            <button
              type="button"
              onClick={() => onReview(infectionCase.id)}
              disabled={isPending}
              className="min-h-10 rounded-[10px] bg-[#20A982] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#178C6C] focus:outline-none focus:ring-4 focus:ring-[#20A982]/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              확인완료
            </button>
          )}
          <CaseStatusSelect
            caseStatus={infectionCase.caseStatus}
            disabled={isPending}
            onChange={(nextStatus) => onCaseStatusChange(infectionCase.id, nextStatus)}
          />
        </div>
      </div>

      <div className="mt-3">
        <Recommendation infectionCase={infectionCase} />
      </div>

      <dl className="mt-4 grid gap-3 border-t border-[#DDEAE7] pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <DetailItem label="진단일" value={infection.diagnosisDate} />
        <DetailItem label="등교중지 기간" value={`${infection.exclusionStartDate || "-"} ~ ${infection.exclusionEndDate || "-"}`} />
        <DetailItem label="제출일" value={infectionCase.submittedAtLabel} />
        <DetailItem label="제출자" value={submitter.displayName || submitter.email || "-"} />
      </dl>

      {infectionCase.report?.note && (
        <p className="mt-3 rounded-[10px] bg-[#F7FBF9] px-3 py-2 text-sm font-medium leading-5 text-[#627083]">
          {infectionCase.report.note}
        </p>
      )}
    </article>
  );
}

export function InfectionCaseFilters({
  caseStatus,
  classNo,
  grade,
  includeClosed,
  searchText,
  onCaseStatusChange,
  onClassNoChange,
  onGradeChange,
  onIncludeClosedChange,
  onSearchTextChange,
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(150px,1fr)_120px_120px_minmax(180px,1.4fr)_auto] md:items-end">
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="infection-case-status-filter">사례 상태</FieldLabel>
        <select
          id="infection-case-status-filter"
          value={caseStatus}
          onChange={(event) => onCaseStatusChange(event.target.value)}
          className="min-h-10 rounded-[10px] border border-[#DDEAE7] bg-white px-3 py-2 text-sm font-semibold text-[#102047] outline-none focus:ring-4 focus:ring-[#20A982]/15"
        >
          <option value={ALL_CASE_STATUS}>전체</option>
          {INFECTION_CASE_STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {INFECTION_CASE_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="infection-case-grade-filter">학년</FieldLabel>
        <select
          id="infection-case-grade-filter"
          value={grade}
          onChange={(event) => onGradeChange(event.target.value)}
          className="min-h-10 rounded-[10px] border border-[#DDEAE7] bg-white px-3 py-2 text-sm font-semibold text-[#102047] outline-none focus:ring-4 focus:ring-[#20A982]/15"
        >
          <option value="">전체</option>
          {GRADE_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}학년
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="infection-case-class-filter">반</FieldLabel>
        <input
          id="infection-case-class-filter"
          type="search"
          inputMode="numeric"
          value={classNo}
          onChange={(event) => onClassNoChange(event.target.value)}
          className="min-h-10 rounded-[10px] border border-[#DDEAE7] bg-white px-3 py-2 text-sm font-semibold text-[#102047] outline-none focus:ring-4 focus:ring-[#20A982]/15"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="infection-case-search">학생명 또는 감염병명</FieldLabel>
        <input
          id="infection-case-search"
          type="search"
          value={searchText}
          onChange={(event) => onSearchTextChange(event.target.value)}
          className="min-h-10 rounded-[10px] border border-[#DDEAE7] bg-white px-3 py-2 text-sm font-semibold text-[#102047] outline-none focus:ring-4 focus:ring-[#20A982]/15"
        />
      </div>

      <label className="inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-[#DDEAE7] bg-[#F7FBF9] px-3 py-2 text-sm font-semibold text-[#102047]">
        <input
          type="checkbox"
          checked={includeClosed}
          onChange={(event) => onIncludeClosedChange(event.target.checked)}
          className="h-4 w-4 accent-[#20A982]"
        />
        종결 포함
      </label>
    </div>
  );
}

function matchesText(infectionCase, searchText) {
  const keyword = searchText.trim().toLowerCase();
  if (!keyword) return true;

  const student = infectionCase.student || {};
  const infection = infectionCase.infection || {};
  return [student.name, infection.diseaseName].some((value) => String(value || "").toLowerCase().includes(keyword));
}

export function filterCases(cases, filters) {
  return cases.filter((infectionCase) => {
    const student = infectionCase.student || {};
    const matchesStatus = filters.caseStatus === ALL_CASE_STATUS || infectionCase.caseStatus === filters.caseStatus;
    const matchesGrade = !filters.grade || String(student.grade || "") === filters.grade;
    const matchesClassNo = !filters.classNo || String(student.classNo || "") === filters.classNo.trim();
    return matchesStatus && matchesGrade && matchesClassNo && matchesText(infectionCase, filters.searchText);
  });
}
