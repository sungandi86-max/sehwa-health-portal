import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ALL_CASE_STATUS,
  InfectionCaseCard,
  InfectionCaseFilters,
  SummaryRow,
  filterCases,
} from "../components/FirebaseAdminInfectionCases.jsx";
import FirebaseV2AccessGate from "../components/FirebaseV2AccessGate.jsx";
import { FirebaseContentState, FirebaseV2PageShell } from "../components/FirebaseV2PageShell.jsx";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import {
  getCaseStatusSummary,
  getInfectionCases,
  markInfectionSubmissionReviewed,
  updateInfectionCaseStatus,
} from "../lib/infectionCases.js";
import {
  isSafeInfectionSheetSyncPlan,
  isSuccessfulInfectionSheetSyncApply,
  syncInfectionSheetProjection,
} from "../lib/infectionSheetProjection.js";
import { INFECTION_CASE_STATUS } from "../lib/infectionStatus.js";

const SHEET_SYNC_CONFIRM_MESSAGE =
  "Firestore 감염병 사례를 Google Sheet 현황판에 반영합니다. Firestore가 원본이며 기존 무관리 행은 수정하지 않습니다.";

const DRY_RUN_METRICS = [
  { key: "firestoreCount", label: "Firestore 사례 수" },
  { key: "projectedExisting", label: "기존 projection 수" },
  { key: "toInsert", label: "추가 예정" },
  { key: "toUpdate", label: "업데이트 예정" },
  { key: "unmanagedSheetRows", label: "legacy 무관리 행" },
  { key: "duplicates", label: "duplicate" },
  { key: "errors", label: "errors" },
];

const APPLY_METRICS = [
  { key: "inserted", label: "추가 완료" },
  { key: "updated", label: "업데이트 완료" },
  { key: "errors", label: "errors" },
];

function SheetSyncMetrics({ items, result }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {items.map((item) => (
        <div key={item.key} className="rounded-[8px] border border-[#DDEAE7] bg-white px-3 py-2">
          <dt className="text-[11px] font-medium text-[#627083]">{item.label}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-[#102047]">{result[item.key]}건</dd>
        </div>
      ))}
    </dl>
  );
}

