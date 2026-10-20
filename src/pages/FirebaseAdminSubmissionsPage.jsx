import { tbReviewHref, tbReviewContext, staffWorkHref, withAdminReturn, adminReturnHref } from "../lib/submissionNavigation.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import FirebaseV2AccessGate from "../components/FirebaseV2AccessGate.jsx";
import { AdminWorkspaceLayout } from "../components/AdminWorkspaceLayout.jsx";
import HealthScreeningTypeAdminPanel from "../components/HealthScreeningTypeAdminPanel.jsx";
import { isHealthScreeningTypeEnabledHost } from "../lib/healthScreeningTypes.js";
import AdminProxySubmissionDialog from "../components/AdminProxySubmissionDialog.jsx";
import { getAdminSubmissionFileUrl } from "../lib/adminSubmissionFiles.js";
import {
  INFECTION_STATUS_LABELS,
  INFECTION_STATUS_OPTIONS,
  STAFF_STATUS_LABELS,
  STAFF_STATUS_OPTIONS,
  getInfectionReports,
  getStaffSubmissionPage,
  updateInfectionReportStatus,
  updateStaffSubmissionStatus,
} from "../lib/adminSubmissions.js";

const VALID_TABS = new Set(["staff", "infection"]);
const VALID_STATUS = new Set(["submitted", "reviewing", "completed", "rejected"]);

function getInitialTab(value) {
  return VALID_TABS.has(value) ? value : "staff";
}

function getInitialStatus(value) {
  return VALID_STATUS.has(value) ? value : "";
}

function StateMessage({ state, emptyMessage }) {
  if (state.status === "loading") {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-40 animate-pulse rounded-[26px] border border-[#DDEAE7] bg-white/80" />
        ))}
      </div>
    );
  }

  if (state.status === "permission-denied" || state.status === "error") {
    return (
      <p className="rounded-[26px] border border-[#F6D8D8] bg-[#FFF7F7] p-5 text-sm font-semibold text-[#B42318]">
        {state.message}
      </p>
    );
  }

  if (state.status === "empty") {
    return (
      <p className="rounded-[26px] border border-[#DDEAE7] bg-[#F7FBF9] p-5 text-sm font-semibold text-[#627083]">
        {emptyMessage}
      </p>
    );
  }

  return null;
}

function StatusPill({ status, labels }) {
  const tone =
    status === "completed"
      ? "bg-[#F0FBF7] text-[#08754B]"
      : status === "rejected"
      ? "bg-[#FFF7F7] text-[#B42318]"
      : "bg-[#EEF4FF] text-[#3154A3]";

  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{labels[status] || status}</span>;
}

function StatusButtons({ currentStatus, options, labels, pending, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options
        .filter((status) => status !== "submitted")
        .map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => onChange(status)}
            disabled={pending || currentStatus === status}
            className="min-h-10 rounded-2xl border border-[#DDEAE7] bg-white px-4 py-2 text-xs font-semibold text-[#102047] transition hover:-translate-y-[1px] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {labels[status]}
          </button>
        ))}
    </div>
  );
}

function DetailRow({ label, value }) {
  if (!value) return null;

  return (
    <div>
      <dt className="text-xs font-semibold text-[#102047]">{label}</dt>
      <dd className="mt-1 break-keep text-sm font-medium leading-6 text-[#627083]">{value}</dd>
    </div>
  );
}

