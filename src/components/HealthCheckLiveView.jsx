import { CalendarDays, Clock3, MapPin, Radio, RefreshCw } from "lucide-react";
import {
  deriveHealthCheckProgress,
  getHealthCheckScheduleFreshness,
  getLatestHealthCheckUpdate,
  HEALTH_CHECK_CLASS_LABELS,
  HEALTH_CHECK_EXAM_LABELS,
  HEALTH_CHECK_SESSION_LABELS,
} from "../lib/healthCheckPublicSchedule.js";
import { PortalBadge } from "./PortalSubpageLayout.jsx";

const classStatusTones = { waiting: "status", active: "period", completed: "audience", missing: "warning" };

function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return "날짜 미정";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" })
    .format(new Date(`${value}T00:00:00`));
}

function formatUpdatedAt(value) {
  if (!value) return "갱신 시각 확인 중";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

function ClassStatus({ status }) {
  return (
    <PortalBadge tone={classStatusTones[status] || "status"}>
      {HEALTH_CHECK_CLASS_LABELS[status] || "대기"}
    </PortalBadge>
  );
}

function ProgressCard({ label, item, active = false }) {
  return (
    <article className={`rounded-[12px] border p-4 ${active ? "border-[#C8D8FF] bg-[#EEF4FF]" : "border-[#DDEAE7] bg-white"}`}>
      <p className="text-xs font-semibold text-[#627083]">{label}</p>
      <p className={`mt-2 text-lg font-bold ${active ? "text-[#0D4EA6]" : "text-[#102047]"}`}>
        {item ? item.classId : "없음"}
      </p>
      <p className="mt-1 text-sm text-[#627083]">{item?.scheduledTime || "예정 시간 없음"}</p>
    </article>
  );
}

function ScheduleState({ title, description, tone = "neutral" }) {
  const tones = {
    neutral: "border-[#DDEAE7] bg-white",
    warning: "border-[#F5E4B8] bg-[#FFF9EA]",
    error: "border-[#F6D8D8] bg-[#FFF7F7]",
  };
  return (
    <section className={`rounded-[14px] border p-5 ${tones[tone]}`} role={tone === "error" ? "alert" : "status"}>
      <h2 className="text-base font-semibold text-[#102047]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#627083]">{description}</p>
    </section>
  );
}

export default function HealthCheckLiveView({
  sessions,
  selectedSessionId,
  onSelectSession,
  classes,
  sessionState,
  classState,
  onRefresh,
  now,
}) {
  const selected = sessions.find((item) => item.sessionId === selectedSessionId) || null;
  const progress = deriveHealthCheckProgress(classes);
  const latestUpdate = getLatestHealthCheckUpdate(selected, classes);
  const freshness = selected ? getHealthCheckScheduleFreshness({ ...selected, updatedAt: latestUpdate || selected.updatedAt }, now) : null;

  if (sessionState.status === "loading") {
    return <ScheduleState title="검사 일정을 확인하고 있습니다." description="잠시만 기다려 주세요." />;
  }
  if (sessionState.status === "configuration") {
    return <ScheduleState title="별도검사 일정 연결을 준비하고 있습니다." description="현재는 검진·검사 안내를 이용해 주세요." tone="warning" />;
  }
  if (sessionState.status === "error") {
    return <ScheduleState title="일정을 불러오지 못했습니다." description="네트워크 상태를 확인한 뒤 새로고침해 주세요." tone="error" />;
  }
  if (!sessions.length) {
    return <ScheduleState title="등록된 별도검사 일정이 없습니다." description="검사 일정이 확정되면 이 화면에서 학급별 예정 시간과 진행 상황을 확인할 수 있습니다." />;
  }

  return (
    <div className="space-y-3">
      <section className="rounded-[14px] border border-[#DDEAE7] bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-semibold text-[#102047]">
            검사 일정 선택
            <select
              value={selectedSessionId}
              onChange={(event) => onSelectSession(event.target.value)}
              className="min-h-11 w-full rounded-[10px] border border-[#DDEAE7] bg-white px-3 text-sm font-medium text-[#102047] focus:border-[#0D4EA6] focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/10"
            >
              {sessions.map((session) => (
                <option key={session.sessionId} value={session.sessionId}>
                  {HEALTH_CHECK_EXAM_LABELS[session.examType]} · {session.examDate} · {HEALTH_CHECK_SESSION_LABELS[session.status]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-[#C8D8FF] bg-white px-4 text-sm font-semibold text-[#0D4EA6] hover:bg-[#F8FAFF] focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/10"
          >
            <RefreshCw aria-hidden="true" size={16} />
            새로고침
          </button>
        </div>
      </section>

      {selected && (
        <>
          <section className="grid gap-3 rounded-[14px] border border-[#DDEAE7] bg-white p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <PortalBadge tone="period">{HEALTH_CHECK_EXAM_LABELS[selected.examType]}</PortalBadge>
                <PortalBadge tone="status">{HEALTH_CHECK_SESSION_LABELS[selected.status]}</PortalBadge>
                {freshness?.status === "stale" && (
                  <PortalBadge tone="warning">갱신 지연</PortalBadge>
                )}
              </div>
              <h2 className="mt-3 text-xl font-bold text-[#102047]">{formatDate(selected.examDate)}</h2>
              <dl className="mt-3 grid gap-2 text-sm text-[#627083] sm:grid-cols-2">
                <div className="flex min-w-0 items-center gap-2">
                  <CalendarDays aria-hidden="true" className="shrink-0 text-[#0D4EA6]" size={17} />
                  <span>{selected.examDate}</span>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <MapPin aria-hidden="true" className="shrink-0 text-[#0D4EA6]" size={17} />
                  <span className="break-words">{selected.location || "장소 미정"}</span>
                </div>
              </dl>
              <p className="mt-3 flex items-center gap-2 text-xs text-[#627083]">
                <Clock3 aria-hidden="true" size={15} />
                마지막 갱신 {formatUpdatedAt(latestUpdate || selected.updatedAt)}
              </p>
              {freshness?.status === "stale" && (
                <p className="mt-2 text-sm font-semibold leading-6 text-[#806018]">최근 갱신이 지연되고 있습니다. 현장 안내와 함께 확인해 주세요.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ProgressCard label="현재 검사 중" item={progress.current} active={selected.status === "inProgress" && Boolean(progress.current)} />
              <ProgressCard label="다음 예정" item={progress.next} />
            </div>
          </section>

          {selected.status === "completed" || selected.status === "archived" ? (
            <ScheduleState title="종료된 검사입니다." description="아래 시간표는 마지막 동기화 상태입니다." />
          ) : null}

          {classState.status === "loading" ? (
            <ScheduleState title="학급별 시간표를 확인하고 있습니다." description="잠시만 기다려 주세요." />
          ) : classState.status === "error" ? (
            <ScheduleState title="학급별 시간표를 불러오지 못했습니다." description="잠시 후 새로고침해 주세요." tone="error" />
          ) : classes.length === 0 ? (
            <ScheduleState title="시간표 동기화 전입니다." description="검사 일정은 등록되었지만 학급별 방문 순서는 아직 준비되지 않았습니다." tone="warning" />
          ) : (
            <section className="overflow-hidden rounded-[14px] border border-[#DDEAE7] bg-white">
              <div className="flex items-center gap-2 border-b border-[#DDEAE7] px-4 py-3">
                <Radio aria-hidden="true" size={17} className="text-[#0D4EA6]" />
                <h2 className="text-base font-semibold text-[#102047]">학급별 예정 시간표</h2>
              </div>
              <div className="hidden grid-cols-[72px_minmax(0,1fr)_120px_112px] bg-[#F8FAFA] px-4 py-2 text-xs font-semibold text-[#627083] sm:grid">
                <span>순서</span><span>학급</span><span>예정 시간</span><span>상태</span>
              </div>
              <ol className="divide-y divide-[#DDEAE7]">
                {classes.map((item) => (
                  <li key={item.classId} className={`grid gap-3 px-4 py-3 sm:grid-cols-[72px_minmax(0,1fr)_120px_112px] sm:items-center ${item.displayStatus === "active" ? "bg-[#F8FAFF]" : "bg-white"}`}>
                    <span className="hidden text-sm font-medium text-[#627083] sm:block">{item.order}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#102047]">{item.classId}</p>
                      <p className="mt-0.5 text-xs text-[#627083] sm:hidden">{item.order}번째 · {item.scheduledTime || "시간 미정"}</p>
                    </div>
                    <span className="hidden text-sm text-[#627083] sm:block">{item.scheduledTime || "시간 미정"}</span>
                    <div><ClassStatus status={item.displayStatus} /></div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}
