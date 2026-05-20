import { useMemo, useState } from "react";
import { AppCard, Badge, PrimaryButton, SectionTitle } from "./ui.jsx";
import SubmitModal from "./SubmitModal.jsx";

const btnCls = "mt-4 inline-block w-full rounded-2xl bg-[#1A3B8B] px-5 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow-md md:w-auto";

export default function ResourceSection({ items }) {
  const [category, setCategory] = useState("전체");
  const [inbodyOpen, setInbodyOpen] = useState(false);

  const categories = useMemo(
    () => ["전체", ...Array.from(new Set(items.map((item) => item.category).filter(Boolean)))],
    [items]
  );

  const filtered = category === "전체" ? items : items.filter((item) => item.category === category);

  return (
    <section id="resources" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-10">
      <SectionTitle
        eyebrow="INFO & EVENTS"
        title="건강정보/이벤트"
        description="보건 관련 안내문, 참고 자료 링크, 보건실 이벤트를 모아두는 공간입니다."
      />
      <div className="mb-5 flex gap-2 overflow-x-auto pb-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${
              category === cat ? "bg-[#1A3B8B] text-white" : "bg-white text-slate-600"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {filtered.map((item) => (
          <AppCard key={item.title}>
            <Badge type="blue">{item.category}</Badge>
            <h3 className="mt-3 text-lg font-extrabold text-[#263238]">{item.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
            {item.buttonText && (
              item.url === "inbody"
                ? <button onClick={() => setInbodyOpen(true)} className={btnCls}>{item.buttonText}</button>
                : <PrimaryButton url={item.url}>{item.buttonText}</PrimaryButton>
            )}
          </AppCard>
        ))}
      </div>

      {inbodyOpen && (
        <SubmitModal type="inbody" onClose={() => setInbodyOpen(false)} />
      )}
    </section>
  );
}
