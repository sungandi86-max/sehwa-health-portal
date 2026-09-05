import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import FirebaseStaffSubmissionAccessGate from "../components/FirebaseStaffSubmissionAccessGate.jsx";
import { FirebaseContentState, FirebaseV2PageShell } from "../components/FirebaseV2PageShell.jsx";
import {
  getMyStaffSubmissionStatus,
  getStaffSubmissionStatusEligibility,
} from "../lib/staffSubmissionStatus.js";

const STATUS_TONES = {
  incomplete: "border-[#F3D8A8] bg-[#FFFDF7] text-[#9A5B00]",
  pending: "border-[#C8D8FF] bg-[#EEF4FF] text-[#3154A3]",
  unknown: "border-[#F3D8A8] bg-[#FFF8E8] text-[#9A5B00]",
  completed: "border-[#BFEBDC] bg-[#F0FBF7] text-[#08754B]",
};

function SummaryStat({ label, value, tone = "text-[#102047]" }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 border-r border-[#DDEAE7] px-3 last:border-r-0">
      <p className="text-[12px] font-semibold text-[#627083]">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function SummaryRow({ overview }) {
  return (
    <section className="grid overflow-hidden rounded-[12px] border border-[#DDEAE7] bg-white shadow-[var(--shh-soft-shadow)] sm:grid-cols-3">
      <SummaryStat label="미완료" value={overview?.summary.incomplete || 0} tone="text-[#9A5B00]" />
      <SummaryStat label="확인 필요" value={(overview?.summary.pending || 0) + (overview?.summary.unknown || 0)} tone="text-[#3154A3]" />
      <SummaryStat label="완료" value={overview?.summary.completed || 0} tone="text-[#08754B]" />
    </section>
  );
}

function StatusBadge({ status, label }) {
  const tone = STATUS_TONES[status] || STATUS_TONES.unknown;
  return <span className={`rounded-[8px] border px-2.5 py-1 text-[12px] font-semibold ${tone}`}>{label}</span>;
}

function StatusRow({ item }) {
  return (
    <article className="rounded-[12px] border border-[#DDEAE7] bg-white p-3 shadow-[var(--shh-soft-shadow)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={item.status} label={item.statusLabel} />
            {item.category && (
              <span className="text-[12px] font-semibold text-[#627083]">
                {item.category === "screening" ? "검진" : "연수"}
              </span>
            )}
          </div>
          <h2 className="mt-2 text-[15px] font-semibold leading-5 text-[#102047]">{item.title}</h2>
          {item.description && <p className="mt-1 text-[13px] font-medium leading-5 text-[#627083]">{item.description}</p>}
          {item.status === "unknown" && (
            <p className="mt-1.5 text-[12px] font-medium leading-5 text-[#9A5B00]">
              아직 이 항목의 확인 결과가 준비되지 않았습니다.
            </p>
          )}
        </div>
        {item.action && item.status !== "completed" && (
          <Link
            to={item.action.href}
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-[9px] border border-[#DDEAE7] bg-[#F3F8F6] px-3 py-2 text-[13px] font-semibold text-[#102047] transition hover:border-[#20A982] focus:outline-none focus:ring-4 focus:ring-[#20A982]/15"
          >
            {item.action.label}
          </Link>
        )}
      </div>
    </article>
  );
}

function NoticePanel({ title, description }) {
  return (
    <section className="rounded-[12px] border border-[#DDEAE7] bg-white p-4">
      <h2 className="text-[15px] font-semibold text-[#102047]">{title}</h2>
      <p className="mt-2 text-[13px] font-medium leading-5 text-[#627083]">{description}</p>
    </section>
  );
}

function MySubmissionStatusContent({ assignment, displayName }) {
  const [overview, setOverview] = useState(null);
  const [state, setState] = useState({ status: "idle", message: "" });
  const eligibility = useMemo(() => getStaffSubmissionStatusEligibility(assignment), [assignment]);

  useEffect(() => {
    if (eligibility.status !== "eligible") {
      setOverview(null);
      setState({ status: "idle", message: "" });
      return;
    }

    let shouldIgnore = false;

    async function loadStatus() {
      setState({ status: "loading", message: "" });
      try {
        const nextOverview = await getMyStaffSubmissionStatus(assignment.staffId);
        if (shouldIgnore) return;
        setOverview(nextOverview);
        setState({ status: nextOverview.items.length ? "success" : "empty", message: "" });
      } catch (error) {
        if (shouldIgnore) return;
        setOverview(null);
        setState({
          status: error?.code === "permission-denied" ? "permission-denied" : "error",
          message:
            error?.code === "permission-denied"
              ? "제출·이수 현황을 읽을 수 없습니다. 교직원 정보 연결 상태를 확인해 주세요."
              : "제출·이수 현황을 불러오지 못했습니다.",
        });
      }
    }

    loadStatus();

    return () => {
      shouldIgnore = true;
    };
  }, [assignment, eligibility.status]);

  if (eligibility.status === "needs-staff-id") {
    return (
      <FirebaseV2PageShell
        label="내 현황"
        title="나의 제출·이수 현황"
        description="로그인 계정과 교직원 정보를 연결한 뒤 확인할 수 있습니다."
        displayName={displayName}
      >
        <NoticePanel
          title="교직원 정보 연결이 필요합니다."
          description="제출·이수 현황을 확인하려면 보건실에서 현재 계정의 교직원ID를 연결해야 합니다. 미완료로 임의 표시하지 않습니다."
        />
      </FirebaseV2PageShell>
    );
  }

  if (eligibility.status === "not-target") {
    return (
      <FirebaseV2PageShell
        label="내 현황"
        title="나의 제출·이수 현황"
        description="현재 계정에 표시할 제출·이수 관리 항목을 확인합니다."
        displayName={displayName}
      >
        <NoticePanel title="현재 표시할 항목이 없습니다." description="현재 직책 기준으로 표시할 제출·이수 관리 항목이 없습니다." />
      </FirebaseV2PageShell>
    );
  }

  return (
    <FirebaseV2PageShell
      label="내 현황"
      title="나의 제출·이수 현황"
      description="현재 연결된 교직원 정보를 기준으로 제출·이수·검진 상태를 확인합니다."
      displayName={displayName}
    >
      <SummaryRow overview={overview} />

      {state.status === "success" && (
        <section className="space-y-3">
          {overview.items.map((item) => (
            <StatusRow key={item.taskId} item={item} />
          ))}
        </section>
      )}

      {state.status !== "success" && (
        <FirebaseContentState
          status={state.status}
          message={state.message}
          emptyMessage="현재 확인 가능한 항목이 없습니다."
        />
      )}
    </FirebaseV2PageShell>
  );
}

export default function MySubmissionStatusPage() {
  return (
    <FirebaseStaffSubmissionAccessGate>
      {({ assignment, displayName }) => (
        <MySubmissionStatusContent assignment={assignment} displayName={displayName} />
      )}
    </FirebaseStaffSubmissionAccessGate>
  );
}
