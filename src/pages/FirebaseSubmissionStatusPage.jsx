import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import FirebaseV2AccessGate from "../components/FirebaseV2AccessGate.jsx";
import { FirebaseV2PageShell } from "../components/FirebaseV2PageShell.jsx";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import {
  STATUS_FILTER_LABELS,
  STATUS_FILTERS,
  STATUS_ITEM_IDS,
  filterSubmissionRoster,
  getSubmissionStatusOverview,
} from "../lib/submissionStatus.js";

const ITEM_LABELS = {
  cpr: "심폐소생술 이수증",
  tb: "결핵검진 확인증",
  recruit: "채용검진 확인 요청",
};

function getInitialItem(value) {
  return STATUS_ITEM_IDS.includes(value) ? value : "cpr";
}

function getInitialFilter(value) {
  return STATUS_FILTERS.includes(value) ? value : "all";
}

function StatusPill({ status, children }) {
  const tone =
    status === "completed"
      ? "bg-[#F0FBF7] text-[#08754B]"
      : status === "rejected"
      ? "bg-[#FFF7F7] text-[#B42318]"
      : status === "missing"
      ? "bg-[#FFF8E8] text-[#9A5B00]"
      : "bg-[#EEF4FF] text-[#3154A3]";

  return <span className={`rounded-full px-3 py-1 text-xs font-black ${tone}`}>{children}</span>;
}

function StateMessage({ state }) {
  if (state.status === "loading") {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-28 animate-pulse rounded-[24px] border border-[#DDEAE7] bg-white/80" />
        ))}
      </div>
    );
  }

  if (state.status === "error" || state.status === "permission-denied") {
    return (
      <p className="rounded-[26px] border border-[#F6D8D8] bg-[#FFF7F7] p-5 text-sm font-black text-[#B42318]">
        {state.message}
      </p>
    );
  }

  if (state.status === "empty") {
    return (
      <p className="rounded-[26px] border border-[#DDEAE7] bg-white/95 p-5 text-sm font-black text-[#627083]">
        현재 등록된 교직원이 없습니다.
      </p>
    );
  }

  return null;
}

function SummaryCard({ label, value, tone = "text-[#102047]" }) {
  return (
    <article className="rounded-[22px] border border-[#DDEAE7] bg-[#FAFDFC] px-4 py-3">
      <p className="text-xs font-black text-[#627083]">{label}</p>
      <p className={`mt-1 text-2xl font-black ${tone}`}>{value}</p>
    </article>
  );
}

