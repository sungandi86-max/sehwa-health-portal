import { useMemo, useState } from "react";
import { isValidUrl, SectionTitle } from "./ui.jsx";
import SubmitModal from "./SubmitModal.jsx";

const btnCls = "inline-flex min-h-10 w-full items-center justify-center rounded-[9px] border border-[#C8D8FF] bg-white px-3.5 py-2 text-center text-sm font-semibold text-[#0D4EA6] transition hover:border-[#0D4EA6] hover:bg-[#EEF4FF] md:w-auto";

function getResourceGroupTitle(category) {
  return String(category || "").includes("이벤트") ? "신청·이벤트" : category || "건강정보";
}

function groupResources(items) {
  return items.reduce((groups, item) => {
    const title = getResourceGroupTitle(item.category);
    const current = groups.get(title) || [];
    groups.set(title, [...current, item]);
    return groups;
  }, new Map());
}

function ResourceAction({ item, onOpenInbody }) {
  if (!item.buttonText) return null;

  if (item.url === "inbody") {
    return <button onClick={onOpenInbody} className={btnCls}>{item.buttonText}</button>;
  }

  if (!isValidUrl(item.url)) return null;

  return (
    <a href={item.url.trim()} target="_blank" rel="noopener noreferrer" className={btnCls}>
      {item.buttonText}
    </a>
  );
}

export default function ResourceSection({ items, loadFailed, isLoading = false, fallbackUsed = false }) {
  const [category, setCategory] = useState("전체");
  const [inbodyOpen, setInbodyOpen] = useState(false);

  const categories = useMemo(
    () => ["전체", ...Array.from(new Set(items.map((item) => item.category).filter(Boolean)))],
    [items]
  );

  const filtered = category === "전체" ? items : items.filter((item) => item.category === category);
  const groupedResources = useMemo(() => [...groupResources(filtered).entries()], [filtered]);
  const emptyMessage = loadFailed
    ? "데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    : "표시할 건강정보/이벤트 데이터가 없습니다.";

  return (
    <section id="resources" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-8">
      <SectionTitle
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
            {groupedResources.map(([groupTitle, groupItems], groupIndex) => (
              <div key={groupTitle} className={groupIndex > 0 ? "border-t border-[#DDEAE7]" : ""}>
                <div className="border-b border-[#E8F0EE] bg-[#FBFCFD] px-4 py-2.5">
                  <h2 className="text-sm font-bold text-[#102047]">{groupTitle}</h2>
                </div>
                {groupItems.map((item) => (
                  <article key={item.title} className="border-b border-[#E8F0EE] px-4 py-3.5 last:border-b-0 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4">
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold leading-6 text-[#102047]">{item.title}</h3>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#627083] md:line-clamp-1">{item.description}</p>
                      {item.category && (
                        <p className="mt-1 text-xs font-medium text-[#8A96A8]">분류 · {item.category}</p>
                      )}
                    </div>
                    <div className="mt-3 shrink-0 md:mt-0 md:justify-self-end">
                      <ResourceAction item={item} onOpenInbody={() => setInbodyOpen(true)} />
                    </div>
                  </article>
                ))}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="px-4 py-5 text-center text-sm font-semibold text-[#627083]">
                선택한 분류에 표시할 자료가 없습니다.
              </div>
            )}
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