function StaffSubmissionCard({ item, pendingId, onStatusChange, onRefresh }) {
  const [inlineReview, setInlineReview] = useState(false);
  const [fileState, setFileState] = useState({ pending: -1, message: "" });
  const reviewHref = tbReviewHref(item);
  const reviewContext = reviewHref ? tbReviewContext(new URL(reviewHref, "https://navigation.invalid").searchParams) : null;
  const workHref = staffWorkHref(item);
  const [params] = useSearchParams();
  const returnTo = adminReturnHref(params.get("returnTo"));
  const submitterName = item.submitter?.displayName || "제출자";
  const submitterEmail = item.submitter?.email || "";
  const isUpdating = pendingId === item.id;
  const evidenceFiles = item.evidenceFiles || [];

  const openFile = async (fileIndex) => {
    const preview = window.open("", "_blank");
    if (!preview) {
      setFileState({ pending: -1, message: "팝업이 차단되었습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도해 주세요." });
      return;
    }
    preview.opener = null;
    preview.document.title = "첨부파일 여는 중";
    preview.document.body.textContent = "첨부파일을 확인하고 있습니다.";
    setFileState({ pending: fileIndex, message: "" });
    try {
      const file = await getAdminSubmissionFileUrl(item.id, fileIndex);
      preview.location.replace(file.url);
      setFileState({ pending: -1, message: "" });
    } catch (error) {
      preview.close();
      setFileState({ pending: -1, message: error?.message || "첨부파일을 열지 못했습니다." });
    }
  };

  return (
    <article className="rounded-[28px] border border-[#DDEAE7] bg-white/95 p-5 shadow-[0_18px_48px_rgba(16,32,71,0.06)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#F0FBF7] px-3 py-1 text-xs font-semibold text-[#08754B]">
              {item.typeLabel}
            </span>
            <StatusPill status={item.status} labels={STAFF_STATUS_LABELS} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-[#102047]">{submitterName}</h2>
          {item.submissionMode === "admin_proxy" && <p className="mt-1 text-sm font-semibold text-[#3154A3]">관리자 대리등록 · 등록자 {item.submittedByName || "관리자"}</p>}
          {submitterEmail && <p className="mt-1 break-all text-sm font-bold text-[#627083]">{submitterEmail}</p>}
          <p className="mt-2 text-xs font-bold text-[#8A96A8]">제출일시 {item.submittedAtLabel}</p>
        </div>
        {evidenceFiles.length ? (
          <div className="flex max-w-full shrink-0 flex-wrap justify-end gap-2 sm:max-w-[50%]">
            {evidenceFiles.map((file, index) => (
              <button
                key={file.fileId}
                type="button"
                disabled={fileState.pending >= 0}
                onClick={() => openFile(index)}
                title={file.fileName}
                className="inline-flex min-h-10 max-w-full items-center justify-center rounded-2xl bg-[#20A982] px-4 py-2 text-xs font-semibold text-white shadow-[0_12px_28px_rgba(32,169,130,0.18)] transition hover:-translate-y-[1px] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:cursor-wait disabled:opacity-60"
              >
                <span className="max-w-48 truncate">{evidenceFiles.length > 1 ? `파일 ${index + 1} 보기` : "파일 보기"}</span>
              </button>
            ))}
          </div>
        ) : (
          <span className="inline-flex min-h-10 shrink-0 items-center rounded-2xl bg-[#F7FBF9] px-4 py-2 text-xs font-semibold text-[#8A96A8]">
            첨부파일 없음
          </span>
        )}
      </div>
      {fileState.message && <p role="alert" className="mt-3 rounded-2xl bg-[#FFF7F7] px-4 py-3 text-sm font-semibold text-[#B42318]">{fileState.message}</p>}

      <dl className="mt-5 grid gap-4 rounded-[24px] bg-[#F7FBF9] p-4 sm:grid-cols-3">
        {item.itemId === "cpr" && (
          <>
            <DetailRow label="이수일자" value={item.trainingDate} />
            <DetailRow label="이수기관" value={item.institution} />
          </>
        )}
        {item.itemId === "tb" && (
          <>
            <DetailRow label="검진일자" value={item.checkupDate} />
            <DetailRow label="제출자료유형" value={item.documentType} />
          </>
        )}
        {item.itemId === "recruit" && (
          <DetailRow
            label="확인 요청"
            value={item.confirmations?.submittedToAdminOffice ? "행정실 제출 확인 요청" : "확인 정보 없음"}
          />
        )}
        <DetailRow label="교직원 구분" value={item.staffType} />
        {item.submissionMode === "admin_proxy" && <DetailRow label="등록 메모" value={item.proxyNote} />}
      </dl>

      <nav aria-label="접수자료 업무 연결" className="mt-4 flex flex-wrap gap-3 text-sm text-[#0D4EA6]">
        {returnTo && <Link className="min-h-11 py-3" to={returnTo}>이전 현황으로 돌아가기</Link>}
        {workHref && <Link className="min-h-11 py-3" to={withAdminReturn(workHref, `/firebase-admin/submissions?tab=staff&submissionId=${encodeURIComponent(item.id)}`)}>이 교직원 업무현황</Link>}
        {item.itemId === "cpr" && <Link className="min-h-11 py-3" to="/firebase-admin/trainings?mode=manual-cpr-2026">학교 단체교육 일괄 등록</Link>}
        {reviewContext && isHealthScreeningTypeEnabledHost(globalThis.location?.hostname) && <button type="button" aria-expanded={inlineReview} className="min-h-11 rounded-lg border px-3" onClick={()=>setInlineReview(value=>!value)}>이 화면에서 검진 확인</button>}
      </nav>
      {inlineReview && reviewContext && <HealthScreeningTypeAdminPanel initialSchoolYear={reviewContext.schoolYear} reviewContext={reviewContext} onChange={()=>onRefresh(item.id)} />}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-bold text-[#8A96A8]">
          {item.itemId === "tb" && item.schoolYear
            ? "결핵검진 완료 처리는 연도별 검진 확인에서 진행합니다."
            : isUpdating ? "상태를 저장하는 중입니다." : "처리 상태 변경"}
        </p>
        {item.itemId === "tb" && tbReviewHref(item) && <Link className="min-h-10 rounded-lg border px-3 py-2 text-sm text-[#0D4EA6]" to={tbReviewHref(item)}>이 접수의 검진 확인</Link>}
        {!(item.itemId === "tb" && item.schoolYear) && <StatusButtons
          currentStatus={item.status}
          labels={STAFF_STATUS_LABELS}
          options={STAFF_STATUS_OPTIONS}
          pending={isUpdating}
          onChange={(status) => onStatusChange(item.id, status)}
        />}
      </div>
    </article>
  );
}

function InfectionReportCard({ report, pendingId, onStatusChange }) {
  const student = report.student || {};
  const infection = report.infection || {};
  const isUpdating = pendingId === report.id;

  return (
    <article className="rounded-[28px] border border-[#DDEAE7] bg-white/95 p-5 shadow-[0_18px_48px_rgba(16,32,71,0.06)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#FFF7F7] px-3 py-1 text-xs font-semibold text-[#B42318]">
              감염병 발생 보고
            </span>
            <StatusPill status={report.status} labels={INFECTION_STATUS_LABELS} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-[#102047]">
            {student.grade || "-"}학년 {student.classNo || "-"}반 {student.number || "-"}번 {student.name || "-"}
          </h2>
          <p className="mt-2 text-xs font-bold text-[#8A96A8]">제출일시 {report.submittedAtLabel}</p>
        </div>
      </div>

      <details className="mt-5 rounded-[24px] bg-[#F7FBF9] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[#102047] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20">
          상세 정보 보기
        </summary>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <DetailRow label="감염병명" value={infection.diseaseName} />
          <DetailRow label="진단일" value={infection.diagnosisDate} />
          <DetailRow label="등교중지 시작일" value={infection.exclusionStartDate} />
          <DetailRow label="등교중지 종료일" value={infection.exclusionEndDate} />
          <DetailRow label="비고" value={report.report?.note} />
        </dl>
      </details>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-bold text-[#8A96A8]">
          {isUpdating ? "상태를 저장하는 중입니다." : "감염병 보고 처리 상태"}
        </p>
        <StatusButtons
          currentStatus={report.status}
          labels={INFECTION_STATUS_LABELS}
          options={INFECTION_STATUS_OPTIONS}
          pending={isUpdating}
          onChange={(status) => onStatusChange(report.id, status)}
        />
      </div>
    </article>
  );
}

function FilterButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-10 rounded-2xl px-4 py-2 text-xs font-semibold transition focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 ${
        active ? "bg-[#20A982] text-white shadow-[0_10px_24px_rgba(32,169,130,0.18)]" : "bg-white text-[#627083]"
      }`}
    >
      {children}
    </button>
  );
}

function FirebaseAdminSubmissionsContent({ displayName }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => getInitialTab(searchParams.get("tab")));
  const [statusFilter, setStatusFilter] = useState(() => getInitialStatus(searchParams.get("status")));
  const [staffItems, setStaffItems] = useState([]);
  const [infectionReports, setInfectionReports] = useState([]);
  const [loadState, setLoadState] = useState({ status: "idle", message: "" });
  const [actionState, setActionState] = useState({ status: "idle", message: "" });
  const [pendingId, setPendingId] = useState("");
  const [proxyOpen, setProxyOpen] = useState(false);
  const [pageInfo, setPageInfo] = useState({ total: 0, nextCursor: null });
  const loadVersion = useRef(0);
  const submissionId = searchParams.get("submissionId") || "";

  const visibleStatusOptions = useMemo(() => {
    return activeTab === "staff" ? STAFF_STATUS_OPTIONS : INFECTION_STATUS_OPTIONS;
  }, [activeTab]);

  useEffect(() => {
    const nextTab = getInitialTab(searchParams.get("tab"));
    const nextStatus = getInitialStatus(searchParams.get("status"));
    setActiveTab(nextTab);
    setStatusFilter(nextStatus && (nextTab === "staff" || nextStatus !== "rejected") ? nextStatus : "");
  }, [searchParams]);

  const changeStatusFilter = (status) => {
    const params = new URLSearchParams(searchParams);
    if (status) params.set("status", status); else params.delete("status");
    setSearchParams(params, { replace: true });
  };

  const loadItems = async (cursor = null) => {
    const version = ++loadVersion.current;
    setLoadState({ status: "loading", message: "" });
    setActionState({ status: "idle", message: "" });

    try {
      if (activeTab === "staff") {
        const result = await getStaffSubmissionPage({ status: statusFilter, cursor, submissionId });
        if (version !== loadVersion.current) return;
        const nextStaffItems = result.items;
        setPageInfo(result);
        setStaffItems(nextStaffItems);
        setInfectionReports([]);
        setLoadState({ status: nextStaffItems.length ? "success" : "empty", message: "" });
        return;
      }

      const nextReports = await getInfectionReports({ status: statusFilter });
      if (version !== loadVersion.current) return;
      setInfectionReports(nextReports);
      setStaffItems([]);
      setLoadState({ status: nextReports.length ? "success" : "empty", message: "" });
    } catch (error) {
      if (version !== loadVersion.current) return;
      const isPermissionDenied = error?.code === "permission-denied";
      const needsIndex = error?.message?.includes("requires an index");
      setStaffItems([]);
      setInfectionReports([]);
      setLoadState({
        status: isPermissionDenied ? "permission-denied" : "error",
        message: isPermissionDenied
          ? "관리자 권한을 확인해 주세요."
          : needsIndex
          ? "Firestore index 설정이 필요합니다. 콘솔의 index 안내를 확인해 주세요."
          : "데이터를 불러오지 못했습니다.",
      });
    }
  };

  useEffect(() => {
    loadItems();
    return () => { loadVersion.current++; };
  }, [activeTab, statusFilter, submissionId]);

  const handleTabChange = (tab) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab);
    params.delete("submissionId");
    if (tab === "infection" && statusFilter === "rejected") params.delete("status");
    setSearchParams(params);
  };

  const refreshStaffReceipt = async (receiptId) => {
    const version = loadVersion.current;
    try {
      const result = await getStaffSubmissionPage({submissionId:receiptId});
      if (version !== loadVersion.current) return;
      const updated = result.items?.find(item=>item.id === receiptId);
      if (updated) setStaffItems(current=>current.map(item=>item.id === receiptId ? updated : item));
      else setActionState({status:"error",message:"검진 처리는 저장됐으나 접수자료를 다시 확인하지 못했습니다. 새로고침해 주세요."});
    } catch {
      if (version === loadVersion.current) setActionState({status:"error",message:"검진 처리는 저장됐으나 접수 상태 조회가 실패했습니다. 다시 확인해 주세요."});
    }
  };

  const handleStaffStatusChange = async (submissionId, status) => {
    setPendingId(submissionId);
    setActionState({ status: "loading", message: "상태를 저장하는 중입니다." });
    try {
      const submission = staffItems.find((item) => item.id === submissionId);
      await updateStaffSubmissionStatus(submission || submissionId, status);
      await loadItems();
      setActionState({ status: "success", message: "제출 상태가 변경되었습니다." });
    } catch (error) {
      setActionState({
        status: "error",
        message: error?.code === "permission-denied" ? "관리자 권한을 확인해 주세요." : "상태를 변경하지 못했습니다.",
      });
    } finally {
      setPendingId("");
    }
  };

  const handleInfectionStatusChange = async (submissionId, status) => {
    setPendingId(submissionId);
    setActionState({ status: "loading", message: "상태를 저장하는 중입니다." });
    try {
      await updateInfectionReportStatus(submissionId, status);
      await loadItems();
      setActionState({ status: "success", message: "감염병 보고 상태가 변경되었습니다." });
    } catch (error) {
      setActionState({
        status: "error",
        message: error?.code === "permission-denied" ? "관리자 권한을 확인해 주세요." : "상태를 변경하지 못했습니다.",
      });
    } finally {
      setPendingId("");
    }
  };

  const emptyMessage = activeTab === "staff" ? "해당 조건의 제출 내역이 없습니다." : "해당 조건의 감염병 보고가 없습니다.";

  return (
    <AdminWorkspaceLayout
      label="관리자"
      title="제출·보고 관리"
      description="교직원 제출과 감염병 보고를 탭으로 구분해 확인하고 처리 상태를 관리합니다."
      displayName={displayName}
    >
      <section className="rounded-[30px] border border-[#DDEAE7] bg-white/95 p-5 shadow-[0_18px_48px_rgba(16,32,71,0.07)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex rounded-[22px] bg-[#F7FBF9] p-1">
            <button
              type="button"
              onClick={() => handleTabChange("staff")}
              className={`min-h-11 flex-1 rounded-[18px] px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 ${
                activeTab === "staff" ? "bg-white text-[#102047] shadow-[0_8px_20px_rgba(16,32,71,0.08)]" : "text-[#627083]"
              }`}
            >
              교직원 제출
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("infection")}
              className={`min-h-11 flex-1 rounded-[18px] px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 ${
                activeTab === "infection" ? "bg-white text-[#102047] shadow-[0_8px_20px_rgba(16,32,71,0.08)]" : "text-[#627083]"
              }`}
            >
              감염병 보고
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {activeTab === "staff" && <button type="button" onClick={() => setProxyOpen(true)} className="min-h-10 rounded-2xl bg-[#0D4EA6] px-4 py-2 text-xs font-semibold text-white">대리등록</button>}
            <FilterButton active={!statusFilter} onClick={() => changeStatusFilter("")}>
              전체
            </FilterButton>
            {visibleStatusOptions.map((status) => (
              <FilterButton key={status} active={statusFilter === status} onClick={() => changeStatusFilter(status)}>
                {(activeTab === "staff" ? STAFF_STATUS_LABELS : INFECTION_STATUS_LABELS)[status]}
              </FilterButton>
            ))}
          </div>
        </div>

        {actionState.message && (
          <p
            className={`mt-4 rounded-2xl px-4 py-3 text-sm font-semibold ${
              actionState.status === "success"
                ? "bg-[#F0FBF7] text-[#08754B]"
                : actionState.status === "loading"
                ? "bg-[#EEF4FF] text-[#3154A3]"
                : "bg-[#FFF7F7] text-[#B42318]"
            }`}
          >
            {actionState.message}
          </p>
        )}
      </section>

      {activeTab === "staff" ? <div className="flex flex-wrap gap-3 text-sm">
        <p>{submissionId ? "접수번호 직접 조회" : `선택 조건 접수 총 ${pageInfo.total}건 · 현재 페이지 ${staffItems.length}건 · 페이지당 50건`}</p>
        {submissionId && <Link to="/firebase-admin/submissions">목록으로</Link>}
        {!submissionId && <><button disabled={loadState.status === "loading"} onClick={() => loadItems()}>처음 페이지</button><button disabled={!pageInfo.nextCursor || loadState.status === "loading"} onClick={() => loadItems(pageInfo.nextCursor)}>다음 50건</button></>}
      </div> : <p className="text-sm">감염병 탭은 최대 50건 범위의 조회입니다. 전체 사례는 감염병 사례관리를 이용하세요.</p>}
      <AdminProxySubmissionDialog open={proxyOpen} onClose={() => setProxyOpen(false)} onSaved={loadItems} />

      <section className="space-y-4">
        {loadState.status === "success" && activeTab === "staff" && (
          <>
            {staffItems.map((item) => (
              <StaffSubmissionCard
                key={item.id}
                item={item}
                pendingId={pendingId}
                onStatusChange={handleStaffStatusChange}
                onRefresh={refreshStaffReceipt}
              />
            ))}
          </>
        )}

        {loadState.status === "success" && activeTab === "infection" && (
          <>
            {infectionReports.map((report) => (
              <InfectionReportCard
                key={report.id}
                report={report}
                pendingId={pendingId}
                onStatusChange={handleInfectionStatusChange}
              />
            ))}
          </>
        )}

        {loadState.status !== "success" && <StateMessage state={loadState} emptyMessage={emptyMessage} />}
      </section>

      <Link
        to="/firebase-dashboard"
        className="inline-flex min-h-11 items-center rounded-2xl border border-[#DDEAE7] bg-white px-4 py-2 text-sm font-semibold text-[#102047] transition hover:-translate-y-[1px] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20"
      >
        대시보드로 돌아가기
      </Link>
    </AdminWorkspaceLayout>
  );
}

export default function FirebaseAdminSubmissionsPage() {
  return (
    <FirebaseV2AccessGate>
      {({ displayName }) => <FirebaseAdminSubmissionsContent displayName={displayName} />}
    </FirebaseV2AccessGate>
  );
}
