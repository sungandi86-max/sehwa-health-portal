import { useState } from "react";
import { uploadIntro } from "../data/fallbackData.js";
import { AppCard, Badge, SafeText } from "./ui.jsx";
import SubmitModal from "./SubmitModal.jsx";

const SUBMIT_TYPE_CONFIG = {
  cpr: {
    modalType: "cpr",
    sheetName: "응답_심폐소생술이수증",
    aliases: ["cpr", "cpr_certificate", "심폐소생술", "심폐소생술이수증"],
    keywords: ["심폐소생술", "cpr", "이수증"],
  },
  tb_registration: {
    modalType: "tb_registration",
    sheetName: "응답_교직원결핵검진유형선택",
    aliases: ["tb_registration", "tb-registration", "tb_reply", "tb_response", "결핵검진회신서", "결핵검진유형선택"],
    keywords: ["교직원 결핵검진 유형", "결핵검진 유형 선택", "결핵검진 회신", "회신서"],
  },
  tb: {
    modalType: "tb",
    sheetName: "응답_결핵검진확인증",
    aliases: ["tb", "tb_certificate", "tuberculosis_certificate", "결핵검진확인증"],
    keywords: ["결핵검진 확인증", "결핵검진확인증", "흉부 x-ray", "흉부X-ray"],
  },
  recruit: {
    modalType: "recruit",
    sheetName: "응답_채용검진확인요청",
    aliases: ["recruit", "recruit_checkup", "employment_checkup", "채용검진"],
    keywords: ["채용검진", "대체 인정", "확인 요청"],
  },
  other: {
    modalType: "other",
    sheetName: "응답_기타보건자료",
    aliases: ["other", "기타보건자료"],
    keywords: ["기타 보건", "기타 자료", "기타보건자료"],
  },
};

const SUBMIT_TYPE_ORDER = ["cpr", "tb_registration", "tb", "recruit", "other"];
const VALID_MODAL_TYPES = new Set(SUBMIT_TYPE_ORDER);

function normalizeSubmitValue(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function includesSubmitKeyword(text, keyword) {
  return text.includes(normalizeSubmitValue(keyword));
}

function resolveSubmitCardType(item) {
  const explicitModalType = normalizeSubmitValue(item.modalType);
  if (VALID_MODAL_TYPES.has(explicitModalType)) return explicitModalType;

  const sheetName = normalizeSubmitValue(item.sheetName);
  const sheetMatch = SUBMIT_TYPE_ORDER.find(
    (type) => normalizeSubmitValue(SUBMIT_TYPE_CONFIG[type].sheetName) === sheetName
  );
  if (sheetMatch) return sheetMatch;

  const identityText = [
    item.submitType,
    item.type,
    item.id,
    item.key,
    item.uploadType,
  ].map(normalizeSubmitValue);

  const aliasMatch = SUBMIT_TYPE_ORDER.find((type) =>
    SUBMIT_TYPE_CONFIG[type].aliases.some((alias) =>
      identityText.includes(normalizeSubmitValue(alias))
    )
  );
  if (aliasMatch) return aliasMatch;

  const searchableText = normalizeSubmitValue([
    item.title,
    ...(item.titleLines || []),
    item.documentType,
    item.buttonText,
    item.fileGuide,
  ].filter(Boolean).join(" "));

  const keywordMatch = SUBMIT_TYPE_ORDER.find((type) =>
    SUBMIT_TYPE_CONFIG[type].keywords.some((keyword) =>
      includesSubmitKeyword(searchableText, keyword)
    )
  );
  if (keywordMatch) return keywordMatch;

  const uploadType = normalizeSubmitValue(item.uploadType);
  if (uploadType === "request") return "recruit";
  return "other";
}

export default function UploadCenter({ items }) {
  const [modalType, setModalType] = useState(null);

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
            const submitType = resolveSubmitCardType(item);
            return (
              <AppCard
                key={item.id || `${submitType}-${item.title}`}
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
                    onClick={() => setModalType(submitType)}
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
