export default function InfectionStatistics({ overview }) {
  const summaryItems = [
    { label: "전체 발생", count: overview.totals.all },
    { label: "현재 관리 중", count: overview.totals.active },
    { label: "종결", count: overview.totals.closed },
    { label: "보고 미완료", count: overview.totals.pendingReport },
  ];

  return (
    <section className="space-y-3" aria-label="감염병 발생 통계">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {summaryItems.map((item) => (
          <article key={item.label} className="flex min-h-14 items-center justify-between gap-3 rounded-[12px] border border-[#DDEAE7] bg-white px-3 py-2 shadow-[var(--shh-soft-shadow)]">
            <p className="text-[12px] font-semibold text-[#627083]">{item.label}</p>
            <p className="text-xl font-bold tabular-nums text-[#102047]">{item.count}</p>
          </article>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {[
          { title: "월별 발생", items: overview.monthly },
          { title: "질환별 발생", items: overview.diseases },
        ].map((group) => (
          <article key={group.title} className="rounded-[12px] border border-[#DDEAE7] bg-white p-3">
            <h2 className="text-sm font-semibold text-[#102047]">{group.title}</h2>
            <dl className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {group.items.length ? group.items.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 border-b border-[#DDEAE7] py-1.5 last:border-b-0">
                  <dt className="min-w-0 break-words text-xs font-medium text-[#627083]">{item.label}</dt>
                  <dd className="text-sm font-semibold tabular-nums text-[#102047]">{item.count}건</dd>
                </div>
              )) : <p className="text-xs font-medium text-[#627083]">집계할 사례가 없습니다.</p>}
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
