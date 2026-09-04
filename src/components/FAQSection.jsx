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
    <section id="faq" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-10">
      <SectionTitle
        eyebrow="FAQ"
        title="자주 묻는 질문"
        description="교직원이 자주 확인하는 질문을 정리했습니다."
      />
      <div className="mb-5 rounded-[22px] border border-slate-100 bg-white p-4 shadow-sm">
        <label className="block">
          <span className="mb-2 block text-sm font-black text-[#1A3B8B]">FAQ 검색</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpenIndex(0);
            }}
            className="min-h-11 w-full rounded-2xl border border-slate-200 bg-[#F7F9FC] px-4 py-3 text-sm font-bold text-[#263238] outline-none transition focus:border-[#1A3B8B] focus:ring-2 focus:ring-[#1A3B8B]/10"
            placeholder="결핵, 채용검진, 감염병, 보건실, 인바디 등으로 검색해보세요."
          />
        </label>
      </div>
      {fallbackUsed && (
        <div className="mb-4 rounded-[20px] border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          FAQ를 불러오는 중 문제가 있어 기존 방식으로 표시했습니다.
        </div>
      )}

      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-[22px] border border-slate-100 bg-white p-6 text-center text-sm font-bold text-slate-600 shadow-sm">
            FAQ를 불러오는 중입니다.
          </div>
        ) : filteredItems.length ? (
          filteredItems.map((item, idx) => (
            <div
              key={item.id || item.question}
              className="overflow-hidden rounded-[22px] border border-slate-100 bg-white shadow-sm"
            >
              <button
                onClick={() => setOpenIndex(openIndex === idx ? -1 : idx)}
                className="flex w-full items-center justify-between gap-4 p-5 text-left"
              >
                <span className="font-extrabold text-[#263238]">Q. {item.question}</span>
                <span className="text-2xl text-[#1A3B8B]">{openIndex === idx ? "-" : "+"}</span>
              </button>
              {openIndex === idx && (
                <div className="border-t border-slate-100 bg-[#F7F9FC] p-5 text-sm leading-7 text-slate-600">
                  {item.answer}
                </div>
              )}
            </div>
          ))
        ) : loadFailed ? (
          <div className="rounded-[22px] border border-slate-100 bg-white p-6 text-center text-sm font-bold text-slate-600 shadow-sm">
            FAQ를 불러오지 못했습니다. 잠시 후 다시 확인해주세요.
          </div>
        ) : (
          <div className="rounded-[22px] border border-slate-100 bg-white p-6 text-center text-sm font-bold text-slate-600 shadow-sm">
            검색 결과가 없습니다. 필요한 경우 보건실로 문의해주세요.
          </div>
        )}
      </div>
    </section>
  );
}
