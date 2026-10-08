import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ALL_CASE_STATUS,
  InfectionCaseCard,
  InfectionCaseFilters,
  SummaryRow,
} from "../components/FirebaseAdminInfectionCases.jsx";
import InfectionStatistics from "../components/InfectionStatistics.jsx";
import FirebaseV2AccessGate from "../components/FirebaseV2AccessGate.jsx";
import { FirebaseContentState, FirebaseV2PageShell } from "../components/FirebaseV2PageShell.jsx";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import {
  getCaseStatusSummary,
  getInfectionCases,
  markInfectionSubmissionReviewed,
  updateInfectionCaseStatus,
} from "../lib/infectionCases.js";
import { filterInfectionCases, getInfectionOverview } from "../lib/infectionCaseAnalytics.js";
import { INFECTION_CASE_STATUS } from "../lib/infectionStatus.js";

function FirebaseAdminInfectionsContent({ user, displayName }) {
  const [cases, setCases] = useState([]);
  const [loadState, setLoadState] = useState({ status: "idle", message: "" });
  const [actionState, setActionState] = useState({ status: "idle", message: "" });
  const [pendingAction, setPendingAction] = useState("");
  const [includeClosed, setIncludeClosed] = useState(false);
  const [caseStatus, setCaseStatus] = useState(ALL_CASE_STATUS);
  const [grade, setGrade] = useState("");
  const [classNo, setClassNo] = useState("");
  const [diseaseName, setDiseaseName] = useState("");
  const [searchText, setSearchText] = useState("");

  const summary = useMemo(() => getCaseStatusSummary(cases), [cases]);
  const overview = useMemo(() => getInfectionOverview(cases), [cases]);
  const visibleCases = useMemo(
    () => filterInfectionCases(cases, { caseStatus, diseaseName, grade, classNo, includeClosed, searchText }),
    [caseStatus, cases, classNo, diseaseName, grade, includeClosed, searchText]
  );

  const loadCases = async () => {
    setLoadState({ status: "loading", message: "" });
    try {
      const nextCases = await getInfectionCases();
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
  }, []);

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
      <InfectionStatistics overview={overview} />
      <SummaryRow items={summary} />

      <section className="rounded-[12px] border border-[#DDEAE7] bg-white p-3 shadow-[var(--shh-soft-shadow)]">
        <InfectionCaseFilters
          caseStatus={caseStatus}
          classNo={classNo}
          diseaseName={diseaseName}
          grade={grade}
          includeClosed={includeClosed}
          searchText={searchText}
          onCaseStatusChange={setCaseStatus}
          onClassNoChange={setClassNo}
          onDiseaseNameChange={setDiseaseName}
          onGradeChange={setGrade}
          onIncludeClosedChange={setIncludeClosed}
          onSearchTextChange={setSearchText}
        />

        {actionState.message && (
          <p role="status" aria-live="polite" className={`mt-3 rounded-[8px] border px-3 py-2 text-sm font-semibold ${
            actionState.status === "success"
              ? "border-[#BFEBDC] bg-[#F0FBF7] text-[#08754B]"
              : actionState.status === "loading"
              ? "border-[#C8D8FF] bg-[#EEF4FF] text-[#3154A3]"
              : "border-[#F6D8D8] bg-[#FFF7F7] text-[#B42318]"
          }`}>
            {actionState.message}
          </p>
        )}
      </section>

      <section className="space-y-3">
        {loadState.status === "success" && visibleCases.length === 0 && (
          <FirebaseContentState status="empty" emptyMessage="현재 조건에 맞는 감염병 사례가 없습니다." />
        )}
        {loadState.status === "success" && visibleCases.map((infectionCase) => (
          <InfectionCaseCard
            key={infectionCase.id}
            infectionCase={infectionCase}
            pendingAction={pendingAction}
            onCaseStatusChange={handleCaseStatusChange}
            onReview={handleReview}
          />
        ))}
        {loadState.status !== "success" && (
          <FirebaseContentState status={loadState.status} message={loadState.message} emptyMessage="등록된 감염병 사례가 없습니다." />
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <Link to="/firebase-admin/submissions?tab=infection" className="inline-flex min-h-10 items-center rounded-[9px] border border-[#DDEAE7] bg-white px-3 py-2 text-xs font-semibold text-[#102047] transition hover:border-[#20A982] focus:outline-none focus:ring-4 focus:ring-[#20A982]/15">
          기존 제출관리 tab
        </Link>
        <Link to="/firebase-dashboard" className="inline-flex min-h-10 items-center rounded-[9px] border border-[#DDEAE7] bg-white px-3 py-2 text-xs font-semibold text-[#102047] transition hover:border-[#20A982] focus:outline-none focus:ring-4 focus:ring-[#20A982]/15">
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
