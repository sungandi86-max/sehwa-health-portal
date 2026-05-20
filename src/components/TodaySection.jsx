import { AppCard, Badge, SectionTitle } from "./ui.jsx";

export default function TodaySection({ items }) {
  return (
    <section id="today" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-10">
      <SectionTitle
        eyebrow="TODAY"
        title="오늘의 보건실"
        description="오늘 또는 이번 주 교직원이 확인해야 할 보건 업무를 모았습니다."
      />
      <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-3">
        {items.map((item) => (
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
              <p><b>일시</b> · {item.date}</p>
              <p><b>대상</b> · {item.target}</p>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">{item.description}</p>
            <p className="mt-4 rounded-2xl bg-[#EAF3FF] p-3 text-sm font-bold text-[#1A3B8B]">{item.actionText}</p>
          </AppCard>
        ))}
      </div>
    </section>
  );
}
