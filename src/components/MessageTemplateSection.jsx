import { useMemo, useState } from "react";
import { AppCard, Badge, SectionTitle } from "./ui.jsx";

export default function MessageTemplateSection({ items }) {
  const [category, setCategory] = useState("전체");
  const [toast, setToast] = useState("");

  const categories = useMemo(
    () => ["전체", ...Array.from(new Set(items.map((item) => item.category).filter(Boolean)))],
    [items]
  );

  const filtered = category === "전체" ? items : items.filter((item) => item.category === category);

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast("문구가 복사되었습니다.");
      setTimeout(() => setToast(""), 1800);
    } catch {
      setToast("복사 기능을 사용할 수 없습니다.");
      setTimeout(() => setToast(""), 1800);
    }
  };

  return (
    <section id="messages" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-10">
      <SectionTitle
        eyebrow="MESSENGER"
        title="메신저 문구 복사"
        description="자주 쓰는 보건실 안내 문구를 바로 복사할 수 있습니다."
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#263238] px-5 py-3 text-sm font-bold text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="mb-5 flex gap-2 overflow-x-auto pb-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${
              category === cat ? "bg-[#D94F70] text-white" : "bg-white text-slate-600"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((item) => (
          <AppCard key={item.title}>
            <Badge type="pink">{item.category}</Badge>
            <h3 className="mt-3 text-lg font-extrabold text-[#263238]">{item.title}</h3>
            <pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-[#F7F9FC] p-4 text-sm leading-6 text-slate-600 font-sans">
              {item.content}
            </pre>
            <button
              onClick={() => copyText(item.content)}
              className="mt-4 w-full rounded-2xl bg-[#D94F70] px-5 py-3 text-sm font-bold text-white shadow-sm md:w-auto"
            >
              문구 복사하기
            </button>
          </AppCard>
        ))}
      </div>
    </section>
  );
}