function InfectionSheetSyncPanel({ user }) {
  const [dryRunResult, setDryRunResult] = useState(null);
  const [applyResult, setApplyResult] = useState(null);
  const [runningAction, setRunningAction] = useState("");
  const [notice, setNotice] = useState({ tone: "idle", message: "" });

  const canApply = isSafeInfectionSheetSyncPlan(dryRunResult) && !runningAction;

  const handleDryRun = async () => {
    setRunningAction("dry-run");
    setNotice({ tone: "loading", message: "시트 동기화 상태를 점검하는 중입니다." });

    try {
      const result = await syncInfectionSheetProjection(user);
      const safe = isSafeInfectionSheetSyncPlan(result);
      setDryRunResult(result);
      setApplyResult(null);
      setNotice({
        tone: safe ? "success" : "warning",
        message: safe
          ? "안전 조건을 확인했습니다. 시트 동기화를 실행할 수 있습니다."
          : "중복 또는 오류가 있어 시트 동기화를 실행할 수 없습니다.",
      });
    } catch {
      setDryRunResult(null);
      setApplyResult(null);
      setNotice({ tone: "error", message: "시트 동기화 점검에 실패했습니다. Firestore 사례는 유지됩니다." });
    } finally {
      setRunningAction("");
    }
  };

  const handleApply = async () => {
    if (!canApply || !window.confirm(SHEET_SYNC_CONFIRM_MESSAGE)) return;

    setDryRunResult(null);
    setRunningAction("apply");
    setNotice({ tone: "loading", message: "Google Sheet 현황판에 반영하는 중입니다." });

    try {
      const result = await syncInfectionSheetProjection(user, { apply: true });
      setApplyResult(result);
      if (!isSuccessfulInfectionSheetSyncApply(result)) {
        setNotice({ tone: "error", message: "시트 반영에 실패했습니다. Firestore 사례는 유지됩니다." });
        return;
      }

      try {
        const nextDryRun = await syncInfectionSheetProjection(user);
        setDryRunResult(nextDryRun);
        setNotice({ tone: "success", message: "시트 반영을 완료하고 동기화 상태를 다시 확인했습니다." });
      } catch {
        setNotice({
          tone: "warning",
          message: "시트 반영은 완료했지만 자동 재점검에 실패했습니다. 점검 버튼으로 다시 확인해 주세요.",
        });
      }
    } catch {
      setNotice({ tone: "error", message: "시트 반영에 실패했습니다. Firestore 사례는 유지됩니다." });
    } finally {
      setRunningAction("");
    }
  };

  const noticeStyle =
    notice.tone === "success"
      ? "border-[#BFEBDC] bg-[#F0FBF7] text-[#08754B]"
      : notice.tone === "loading"
      ? "border-[#C8D8FF] bg-[#EEF4FF] text-[#3154A3]"
      : notice.tone === "warning"
      ? "border-[#F6D99A] bg-[#FFF9EC] text-[#9A5A00]"
      : "border-[#F6D8D8] bg-[#FFF7F7] text-[#B42318]";

  return (
    <section aria-labelledby="infection-sheet-sync-title" className="rounded-[12px] border border-[#DDEAE7] bg-[#F8FAFA] p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="infection-sheet-sync-title" className="text-[16px] font-semibold text-[#102047]">
              Google Sheet 동기화
            </h2>
            <span className="rounded-[8px] border border-[#DDEAE7] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#627083]">
              보조 관리 도구
            </span>
          </div>
          <p className="mt-1 text-xs font-medium leading-5 text-[#627083]">
            Firestore 사례를 원본으로 현황판 반영 상태를 점검합니다. 기존 무관리 행은 수정하지 않습니다.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleDryRun}
            disabled={Boolean(runningAction)}
            className="min-h-10 rounded-[9px] border border-[#C8D8FF] bg-white px-3 py-2 text-xs font-semibold text-[#0D4EA6] transition hover:border-[#0D4EA6] focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {runningAction === "dry-run" ? "점검 중..." : "시트 동기화 점검"}
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            className="min-h-10 rounded-[9px] bg-[#0D4EA6] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#183B8F] focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/20 disabled:cursor-not-allowed disabled:bg-[#AAB4C2]"
          >
            {runningAction === "apply" ? "실행 중..." : "시트 동기화 실행"}
          </button>
        </div>
      </div>

      {notice.message && (
        <p aria-live="polite" className={`mt-3 rounded-[8px] border px-3 py-2 text-sm font-semibold ${noticeStyle}`}>
          {notice.message}
        </p>
      )}

      {dryRunResult && <SheetSyncMetrics items={DRY_RUN_METRICS} result={dryRunResult} />}

      {applyResult && (
        <div className="mt-3 border-t border-[#DDEAE7] pt-3">
          <p className="text-xs font-semibold text-[#627083]">최근 실행 결과</p>
          <SheetSyncMetrics items={APPLY_METRICS} result={applyResult} />
        </div>
      )}
    </section>
  );
}

