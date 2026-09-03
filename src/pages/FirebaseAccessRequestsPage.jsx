import { useEffect, useMemo, useState } from "react";
import FirebaseV2AccessGate from "../components/FirebaseV2AccessGate.jsx";
import { FirebaseV2PageShell } from "../components/FirebaseV2PageShell.jsx";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import {
  ACCESS_REQUEST_STATUSES,
  ACCESS_REQUEST_STATUS_LABELS,
  approveAccessRequest,
  getAccessRequests,
  rejectAccessRequest,
} from "../lib/accessRequests.js";

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function StateMessage({ state }) {
  if (state.status === "loading") {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded-[26px] border border-[#DDEAE7] bg-white/80" />
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <p className="rounded-[26px] border border-[#F6D8D8] bg-[#FFF7F7] p-5 text-sm font-black text-[#B42318]">
        {state.message}
      </p>
    );
  }

  return null;
}

function statusClassName(status) {
  if (status === "pending") return "bg-[#FFF9EC] text-[#9A5A00]";
  if (status === "approved") return "bg-[#F0FBF7] text-[#08754B]";
  if (status === "rejected") return "bg-[#FFF7F7] text-[#B42318]";
  return "bg-[#EEF4FF] text-[#3154A3]";
}

function AccessRequestCard({ accessRequest, pendingId, onApprove, onReject }) {
  const isPending = pendingId === accessRequest.id;
  const canReview = accessRequest.status === "pending";
  const applicantName = accessRequest.applicant?.realName || "실명 미입력";
  const department = accessRequest.applicant?.department || "소속 미입력";
  const staffType = accessRequest.applicant?.staffType || "구분 미입력";

  return (
    <article className="rounded-[28px] border border-[#DDEAE7] bg-white/95 p-5 shadow-[0_18px_48px_rgba(16,32,71,0.06)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-black ${statusClassName(accessRequest.status)}`}>
              {ACCESS_REQUEST_STATUS_LABELS[accessRequest.status] || accessRequest.status}
            </span>
            <span className="rounded-full bg-[#EEF4FF] px-3 py-1 text-xs font-black text-[#3154A3]">
              {accessRequest.schoolYear}학년도 {accessRequest.semester}학기
            </span>
          </div>
          <h2 className="mt-4 break-keep text-lg font-black text-[#102047]">{applicantName}</h2>
          {accessRequest.displayName && (
            <p className="mt-1 text-xs font-bold text-[#8A96A8]">Google 표시이름: {accessRequest.displayName}</p>
          )}
          <p className="mt-1 break-all text-sm font-bold text-[#627083]">{accessRequest.email || "이메일 없음"}</p>
          <p className="mt-2 text-sm font-black text-[#08754B]">
            {department} · {staffType}
          </p>
        </div>
        <p className="shrink-0 text-xs font-bold text-[#8A96A8]">신청 {formatDateTime(accessRequest.requestedAt)}</p>
      </div>

      <dl className="mt-5 grid gap-4 rounded-[24px] bg-[#F7FBF9] p-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-black text-[#102047]">소속/부서</dt>
          <dd className="mt-1 text-sm font-medium text-[#627083]">{department}</dd>
        </div>
        <div>
          <dt className="text-xs font-black text-[#102047]">교직원 구분</dt>
          <dd className="mt-1 text-sm font-medium text-[#627083]">{staffType}</dd>
        </div>
        <div>
          <dt className="text-xs font-black text-[#102047]">신청 권한</dt>
          <dd className="mt-1 text-sm font-medium text-[#627083]">교직원</dd>
        </div>
      </dl>

      <dl className="mt-3 grid gap-4 rounded-[24px] bg-[#F7FBF9] p-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-black text-[#102047]">검토일</dt>
          <dd className="mt-1 text-sm font-medium text-[#627083]">{formatDateTime(accessRequest.reviewedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs font-black text-[#102047]">메모</dt>
          <dd className="mt-1 text-sm font-medium text-[#627083]">{accessRequest.reviewNote || "-"}</dd>
        </div>
      </dl>

      {canReview && (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => onReject(accessRequest)}
            disabled={isPending}
            className="min-h-11 rounded-2xl border border-[#F6D8D8] bg-[#FFF7F7] px-4 py-2 text-sm font-black text-[#B42318] transition hover:-translate-y-[1px] focus:outline-none focus:ring-4 focus:ring-[#B42318]/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "처리 중..." : "거절"}
          </button>
          <button
            type="button"
            onClick={() => onApprove(accessRequest)}
            disabled={isPending}
            className="min-h-11 rounded-2xl bg-[#20A982] px-4 py-2 text-sm font-black text-white shadow-[0_12px_28px_rgba(32,169,130,0.18)] transition hover:-translate-y-[1px] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "처리 중..." : "승인"}
          </button>
        </div>
      )}
    </article>
  );
}

function FirebaseAccessRequestsContent({ user, displayName }) {
  const [statusFilter, setStatusFilter] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [loadState, setLoadState] = useState({ status: "idle", message: "" });
  const [actionState, setActionState] = useState({ status: "idle", message: "" });
  const [pendingId, setPendingId] = useState("");

  const summary = useMemo(() => {
    return {
      total: requests.length,
      pending: requests.filter((request) => request.status === "pending").length,
      approved: requests.filter((request) => request.status === "approved").length,
      rejected: requests.filter((request) => request.status === "rejected").length,
    };
  }, [requests]);

  const loadRequests = async () => {
    setLoadState({ status: "loading", message: "" });
    try {
      const nextRequests = await getAccessRequests(statusFilter);
      setRequests(nextRequests);
      setLoadState({ status: "success", message: "" });
    } catch (error) {
      setRequests([]);
      setLoadState({
        status: "error",
        message: error?.message || "권한 신청 목록을 불러오지 못했습니다.",
      });
    }
  };

  useEffect(() => {
    loadRequests();
  }, [statusFilter]);

  const handleApprove = async (accessRequest) => {
    setPendingId(accessRequest.id);
    setActionState({ status: "loading", message: "권한 신청을 승인하는 중입니다." });
    try {
      await approveAccessRequest(accessRequest, user);
      await loadRequests();
      setActionState({ status: "success", message: "권한 신청을 승인했습니다." });
    } catch (error) {
      setActionState({ status: "error", message: error?.message || "권한 신청을 승인하지 못했습니다." });
    } finally {
      setPendingId("");
    }
  };

  const handleReject = async (accessRequest) => {
    setPendingId(accessRequest.id);
    setActionState({ status: "loading", message: "권한 신청을 거절하는 중입니다." });
    try {
      await rejectAccessRequest(accessRequest, user);
      await loadRequests();
      setActionState({ status: "success", message: "권한 신청을 거절했습니다." });
    } catch (error) {
      setActionState({ status: "error", message: error?.message || "권한 신청을 거절하지 못했습니다." });
    } finally {
      setPendingId("");
    }
  };

  return (
    <FirebaseV2PageShell
      label="Firebase Admin"
      title="권한 신청 관리"
      description="등록된 Google 계정의 현재 학기 기본 교직원 권한 신청을 승인하거나 거절합니다."
      displayName={displayName}
    >
      <section className="rounded-[30px] border border-[#DDEAE7] bg-white/95 p-5 shadow-[0_18px_48px_rgba(16,32,71,0.07)] sm:p-6">
        <div className="flex flex-wrap gap-2">
          {ACCESS_REQUEST_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`min-h-10 rounded-2xl px-4 py-2 text-xs font-black transition focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 ${
                statusFilter === status ? "bg-[#20A982] text-white shadow-[0_10px_24px_rgba(32,169,130,0.18)]" : "bg-[#F7FBF9] text-[#627083]"
              }`}
            >
              {ACCESS_REQUEST_STATUS_LABELS[status]}
            </button>
          ))}
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-4">
          {[
            ["현재 표시", summary.total, "#102047"],
            ["대기", summary.pending, "#9A5A00"],
            ["승인", summary.approved, "#08754B"],
            ["거절", summary.rejected, "#B42318"],
          ].map(([label, value, color]) => (
            <div key={label} className="rounded-2xl bg-[#F7FBF9] px-4 py-3">
              <dt className="text-xs font-black text-[#627083]">{label}</dt>
              <dd className="mt-1 text-2xl font-black" style={{ color }}>{value}</dd>
            </div>
          ))}
        </dl>

        {actionState.message && (
          <p className={`mt-4 rounded-2xl px-4 py-3 text-sm font-black ${actionState.status === "error" ? "bg-[#FFF7F7] text-[#B42318]" : "bg-[#F0FBF7] text-[#08754B]"}`}>
            {actionState.message}
          </p>
        )}
      </section>

      <section className="space-y-4">
        {loadState.status === "loading" || loadState.status === "error" ? <StateMessage state={loadState} /> : null}

        {loadState.status === "success" && requests.length === 0 && (
          <p className="rounded-[26px] border border-[#DDEAE7] bg-white/95 p-6 text-center text-sm font-black text-[#627083] shadow-[0_14px_36px_rgba(16,32,71,0.05)]">
            해당 조건의 권한 신청이 없습니다.
          </p>
        )}

        {loadState.status === "success" &&
          requests.map((accessRequest) => (
            <AccessRequestCard
              key={accessRequest.id}
              accessRequest={accessRequest}
              pendingId={pendingId}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
      </section>
    </FirebaseV2PageShell>
  );
}

export default function FirebaseAccessRequestsPage() {
  return (
    <FirebaseV2AccessGate>
      {({ user, displayName }) => <FirebaseAccessRequestsContent user={user} displayName={displayName} />}
    </FirebaseV2AccessGate>
  );
}