function RosterRow({ row, selectedItem }) {
  const adminStatus = row.status === "missing" ? "submitted" : row.status;
  const adminHref = `/firebase-admin/submissions?tab=staff&status=${adminStatus}`;

  return (
    <article
      className={`rounded-[24px] border p-4 shadow-[0_12px_30px_rgba(16,32,71,0.04)] ${
        row.status === "missing" ? "border-[#F3D8A8] bg-[#FFFDF7]" : "border-[#DDEAE7] bg-white/95"
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={row.status}>{row.statusLabel}</StatusPill>
            <span className="rounded-full bg-[#F7FBF9] px-3 py-1 text-xs font-black text-[#627083]">
              {ITEM_LABELS[selectedItem]}
            </span>
          </div>
          <h2 className="mt-3 break-keep text-base font-black text-[#102047]">{row.displayName}</h2>
          <p className="mt-1 break-all text-xs font-bold text-[#627083]">{row.email || "이메일 없음"}</p>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-3 lg:min-w-[460px]">
          <div>
            <dt className="text-xs font-black text-[#8A96A8]">보직/업무</dt>
            <dd className="mt-1 font-bold text-[#102047]">{row.position || "미등록"}</dd>
          </div>
          <div>
            <dt className="text-xs font-black text-[#8A96A8]">제출일</dt>
            <dd className="mt-1 font-bold text-[#102047]">{row.submittedAtLabel || "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-black text-[#8A96A8]">처리 상태</dt>
            <dd className="mt-1 font-bold text-[#102047]">{row.status === "missing" ? "-" : row.statusLabel}</dd>
          </div>
        </dl>
        {row.status !== "missing" && (
          <Link
            to={adminHref}
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-2xl border border-[#DDEAE7] bg-[#F7FBF9] px-4 py-2 text-xs font-black text-[#102047] transition hover:-translate-y-[1px] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20"
          >
            제출 보기
          </Link>
        )}
      </div>
    </article>
  );
}

function FirebaseSubmissionStatusContent({ displayName }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedItem, setSelectedItem] = useState(() => getInitialItem(searchParams.get("item")));
  const [statusFilter, setStatusFilter] = useState(() => getInitialFilter(searchParams.get("status")));
  const [searchTerm, setSearchTerm] = useState("");
  const [overview, setOverview] = useState(null);
  const [state, setState] = useState({ status: "idle", message: "" });

  useEffect(() => {
    const nextItem = getInitialItem(searchParams.get("item"));
    const nextStatus = getInitialFilter(searchParams.get("status"));
    setSelectedItem(nextItem);
    setStatusFilter(nextStatus);
  }, [searchParams]);

  useEffect(() => {
    const params = { item: selectedItem };
    if (statusFilter !== "all") params.status = statusFilter;
    setSearchParams(params, { replace: true });
  }, [selectedItem, setSearchParams, statusFilter]);

  useEffect(() => {
    let shouldIgnore = false;

    async function loadOverview() {
      setState({ status: "loading", message: "" });
      try {
        const nextOverview = await getSubmissionStatusOverview(selectedItem, CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER);
        if (shouldIgnore) return;
        setOverview(nextOverview);
        setState({ status: nextOverview.roster.length ? "success" : "empty", message: "" });
      } catch (error) {
        if (shouldIgnore) return;
        setOverview(null);
        setState({
          status: error?.code === "permission-denied" ? "permission-denied" : "error",
          message:
            error?.code === "permission-denied"
              ? "관리자 권한을 확인해 주세요."
              : error?.message?.includes("requires an index")
              ? "Firestore index 설정이 필요합니다. 콘솔의 index 안내를 확인해 주세요."
              : "데이터를 불러오지 못했습니다.",
        });
      }
    }

    loadOverview();
    return () => {
      shouldIgnore = true;
    };
  }, [selectedItem]);

  const visibleRoster = useMemo(() => {
    return overview ? filterSubmissionRoster(overview.roster, statusFilter, searchTerm) : [];
  }, [overview, searchTerm, statusFilter]);

  return (
    <FirebaseV2PageShell
      label="Firebase Admin"
      title="교직원 제출 현황"
      description="현재 학기 대상자 명단과 실제 제출 기록을 비교해 미제출자를 확인합니다."
      displayName={displayName}
    >
      <section className="rounded-[30px] border border-[#DDEAE7] bg-white/95 p-5 shadow-[0_18px_48px_rgba(16,32,71,0.07)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-3 sm:grid-cols-3">
            {STATUS_ITEM_IDS.map((itemId) => (
              <button
                key={itemId}
                type="button"
                onClick={() => setSelectedItem(itemId)}
                className={`min-h-12 rounded-2xl px-4 py-3 text-sm font-black transition focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 ${
                  selectedItem === itemId
                    ? "bg-[#20A982] text-white shadow-[0_12px_28px_rgba(32,169,130,0.18)]"
                    : "border border-[#DDEAE7] bg-[#F7FBF9] text-[#102047]"
                }`}
              >
                {ITEM_LABELS[itemId]}
              </button>
            ))}
          </div>
          <label className="text-sm font-black text-[#102047] lg:w-72">
            검색
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="이름, 이메일, 보직 검색"
              className="mt-2 min-h-12 w-full rounded-2xl border border-[#DDEAE7] bg-[#F7FBF9] px-4 text-sm font-bold text-[#102047] placeholder:text-[#9AA6B6] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20"
            />
          </label>
        </div>

        {overview?.item && (
          <div className="mt-5 rounded-[24px] bg-[#F7FBF9] p-4">
            <p className="text-sm font-black text-[#102047]">{overview.item.title}</p>
            <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-[#627083]">
              {overview.item.description || overview.item.guideText || "제출 항목 안내가 등록되지 않았습니다."}
            </p>
          </div>
        )}

        {overview?.summary && (
          <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryCard label="전체 대상자" value={overview.summary.total} />
            <SummaryCard label="제출 완료" value={overview.summary.submitted} tone="text-[#20A982]" />
            <SummaryCard label="미제출" value={overview.summary.missing} tone="text-[#9A5B00]" />
            <SummaryCard label="보완 필요" value={overview.summary.rejected} tone="text-[#B42318]" />
            <SummaryCard label="확인 중" value={overview.summary.reviewing} tone="text-[#3154A3]" />
            <SummaryCard label="처리 완료" value={overview.summary.completed} tone="text-[#08754B]" />
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`min-h-10 rounded-2xl px-4 py-2 text-xs font-black transition focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 ${
                statusFilter === filter ? "bg-[#20A982] text-white" : "bg-[#F7FBF9] text-[#627083]"
              }`}
            >
              {STATUS_FILTER_LABELS[filter]}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        {state.status === "success" &&
          visibleRoster.map((row) => <RosterRow key={row.uid} row={row} selectedItem={selectedItem} />)}

        {state.status === "success" && visibleRoster.length === 0 && (
          <p className="rounded-[26px] border border-[#DDEAE7] bg-white/95 p-5 text-sm font-black text-[#627083]">
            {statusFilter === "missing" ? "모든 대상자가 제출했습니다." : "조건에 맞는 교직원이 없습니다."}
          </p>
        )}

        {state.status !== "success" && <StateMessage state={state} />}
      </section>
    </FirebaseV2PageShell>
  );
}

export default function FirebaseSubmissionStatusPage() {
  return (
    <FirebaseV2AccessGate>
      {({ displayName }) => <FirebaseSubmissionStatusContent displayName={displayName} />}
    </FirebaseV2AccessGate>
  );
}
