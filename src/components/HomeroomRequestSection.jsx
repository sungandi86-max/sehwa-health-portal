import { homeroomRequestItems } from "../data/fallbackData.js";
import { AppCard, Badge, SectionTitle } from "./ui.jsx";

export default function HomeroomRequestSection() {
  return (
    <section id="homeroom" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-10">
      <SectionTitle
        eyebrow="HOMEROOM"
        title="담임 협조 요청"
        description="담임 선생님들이 확인해야 할 회수·전달·지도 항목을 정리했습니다."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {homeroomRequestItems.map((item) => (
          <AppCard key={item.title}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-extrabold text-[#263238]">{item.title}</h3>
              <Badge type="green">{item.status}</Badge>
            </div>
            <p className="mt-3 text-sm font-bold text-[#1A3B8B]">{item.target} · {item.deadline}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
            <ul className="mt-4 space-y-2 rounded-2xl bg-[#F7F9FC] p-4 text-sm text-slate-600">
              {(item.checklist || []).map((check, i) => (
                <li key={i}>□ {check}</li>
              ))}
            </ul>
          </AppCard>
        ))}
      </div>
    </section>
  );
}
