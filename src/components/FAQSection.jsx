import { useState } from "react";
import { SectionTitle } from "./ui.jsx";

export default function FAQSection({ items, isLoading = false, loadFailed = false, fallbackUsed = false }) {
  const [openIndex, setOpenIndex] = useState(0);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = normalizedQuery
    ? items.filter((item) => {
        const question = String(item.question || "").toLowerCase();
        const answer = String(item.answer || "").toLowerCase();
        return question.includes(normalizedQuery) || answer.includes(normalizedQuery);
      })
    : items;

  return (
    <section id="faq" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-8">
      <SectionTitle
        title="자주 묻는 질문"
        description="교직원이 자주 확인하는 질문을 정리했습니다."
      />
      <div className="mb-4 rounded-[12px] border border-[#DDEAE7] bg-white p-4">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-[#102047]">FAQ 검색</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpenIndex(0);
            }}
            className="min-h-10 w-full rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2.5 text-sm font-semibold text-[#102047] outline-none transition focus:border-[#0D4EA6] focus:ring-2 focus:ring-[#0D4EA6]/10"
            placeholder="결핵, 채용검진, 감염병, 보건실, 인바디 등으로 검색해보세요."
          />
        </label>
      </div>
      {fallbackUsed && (
        <div className="mb-4 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          FAQ를 불러오는 중 문제가 있어 기존 방식으로 표시했습니다.
        </div>
      )}

      <div className="overflow-hidden rounded-[12px] border border-[#DDEAE7] bg-white">
        {isLoading ? (
          <div className="p-5 text-center text-sm font-semibold text-[#627083]">
            FAQ를 불러오는 중입니다.
          </div>
        ) : filteredItems.length ? (
          filteredItems.map((item, idx) => (
            <div
              key={item.id || item.question}
              className="border-b border-[#E8F0EE] last:border-b-0"
            >
              <button
                onClick={() => setOpenIndex(openIndex === idx ? -1 : idx)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition hover:bg-[#F8FAFA]"
              >
                <span className="text-sm font-bold text-[#102047]">Q. {item.question}</span>
                <span className="text-lg font-semibold text-[#0D4EA6]">{openIndex === idx ? "-" : "+"}</span>
              </button>
              {openIndex === idx && (
                <div className="border-t border-[#E8F0EE] bg-[#F8FAFA] px-4 py-3 text-sm leading-7 text-[#627083]">
                  {item.answer}
                </div>
              )}
            </div>
          ))
        ) : loadFailed ? (
          <div className="p-5 text-center text-sm font-semibold text-[#627083]">
            FAQ를 불러오지 못했습니다. 잠시 후 다시 확인해주세요.
          </div>
        ) : (
          <div className="p-5 text-center text-sm font-semibold text-[#627083]">
            검색 결과가 없습니다. 필요한 경우 보건실로 문의해주세요.
          </div>
        )}
      </div>
    </section>
  );
}
