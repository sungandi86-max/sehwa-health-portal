import { Link } from "react-router-dom";

function SummaryIcon({ type }) {
  if (type === "calendar") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect x="3" y="4" width="18" height="18" rx="3" />
        <path d="M3 10h18" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
      <path d="M10.3 21a2 2 0 0 0 3.4 0" />
    </svg>
  );
}

function getText(value) {
  return String(value || "").trim();
}

function getNoticeDate(item) {
  return getText(item.dateLabel) || getText(item.date) || getText(item.createdAt) || "상시";
}

function findScheduleText(item) {
  return getText(item.schedule) || getText(item.period) || getText(item.date) || getText(item.deadline);
}

function formatCompactDate(value) {
  const text = getText(value);
  const numeric = text.match(/(\d{1,2})\s*[./월]\s*(\d{1,2})/);
  if (numeric) return `${numeric[1]}.${numeric[2]}`;

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getMonth() + 1}.${parsed.getDate()}`;
  }

  return text || "일정";
}

function noticeTone(status) {
  const text = getText(status);
  if (text.includes("중요")) return "border-[#F9D9E2] bg-[#FFF4F7] text-[#B42318]";
  if (text.includes("자료")) return "border-[#D7F1E8] bg-[#F0FBF7] text-[#08754B]";
  return "border-[#D7E8FF] bg-[#F1F7FF] text-[#0D4EA6]";
}

export default function HomeDashboardSummary({ notices = [], schedules = [], isLoading = false }) {
  const visibleNotices = notices.slice(0, 3);
  const visibleSchedules = schedules.slice(0, 3);

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-3 px-3 pb-2 pt-0 sm:px-4 lg:max-w-[1280px] md:grid-cols-2">
      <article className="rounded-[14px] border border-[#DDEAE7] bg-white p-3 shadow-[0_5px_14px_rgba(16,32,71,0.035)]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-[9px] border border-[#F9D9E2] bg-[#FFF4F7] text-[#D13C55]">
              <SummaryIcon />
            </span>
            <h2 className="text-base font-semibold text-[#102047]">오늘의 공지</h2>
          </div>
          <Link to="/today" className="shrink-0 text-xs font-semibold text-[#0D4EA6] hover:text-[#183B8F]">
            더보기 →
          </Link>
        </div>
        <div className="divide-y divide-[#EEF2F5]">
          {visibleNotices.length > 0 ? visibleNotices.map((item) => (
            <div key={`${item.title}-${getNoticeDate(item)}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 py-1.5">
              <span className={`rounded-[8px] border px-2 py-0.5 text-[11px] font-semibold ${noticeTone(item.status)}`}>
                {getText(item.status) || "안내"}
              </span>
              <p className="truncate text-sm font-semibold text-[#102047]">{item.title}</p>
              <span className="text-xs font-medium tabular-nums text-[#627083]">{getNoticeDate(item)}</span>
            </div>
          )) : isLoading ? (
            <p className="py-4 text-sm font-medium text-[#627083]">표시할 공지를 불러오는 중입니다.</p>
          ) : (
            <p className="py-4 text-sm font-medium text-[#627083]">현재 표시할 공지가 없습니다.</p>
          )}
        </div>
      </article>

      <article className="rounded-[14px] border border-[#DDEAE7] bg-white p-3 shadow-[0_5px_14px_rgba(16,32,71,0.035)]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-[9px] border border-[#D7F1E8] bg-[#F0FBF7] text-[#20A982]">
              <SummaryIcon type="calendar" />
            </span>
            <h2 className="text-base font-semibold text-[#102047]">진행 중인 일정</h2>
          </div>
          <Link to="/checkup" className="shrink-0 text-xs font-semibold text-[#0D4EA6] hover:text-[#183B8F]">
            더보기 →
          </Link>
        </div>
        <div className="divide-y divide-[#EEF2F5]">
          {visibleSchedules.length > 0 ? visibleSchedules.map((item) => {
            const schedule = findScheduleText(item);
            return (
              <div key={`${item.title}-${schedule}`} className="grid grid-cols-[48px_minmax(0,1fr)] gap-2.5 py-1.5">
                <span className="rounded-[8px] border border-[#DDEAE7] bg-[#F8FAFC] px-1.5 py-1 text-center text-xs font-semibold tabular-nums text-[#3154A3]">
                  {formatCompactDate(schedule)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[#102047]">{item.title}</span>
                  <span className="block truncate text-xs font-normal text-[#627083]">{schedule || getText(item.target) || "일정 확인"}</span>
                </span>
              </div>
            );
          }) : isLoading ? (
            <p className="py-4 text-sm font-medium text-[#627083]">일정을 불러오는 중입니다.</p>
          ) : (
            <p className="py-4 text-sm font-medium text-[#627083]">표시할 일정이 없습니다.</p>
          )}
        </div>
      </article>
    </section>
  );
}
