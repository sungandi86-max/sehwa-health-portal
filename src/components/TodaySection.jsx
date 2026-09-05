import { Badge, SectionTitle } from "./ui.jsx";

export default function TodaySection({ items, isLoading = false, loadFailed = false, fallbackUsed = false }) {
  return (
    <section id="today" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-8">
      <SectionTitle
        eyebrow="TODAY"
        title="오늘의 보건실"
        description="오늘 또는 이번 주 교직원이 확인해야 할 보건 업무를 모았습니다."
      />
      {fallbackUsed && (
        <div className="mb-4 rounded-[10px] border border-[#DDEAE7] bg-white px-4 py-3 text-sm font-semibold text-[#627083]">
          오늘의 보건실 정보를 불러오는 중 문제가 있어 기존 방식으로 표시했습니다.
        </div>
      )}
      {loadFailed && (
        <div className="mb-4 rounded-[10px] border border-[#F6D8D8] bg-[#FFF7F7] px-4 py-3 text-sm font-semibold text-[#9F2525]">
          오늘의 보건실 정보를 불러오지 못했습니다.
        </div>
      )}
      <div className="overflow-hidden rounded-[12px] border border-[#DDEAE7] bg-white">
        {isLoading && [0, 1, 2].map((item) => (
          <div key={item} className={`${item > 0 ? "border-t border-[#DDEAE7]" : ""} p-4`}>
            <div className="animate-pulse">
              <div className="mb-3 h-5 w-16 rounded-[8px] bg-slate-200" />
              <div className="h-6 w-3/4 rounded-lg bg-slate-200" />
              <div className="mt-5 h-12 rounded-[10px] bg-slate-100" />
              <div className="mt-4 h-4 w-full rounded bg-slate-100" />
            </div>
          </div>
        ))}
        {!isLoading && items.length === 0 && (
          <p className="p-4 text-sm font-semibold text-[#627083]">현재 진행 중인 보건실 안내가 없습니다.</p>
        )}
        {!isLoading && items.map((item, index) => (
          <article key={item.title} className={`grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_220px] ${index > 0 ? "border-t border-[#DDEAE7]" : ""}`}>
            <div>
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <Badge type={item.badgeType}>{item.status}</Badge>
                <span className="text-xs font-semibold text-[#627083]">{item.date || item.dateLabel || "상시"} · {item.target || "전체"}</span>
              </div>
              <h3
                className="text-base font-semibold leading-6 text-[#102047]"
                style={{ wordBreak: "keep-all", overflowWrap: "normal" }}
              >
                {item.title}
              </h3>
              <p className="mt-1 text-sm leading-6 text-[#627083]">{item.description}</p>
            </div>
            {item.actionText && (
              <p className="rounded-[10px] border border-[#C8D8FF] bg-[#EEF4FF] p-3 text-sm font-semibold text-[#3154A3]">
                {item.actionText}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
