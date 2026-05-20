import { useState } from "react";
import { uploadIntro } from "../data/fallbackData.js";
import { AppCard, Badge, SafeText } from "./ui.jsx";
import SubmitModal from "./SubmitModal.jsx";

// uploadType → 모달 type 매핑
const TYPE_MAP = {
  cpr: "cpr",
  tb: "tb",
  recruit: "recruit",
  other: "other",
  file: "other", // fallback
};

// uploadType → 모달 type 결정 (API 데이터 대응)
function resolveModalType(item) {
  if (item.modalType) return item.modalType;
  const t = item.uploadType?.toLowerCase() || "";
  if (t === "request") return "recruit";
  if (t === "cpr") return "cpr";
  if (t === "tb") return "tb";
  if (t === "recruit") return "recruit";
  // title 기반 추론
  if (item.title?.includes("심폐소생술")) return "cpr";
  if (item.title?.includes("결핵")) return "tb";
  if (item.title?.includes("채용")) return "recruit";
  return "other";
}

export default function UploadCenter({ items }) {
  const [modalType, setModalType] = useState(null); // null | 'cpr' | 'tb' | 'recruit' | 'other'

  return (
    <>
      <section id="upload" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-10">
        {/* 섹션 헤더 */}
        <div className="rounded-[32px] bg-[#1A3B8B] p-6 text-white shadow-sm md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-2 text-sm font-bold text-[#BFE6CB]">UPLOAD CENTER</p>
              <h2 className="text-2xl font-black md:text-3xl">{uploadIntro.title}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-50 md:text-base">
                {uploadIntro.description}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4 text-sm leading-6 text-blue-50 md:max-w-sm">
              {uploadIntro.notice}
            </div>
          </div>
        </div>

        {/* 카드 목록 */}
        <div className="mt-5 grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {items.map((item) => {
            const mType = resolveModalType(item);
            return (
              <AppCard
                key={item.title}
                className={item.highlight ? "border-[#D94F70]/30 ring-2 ring-[#FDEAF0]" : ""}
              >
                <div className="mb-4">
                  <div className="mb-3 flex justify-start">
                    <Badge
                      type={
                        item.uploadType === "request"
                          ? "blue"
                          : item.highlight
                          ? "pink"
                          : "gray"
                      }
                    >
                      {item.status}
                    </Badge>
                  </div>
                  <h3
                    className="text-xl font-extrabold leading-8 text-[#263238] md:text-2xl md:leading-9"
                    style={{
                      wordBreak: "keep-all",
                      overflowWrap: "normal",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {(item.titleLines || [item.title]).map((line, i) => (
                      <span key={i} className="block whitespace-nowrap">
                        {line}
                      </span>
                    ))}
                  </h3>
                  <p
                    className="mt-2 text-sm leading-7 text-slate-600"
                    style={{ wordBreak: "keep-all", overflowWrap: "normal" }}
                  >
                    {item.description}
                  </p>
                </div>

                <div className="grid gap-3 rounded-2xl bg-[#F7F9FC] p-4 text-sm text-slate-700">
                  <div className="grid grid-cols-[44px_1fr] gap-2">
                    <b>대상</b>
                    <SafeText>{item.target}</SafeText>
                  </div>
                  <div className="grid grid-cols-[44px_1fr] gap-2">
                    <b>자료</b>
                    <SafeText>{item.documentType}</SafeText>
                  </div>
                  <div className="grid grid-cols-[44px_1fr] gap-2">
                    <b>마감</b>
                    <SafeText>{item.deadline}</SafeText>
                  </div>
                </div>

                <p
                  className={`mt-4 whitespace-pre-line rounded-2xl p-4 text-sm leading-7 ${
                    item.uploadType === "request"
                      ? "bg-[#EAF3FF] text-[#1A3B8B]"
                      : "bg-[#DFF4EC] text-[#1B5E20]"
                  }`}
                >
                  <SafeText>{item.fileGuide}</SafeText>
                </p>

                {/* 버튼: 항상 표시 (모달 방식) */}
                {item.buttonText && (
                  <button
                    onClick={() => setModalType(mType)}
                    className={`mt-4 w-full rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow-md
                      ${item.uploadType === "request" ? "bg-[#1A3B8B]" : "bg-[#1A3B8B]"}`}
                  >
                    {item.buttonText}
                  </button>
                )}
              </AppCard>
            );
          })}
        </div>

        <p className="mt-4 rounded-2xl bg-white p-4 text-sm leading-6 text-slate-500 shadow-sm">
          {uploadIntro.subNotice}
        </p>
      </section>

      {/* 제출 모달 */}
      {modalType && (
        <SubmitModal type={modalType} onClose={() => setModalType(null)} />
      )}
    </>
  );
}
