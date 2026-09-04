import { AppCard, Badge, SectionTitle } from "./ui.jsx";

export default function TodaySection({ items, isLoading = false, loadFailed = false, fallbackUsed = false }) {
  return (
    <section id="today" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-10">
      <SectionTitle
        eyebrow="TODAY"
        title="오늘의 보건실"
        description="오늘 또는 이번 주 교직원이 확인해야 할 보건 업무를 모았습니다."
      />
      {fallbackUsed && (
        <div className="mb-4 rounded-[18px] border border-[#DDEAE7] bg-white px-4 py-3 text-sm font-semibold text-[#627083]">
          오늘의 보건실 정보를 불러오는 중 문제가 있어 기존 방식으로 표시했습니다.
        </div>
      )}
      {loadFailed && (
        <div className="mb-4 rounded-[18px] border border-[#F6D8D8] bg-[#FFF7F7] px-4 py-3 text-sm font-bold text-[#9F2525]">
          오늘의 보건실 정보를 불러오지 못했습니다.
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-3">
        {isLoading && [0, 1, 2].map((item) => (
          <AppCard key={item}>
            <div className="animate-pulse">
              <div className="mb-3 h-5 w-16 rounded-full bg-slate-200" />
              <div className="h-6 w-3/4 rounded-lg bg-slate-200" />
              <div className="mt-5 h-20 rounded-2xl bg-slate-100" />
              <div className="mt-4 h-4 w-full rounded bg-slate-100" />
              <div className="mt-2 h-4 w-5/6 rounded bg-slate-100" />
              <div className="mt-4 h-12 rounded-2xl bg-slate-100" />
            </div>
          </AppCard>
        ))}
        {!isLoading && items.length === 0 && (
          <AppCard>
            <p className="text-sm font-bold text-slate-600">현재 진행 중인 보건실 안내가 없습니다.</p>
          </AppCard>
        )}
        {!isLoading && items.map((item) => (
          <AppCard key={item.title}>
            <div className="mb-4">
              <div className="mb-3 flex justify-start">
                <Badge type={item.badgeType}>{item.status}</Badge>
              </div>
              <h3
                className="text-xl font-extrabold leading-8 text-[#263238]"
                style={{ wordBreak: "keep-all", overflowWrap: "normal", letterSpacing: "-0.02em" }}
              >
                {(item.titleLines || [item.title]).map((line, i) => (
                  <span key={i} className="block whitespace-nowrap">{line}</span>
                ))}
              </h3>
            </div>
            <div className="space-y-2 rounded-2xl bg-[#F7F9FC] p-4 text-sm">
              <p><b>일시</b> · {item.date || item.dateLabel || "상시"}</p>
              <p><b>대상</b> · {item.target || "전체"}</p>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">{item.description}</p>
            {item.actionText && (
              <p className="mt-4 rounded-2xl bg-[#EAF3FF] p-3 text-sm font-bold text-[#1A3B8B]">
                {item.actionText}
              </p>
            )}
          </AppCard>
        ))}
      </div>
    </section>
  );
}
