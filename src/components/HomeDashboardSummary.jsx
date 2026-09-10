import { Link } from "react-router-dom";

const quickLinks = [
  { label: "오늘의 보건실", helper: "공지 확인", href: "/today", tone: "blue" },
  { label: "제출·보고 센터", helper: "자료 제출", href: "/firebase-submissions", tone: "mint" },
  { label: "검진·검사 안내", helper: "일정 확인", href: "/checkup", tone: "rose" },
  { label: "교육 자료실", helper: "자료 보기", href: "/education", tone: "purple" },
];

const toneClasses = {
  blue: "border-[#D7E8FF] bg-[#F1F7FF] text-[#0D4EA6]",
  mint: "border-[#D7F1E8] bg-[#F0FBF7] text-[#08754B]",
  rose: "border-[#F9D9E2] bg-[#FFF4F7] text-[#B4234F]",
  purple: "border-[#E4DDFB] bg-[#F7F3FF] text-[#5B45C4]",
};

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

  if (type === "link") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.43" />
        <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.33-1.33" />
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
  const visibleNotices = notices.slice(0, 5);
  const visibleSchedules = schedules.slice(0, 4);

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-3 px-3 pb-3 pt-1 sm:px-4 lg:max-w-[1280px] lg:grid-cols-3">
      <article className="rounded-[14px] border border-[#DDEAE7] bg-white p-3.5 shadow-[0_6px_16px_rgba(16,32,71,0.04)]">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] border border-[#F9D9E2] bg-[#FFF4F7] text-[#D13C55]">
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
            <div key={`${item.title}-${getNoticeDate(item)}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 py-2">
              <span className={`rounded-[8px] border px-2 py-0.5 text-[11px] font-semibold ${noticeTone(item.status)}`}>
                {getText(item.status) || "안내"}
              </span>
              <p className="truncate text-sm font-semibold text-[#102047]">{item.title}</p>
              <span className="text-xs font-medium tabular-nums text-[#627083]">{getNoticeDate(item)}</span>
            </div>
          )) : isLoading ? (
            <p className="py-5 text-sm font-medium text-[#627083]">표시할 공지를 불러오는 중입니다.</p>
          ) : (
            <p className="py-5 text-sm font-medium text-[#627083]">현재 표시할 공지가 없습니다.</p>
          )}
        </div>
      </article>

      <article className="rounded-[14px] border border-[#DDEAE7] bg-white p-3.5 shadow-[0_6px_16px_rgba(16,32,71,0.04)]">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] border border-[#D7F1E8] bg-[#F0FBF7] text-[#20A982]">
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
              <div key={`${item.title}-${schedule}`} className="grid grid-cols-[54px_minmax(0,1fr)] gap-3 py-2">
                <span className="rounded-[9px] border border-[#DDEAE7] bg-[#F8FAFC] px-2 py-1 text-center text-xs font-semibold tabular-nums text-[#3154A3]">
                  {formatCompactDate(schedule)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[#102047]">{item.title}</span>
                  <span className="block truncate text-xs font-normal text-[#627083]">{schedule || getText(item.target) || "일정 확인"}</span>
                </span>
              </div>
            );
          }) : isLoading ? (
            <p className="py-5 text-sm font-medium text-[#627083]">일정을 불러오는 중입니다.</p>
          ) : (
            <p className="py-5 text-sm font-medium text-[#627083]">표시할 일정이 없습니다.</p>
          )}
        </div>
      </article>

      <article className="rounded-[14px] border border-[#DDEAE7] bg-white p-3.5 shadow-[0_6px_16px_rgba(16,32,71,0.04)]">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] border border-[#D7E8FF] bg-[#F1F7FF] text-[#0D4EA6]">
            <SummaryIcon type="link" />
          </span>
          <h2 className="text-base font-semibold text-[#102047]">빠른 바로가기</h2>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {quickLinks.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={`rounded-[12px] border px-3 py-2.5 transition hover:-translate-y-0.5 hover:shadow-[0_6px_14px_rgba(16,32,71,0.06)] ${toneClasses[item.tone]}`}
            >
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="mt-0.5 block text-xs font-normal opacity-80">{item.helper}</span>
            </Link>
          ))}
        </div>
      </article>
    </section>
  );
}
