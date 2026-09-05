import { homeroomRequestItems } from "../data/fallbackData.js";
import { Badge, SectionTitle } from "./ui.jsx";

export default function HomeroomRequestSection() {
  return (
    <section id="homeroom" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-8">
      <SectionTitle
        title="담임 협조 요청"
        description="담임 선생님들이 확인해야 할 회수·전달·지도 항목을 정리했습니다."
      />
      <div className="overflow-hidden rounded-[12px] border border-[#DDEAE7] bg-white">
        {homeroomRequestItems.map((item) => (
          <article key={item.title} className="border-b border-[#E8F0EE] px-4 py-4 last:border-b-0">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-[#102047]">{item.title}</h3>
                  <Badge type="green">{item.status}</Badge>
                </div>
                <p className="mt-2 text-sm font-semibold text-[#102047]">{item.target} · {item.deadline}</p>
                <p className="mt-2 text-sm leading-6 text-[#627083]">{item.description}</p>
              </div>
              {!!(item.checklist || []).length && (
                <ul className="min-w-0 rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] p-3 text-sm text-[#627083] lg:w-[360px]">
                  {(item.checklist || []).map((check, i) => (
                    <li key={i} className="leading-6">□ {check}</li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
