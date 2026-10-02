import { useState } from "react";
import { applyResearchTrainingSnapshot, checkResearchTrainingDryRun } from "../lib/researchTrainingDryRun.js";

const EMPTY_RESULT = {
  status: "idle",
  message: "",
  data: null,
};

function CountItem({ label, value, tone = "text-[#102047]" }) {
  return (
    <div className="rounded-[8px] border border-[#DDEAE7] bg-white px-3 py-2">
      <p className="text-[11px] font-semibold text-[#627083]">{label}</p>
      <p className={`mt-1 text-[18px] font-bold tabular-nums ${tone}`}>{value ?? 0}</p>
    </div>
  );
}

function HeaderCheck({ label, value }) {
  return (
    <span className="rounded-[8px] border border-[#DDEAE7] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#627083]">
      {label} {value ? "있음" : "없음"}
    </span>
  );
}

function StatusValueList({ values }) {
  const entries = Object.entries(values || {});
  if (!entries.length) return <p className="text-[12px] font-semibold text-[#8A96A8]">상태값 없음</p>;

  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([label, count]) => (
        <span key={label} className="rounded-[8px] border border-[#DDEAE7] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#627083]">
          {label} {count}
        </span>
      ))}
    </div>
  );
}

function formatApplySyncedAt(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function ResultPanel({ data }) {
  const headerMissing = data.headerInfo?.parseStatus === "header_not_found";
  const exceptionHeaderMissing = data.exceptions?.parseStatus === "header_not_found";
  const applySyncedAt = formatApplySyncedAt(data.apply?.syncedAt);
  const applyAllowed = data.safety?.applyAllowed === true;
  const exceptionErrors =
    Number(data.matching?.invalidExceptionRows || 0) + Number(data.exceptions?.duplicateConfirmedRows || 0);

  return (
    <div className="mt-3 rounded-[12px] border border-[#DDEAE7] bg-[#F3F8F6] p-3">
      {headerMissing && (
        <p className="mb-3 rounded-[8px] border border-[#F3D8A8] bg-[#FFFDF7] px-3 py-2 text-[12px] font-semibold leading-5 text-[#9A5B00]">
          성명/이수상태 헤더를 자동 확인하지 못했습니다. 연구부 시트 구조를 확인해 주세요.
        </p>
      )}
      {exceptionHeaderMissing && (
        <p className="mb-3 rounded-[8px] border border-[#F3D8A8] bg-[#FFFDF7] px-3 py-2 text-[12px] font-semibold leading-5 text-[#9A5B00]">
          법정의무연수 예외 시트 헤더를 확인하지 못했습니다.
        </p>
      )}
      <p
        className={`mb-3 rounded-[8px] border px-3 py-2 text-[12px] font-semibold leading-5 [word-break:keep-all] ${
          applyAllowed
            ? "border-[#BFEBDC] bg-white text-[#08754B]"
            : "border-[#F3D8A8] bg-[#FFFDF7] text-[#9A5B00]"
        }`}
      >
        {applyAllowed ? "안전조건을 충족해 현황 새로고침이 가능합니다." : "안전조건을 충족하지 않아 현황 새로고침이 차단됩니다."}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <CountItem label="원본 행" value={data.rows?.sourceRows} />
        <CountItem label="유효 행" value={data.rows?.validRows} />
        <CountItem label="원본 필수값 오류" value={data.rows?.missingNameRows} tone="text-[#9A5B00]" />
        <CountItem label="현재 재직 매칭" value={data.matching?.matchedActive} tone="text-[#08754B]" />
        <CountItem label="휴직 제외" value={data.matching?.excludedLeave} />
        <CountItem label="퇴직 제외" value={data.matching?.excludedRetired} />
        <CountItem label="직군·비대상 제외" value={data.matching?.excludedByTargetRule} />
        <CountItem label="확인된 과거 직원 제외" value={data.matching?.confirmedSourceOnlyExcluded} />
        <CountItem label="확인 필요한 source-only" value={data.matching?.unresolvedSourceOnly} tone="text-[#9A5B00]" />
        <CountItem label="연구부 명단에 없는 재직자" value={data.matching?.canonicalActiveMissingFromSource} tone="text-[#9A5B00]" />
        <CountItem label="모호" value={data.matching?.ambiguous} tone="text-[#9A5B00]" />
        <CountItem label="중복 staffId" value={data.matching?.duplicateStaffIds} tone="text-[#3154A3]" />
        <CountItem label="명단 중복 staffId" value={data.matching?.duplicateCanonicalStaffIds} tone="text-[#9A5B00]" />
        <CountItem label="재직상태 오류" value={data.matching?.invalidEmploymentStatus} tone="text-[#9A5B00]" />
        <CountItem label="예외 목록 오류" value={exceptionErrors} tone="text-[#9A5B00]" />
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-4">
        <CountItem label="이수완료" value={data.status?.completed} tone="text-[#08754B]" />
        <CountItem label="미완료" value={data.status?.incomplete} tone="text-[#9A5B00]" />
        <CountItem label="확인필요" value={data.status?.unknown} tone="text-[#3154A3]" />
        <CountItem label="강사/시간강사 포함" value={data.rows?.lecturerRows} />
      </div>
      {data.apply && (
        <p className="mt-3 rounded-[8px] border border-[#BFEBDC] bg-white px-3 py-2 text-[12px] font-semibold leading-5 text-[#08754B]">
          Firestore snapshot {data.apply.docsWritten}건을 새로고침했습니다. 기존 research snapshot 중 원본에 없는 항목은 {data.apply.orphanSnapshots}건이며 삭제하지 않았습니다.
          {applySyncedAt ? ` 최근 갱신: ${applySyncedAt}` : ""}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <HeaderCheck label="성명 컬럼" value={data.headerInfo?.hasNameColumn} />
        <HeaderCheck label="소속부서" value={data.headerInfo?.hasDepartmentColumn} />
        <HeaderCheck label="직책" value={data.headerInfo?.hasPositionColumn} />
        <HeaderCheck label="이수상태" value={data.headerInfo?.hasStatusColumn} />
      </div>
      <div className="mt-3">
        <p className="mb-2 text-[12px] font-bold text-[#102047]">이수상태 값 종류</p>
        <StatusValueList values={data.statusValues} />
      </div>
      <p className="mt-3 text-[12px] font-semibold leading-5 text-[#627083] [word-break:keep-all]">
        원본 필수값 오류, 미확인 원본 전용 행, 연구부 명단에 없는 재직자, 모호·중복·재직상태·예외 목록 오류가 모두 0건이어야 현황을 새로고침할 수 있습니다.
      </p>
    </div>
  );
}

export default function ResearchTrainingDryRunPanel({ onApplied }) {
  const [result, setResult] = useState(EMPTY_RESULT);

  const handleError = (error, fallbackMessage) => {
    const message = error?.status >= 500
      ? "연수 현황 점검 설정을 확인해 주세요."
      : error?.message || fallbackMessage;
    setResult({ status: "error", message, data: null });
  };

  const handleCheck = async () => {
    setResult({ status: "loading", message: "연수 현황 확인 중...", data: null });
    try {
      const data = await checkResearchTrainingDryRun();
      setResult({ status: "success", message: "", data });
    } catch (error) {
      handleError(error, "연수 현황을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  const handleApply = async () => {
    const confirmed = window.confirm("연구부 시트의 현재 이수상태를 다시 확인하여 온라인 보건실 현황을 갱신합니다. 연구부 원본 시트는 수정하지 않습니다.");
    if (!confirmed) return;

    setResult({ status: "applying", message: "연수 현황 새로고침 중...", data: null });
    try {
      const data = await applyResearchTrainingSnapshot();
      setResult({ status: "success", message: "", data });
      await onApplied?.();
    } catch (error) {
      setResult({ status: "error", message: error?.status === 403 ? error.message : "연수 현황을 새로고침하지 못했습니다. 기존 현황은 유지됩니다.", data: null });
    }
  };

  const isWorking = result.status === "loading" || result.status === "applying";
  const applyBlocked = result.status === "success" && result.data?.safety?.applyAllowed === false;

  return (
    <section className="rounded-[12px] border border-[#DDEAE7] bg-white p-3 shadow-[var(--shh-soft-shadow)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[12px] font-semibold text-[#08754B]">연구부 연수 현황 점검</p>
          <h2 className="mt-1 text-[15px] font-semibold text-[#102047]">점검 및 snapshot 새로고침</h2>
          <p className="mt-1 text-[12px] font-semibold leading-5 text-[#627083]">
            점검은 저장하지 않고, 새로고침은 검증 후 Firestore snapshot만 반영합니다.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={handleCheck}
            disabled={isWorking}
            className="min-h-10 rounded-[9px] border border-[#DDEAE7] bg-white px-3 py-2 text-[13px] font-semibold text-[#102047] transition hover:border-[#20A982] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {result.status === "loading" ? "확인 중..." : "연구부 연수 현황 점검"}
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={isWorking || applyBlocked}
            className="min-h-10 rounded-[9px] border border-[#20A982] bg-[#20A982] px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-[#08754B] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {result.status === "applying" ? "새로고침 중..." : "연수 현황 새로고침"}
          </button>
        </div>
      </div>
      {(result.status === "loading" || result.status === "applying") && <p className="mt-3 text-[13px] font-semibold text-[#627083]">{result.message}</p>}
      {result.status === "error" && (
        <p className="mt-3 rounded-[8px] border border-[#F3D8A8] bg-[#FFFDF7] px-3 py-2 text-[13px] font-semibold text-[#9A5B00]">
          {result.message}
        </p>
      )}
      {result.status === "success" && result.data && <ResultPanel data={result.data} />}
    </section>
  );
}
