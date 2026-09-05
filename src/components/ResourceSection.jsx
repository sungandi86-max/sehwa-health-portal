import { useMemo, useState } from "react";
import { Badge, PrimaryButton, SectionTitle } from "./ui.jsx";
import SubmitModal from "./SubmitModal.jsx";

const btnCls = "inline-block w-full rounded-[10px] bg-[#102047] px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[#183B8F] md:w-auto";

export default function ResourceSection({ items, loadFailed, isLoading = false, fallbackUsed = false }) {
  const [category, setCategory] = useState("전체");
  const [inbodyOpen, setInbodyOpen] = useState(false);

  const categories = useMemo(
    () => ["전체", ...Array.from(new Set(items.map((item) => item.category).filter(Boolean)))],
    [items]
  );

  const filtered = category === "전체" ? items : items.filter((item) => item.category === category);
  const emptyMessage = loadFailed
    ? "데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    : "표시할 건강정보/이벤트 데이터가 없습니다.";

  return (
    <section id="resources" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-8">
      <SectionTitle
        eyebrow="INFO & EVENTS"
        title="건강정보/이벤트"
        description="보건 관련 안내문, 참고 자료 링크, 보건실 이벤트를 모아두는 공간입니다."
      />
      {isLoading ? (
        <div className="rounded-[12px] border border-[#DDEAE7] bg-white p-5 text-center text-sm font-semibold text-[#627083]">
          자료를 불러오는 중입니다.
        </div>
      ) : items.length > 0 ? (
        <>
          {fallbackUsed && (
            <div className="mb-4 rounded-[10px] border border-[#DDEAE7] bg-white px-4 py-3 text-sm font-semibold text-[#627083]">
              자료를 불러오는 중 문제가 있어 기존 방식으로 표시했습니다.
            </div>
          )}
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`whitespace-nowrap rounded-[10px] border px-3 py-2 text-sm font-semibold ${
                  category === cat
                    ? "border-[#102047] bg-[#102047] text-white"
                    : "border-[#DDEAE7] bg-white text-[#627083]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="overflow-hidden rounded-[12px] border border-[#DDEAE7] bg-white">
            {filtered.map((item) => (
              <article key={item.title} className="border-b border-[#E8F0EE] px-4 py-4 last:border-b-0">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-[#102047]">{item.title}</h3>
                      <Badge type="blue">{item.category}</Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#627083]">{item.description}</p>
                  </div>
                  {item.buttonText && (
                    <div className="shrink-0">
                      {item.url === "inbody"
                        ? <button onClick={() => setInbodyOpen(true)} className={btnCls}>{item.buttonText}</button>
                        : <PrimaryButton url={item.url}>{item.buttonText}</PrimaryButton>}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-[12px] border border-[#DDEAE7] bg-white p-5 text-center text-sm font-semibold text-[#627083]">
          {emptyMessage}
        </div>
      )}

      {inbodyOpen && (
        <SubmitModal type="inbody" onClose={() => setInbodyOpen(false)} />
      )}
    </section>
  );
}
