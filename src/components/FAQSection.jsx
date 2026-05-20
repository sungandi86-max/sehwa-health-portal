import { useState } from "react";
import { SectionTitle } from "./ui.jsx";

export default function FAQSection({ items }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section id="faq" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-10">
      <SectionTitle
        eyebrow="FAQ"
        title="자주 묻는 질문"
        description="교직원이 자주 확인하는 질문을 정리했습니다."
      />
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div
            key={item.question}
            className="overflow-hidden rounded-[22px] border border-slate-100 bg-white shadow-sm"
          >
            <button
              onClick={() => setOpenIndex(openIndex === idx ? -1 : idx)}
              className="flex w-full items-center justify-between gap-4 p-5 text-left"
            >
              <span className="font-extrabold text-[#263238]">Q. {item.question}</span>
              <span className="text-2xl text-[#1A3B8B]">{openIndex === idx ? "−" : "+"}</span>
            </button>
            {openIndex === idx && (
              <div className="border-t border-slate-100 bg-[#F7F9FC] p-5 text-sm leading-7 text-slate-600">
                {item.answer}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