function FirebaseAdminInfectionsContent({ user, displayName }) {
  const [cases, setCases] = useState([]);
  const [loadState, setLoadState] = useState({ status: "idle", message: "" });
  const [actionState, setActionState] = useState({ status: "idle", message: "" });
  const [pendingAction, setPendingAction] = useState("");
  const [includeClosed, setIncludeClosed] = useState(false);
  const [caseStatus, setCaseStatus] = useState(ALL_CASE_STATUS);
  const [grade, setGrade] = useState("");
  const [classNo, setClassNo] = useState("");
  const [searchText, setSearchText] = useState("");

  const summary = useMemo(() => getCaseStatusSummary(cases), [cases]);
  const visibleCases = useMemo(
    () => filterCases(cases, { caseStatus, grade, classNo, searchText }),
    [caseStatus, cases, classNo, grade, searchText]
  );

  const loadCases = async () => {
    setLoadState({ status: "loading", message: "" });

    try {
      const nextCases = await getInfectionCases({ includeClosed });
      setCases(nextCases);
      setLoadState({ status: nextCases.length ? "success" : "empty", message: "" });
    } catch (error) {
      const needsIndex = error?.message?.includes("requires an index");
      setCases([]);
      setLoadState({
        status: error?.code === "permission-denied" ? "permission-denied" : "error",
        message:
          error?.code === "permission-denied"
            ? "감염병 사례관리 권한을 확인해 주세요."
            : needsIndex
            ? "감염병 사례 조회에 필요한 Firestore index를 확인해 주세요."
            : "감염병 사례를 불러오지 못했습니다.",
      });
    }
  };

  useEffect(() => {
    loadCases();
  }, [includeClosed]);

  const handleReview = async (caseId) => {
    setPendingAction(caseId);
    setActionState({ status: "loading", message: "접수 상태를 저장하는 중입니다." });

    try {
      await markInfectionSubmissionReviewed({ caseId, reviewerUid: user.uid });
      await loadCases();
      setActionState({ status: "success", message: "접수 상태를 확인완료로 변경했습니다." });
    } catch (error) {
      setActionState({
        status: "error",
        message: error?.code === "permission-denied" ? "감염병 사례관리 권한을 확인해 주세요." : "접수 상태를 저장하지 못했습니다.",
      });
    } finally {
      setPendingAction("");
    }
  };

  const handleCaseStatusChange = async (caseId, nextStatus) => {
    if (nextStatus === INFECTION_CASE_STATUS.closed && !window.confirm("종결 처리하시겠습니까?")) return;

    setPendingAction(caseId);
    setActionState({ status: "loading", message: "사례 상태를 저장하는 중입니다." });

    try {
      await updateInfectionCaseStatus({ caseId, caseStatus: nextStatus, reviewerUid: user.uid });
      await loadCases();
      setActionState({ status: "success", message: "사례 상태가 변경되었습니다." });
    } catch (error) {
      setActionState({
        status: "error",
        message: error?.code === "permission-denied" ? "감염병 사례관리 권한을 확인해 주세요." : "사례 상태를 저장하지 못했습니다.",
      });
    } finally {
      setPendingAction("");
    }
  };

  return (
    <FirebaseV2PageShell
      label="보건교사"
      title="감염병 사례관리"
      description={`${CURRENT_SCHOOL_YEAR}학년도 ${CURRENT_SEMESTER}학기 감염병 보고를 사례 상태 중심으로 관리합니다.`}
      displayName={displayName}
    >
      <SummaryRow items={summary} />

      <section className="rounded-[12px] border border-[#DDEAE7] bg-white p-3 shadow-[var(--shh-soft-shadow)]">
        <InfectionCaseFilters
          caseStatus={caseStatus}
          classNo={classNo}
          grade={grade}
          includeClosed={includeClosed}
          searchText={searchText}
          onCaseStatusChange={setCaseStatus}
          onClassNoChange={setClassNo}
          onGradeChange={setGrade}
          onIncludeClosedChange={setIncludeClosed}
          onSearchTextChange={setSearchText}
        />

        {actionState.message && (
          <p
            className={`mt-3 rounded-[8px] border px-3 py-2 text-sm font-semibold ${
              actionState.status === "success"
                ? "border-[#BFEBDC] bg-[#F0FBF7] text-[#08754B]"
                : actionState.status === "loading"
                ? "border-[#C8D8FF] bg-[#EEF4FF] text-[#3154A3]"
                : "border-[#F6D8D8] bg-[#FFF7F7] text-[#B42318]"
            }`}
          >
            {actionState.message}
          </p>
        )}
      </section>

      <section className="space-y-3">
        {loadState.status === "success" && visibleCases.length === 0 && (
          <FirebaseContentState status="empty" emptyMessage="현재 조건에 맞는 감염병 사례가 없습니다." />
        )}

        {loadState.status === "success" &&
          visibleCases.map((infectionCase) => (
            <InfectionCaseCard
              key={infectionCase.id}
              infectionCase={infectionCase}
              pendingAction={pendingAction}
              onCaseStatusChange={handleCaseStatusChange}
              onReview={handleReview}
            />
          ))}

        {loadState.status !== "success" && (
          <FirebaseContentState
            status={loadState.status}
            message={loadState.message}
            emptyMessage={includeClosed ? "등록된 감염병 사례가 없습니다." : "현재 관리 중인 감염병 사례가 없습니다."}
          />
        )}
      </section>

      <InfectionSheetSyncPanel user={user} />

      <div className="flex flex-wrap gap-2">
        <Link
          to="/firebase-admin/submissions?tab=infection"
          className="inline-flex min-h-10 items-center rounded-[9px] border border-[#DDEAE7] bg-white px-3 py-2 text-xs font-semibold text-[#102047] transition hover:border-[#20A982] focus:outline-none focus:ring-4 focus:ring-[#20A982]/15"
        >
          기존 제출관리 tab
        </Link>
        <Link
          to="/firebase-dashboard"
          className="inline-flex min-h-10 items-center rounded-[9px] border border-[#DDEAE7] bg-white px-3 py-2 text-xs font-semibold text-[#102047] transition hover:border-[#20A982] focus:outline-none focus:ring-4 focus:ring-[#20A982]/15"
        >
          대시보드로
        </Link>
      </div>
    </FirebaseV2PageShell>
  );
}

export default function FirebaseAdminInfectionsPage() {
  return (
    <FirebaseV2AccessGate>
      {({ user, displayName }) => <FirebaseAdminInfectionsContent user={user} displayName={displayName} />}
    </FirebaseV2AccessGate>
  );
}
