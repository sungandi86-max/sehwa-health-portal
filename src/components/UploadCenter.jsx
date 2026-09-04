import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { uploadIntro } from "../data/fallbackData.js";
import { AppCard, Badge, SafeText } from "./ui.jsx";
import SubmitModal from "./SubmitModal.jsx";

const INFECTION_REPORT_CARD = {
  title: "감염병 발생 보고",
  titleLines: ["감염병 발생", "보고"],
  description: "학생이 감염병 진단을 받은 경우, 로그인 후 Firebase 감염병 보고 화면에서 접수해 주세요.",
  target: "담임교사",
  documentType: "감염병 발생 정보",
  deadline: "수시",
  fileGuide: "감염병 보고는 로그인 후 제출할 수 있습니다. 제출 내용은 보건교사가 전용 사례관리 화면에서 확인합니다.",
  buttonText: "감염병 발생 보고하기",
  status: "로그인 후 접수",
  uploadType: "infection",
  highlight: true,
};

const TB_REPLY_PUBLIC_CARD = {
  title: "결핵검진 진료회신 제출",
  titleLines: ["결핵검진", "진료회신 제출"],
  description: "학생이 제출한 진료회신란 또는 진료확인서를 사진 촬영 또는 스캔하여 업로드해주세요.",
  target: "결핵검진 진료회신 제출 대상 학생",
  documentType: "진료회신란 또는 진료확인서",
  deadline: "별도 안내일까지",
  fileGuide: "학생이 제출한 진료회신란 또는 진료확인서를 사진 촬영 또는 스캔하여 업로드해 주세요.",
  buttonText: "진료회신 업로드하기",
  status: "접수 중",
  uploadType: "student-file",
  highlight: true,
};

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
  student_tb_reply: {
    modalType: "student_tb_reply",
    sheetName: "응답_결핵검진진료회신",
    aliases: ["student_tb_reply", "student-file", "student_file", "studentfile"],
    keywords: ["진료회신", "진료확인서", "student_tb_reply"],
  },
  tb: {
    modalType: "tb",
    sheetName: "응답_결핵검진확인증",
    aliases: ["tb", "tb_certificate", "tuberculosis_certificate", "결핵검진확인증"],
    keywords: ["결핵검진 확인증", "결핵검진확인증", "흉부 x-ray", "흉부x-ray"],
  },
  recruit: {
    modalType: "recruit",
    sheetName: "응답_채용검진확인요청",
    aliases: ["recruit", "recruit_checkup", "employment_checkup", "채용검진"],
    keywords: ["채용검진", "대체 인정", "확인 요청"],
  },
  infection: {
    modalType: "infection",
    sheetName: "응답_감염병발생보고",
    aliases: ["infection", "infection_report", "감염병"],
    keywords: ["감염병"],
  },
  other: {
    modalType: "other",
    sheetName: "응답_기타보건자료",
    aliases: ["other", "기타보건자료"],
    keywords: ["기타 보건", "기타 자료", "기타보건자료"],
  },
};

const SUBMIT_TYPE_ORDER = ["cpr", "tb_registration", "student_tb_reply", "tb", "recruit", "infection", "other"];
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

  const identityText = [item.submitType, item.submissionType, item.type, item.id, item.key, item.uploadType, item.url]
    .map(normalizeSubmitValue);

  const aliasMatch = SUBMIT_TYPE_ORDER.find((type) =>
    SUBMIT_TYPE_CONFIG[type].aliases.some((alias) =>
      identityText.includes(normalizeSubmitValue(alias))
    )
  );
  if (aliasMatch) return aliasMatch;

  const searchableText = normalizeSubmitValue(
    [item.title, ...(item.titleLines || []), item.documentType, item.buttonText, item.fileGuide, item.url]
      .filter(Boolean)
      .join(" ")
  );

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

export default function UploadCenter({ items, publicMode = false, publicType = "" }) {
  const navigate = useNavigate();
  const [modalType, setModalType] = useState(null);
  const allItems = items.some((item) => resolveSubmitCardType(item) === "infection")
    ? items
    : [...items, INFECTION_REPORT_CARD];
  const publicItems = allItems.filter((item) => resolveSubmitCardType(item) === "student_tb_reply");
  const uploadItems = publicMode && publicType === "tbreply"
    ? (publicItems.length ? publicItems : [TB_REPLY_PUBLIC_CARD])
    : allItems;

  useEffect(() => {
    if (!publicMode || publicType !== "tbreply") return;
    setModalType("student_tb_reply");
  }, [publicMode, publicType]);

  return (
    <>
      <section id="upload" className={`mx-auto max-w-6xl scroll-mt-24 px-4 ${publicMode ? "py-6" : "py-10"}`}>
        <div className={`rounded-[32px] bg-[#1A3B8B] p-6 text-white shadow-sm md:p-8 ${publicMode ? "mb-5" : ""}`}>
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-2 text-sm font-bold text-[#BFE6CB]">
                {publicMode ? "SUBMISSION" : "UPLOAD CENTER"}
              </p>
              <h2 className="text-2xl font-black md:text-3xl">
                {publicMode ? "결핵검진 진료회신 제출" : uploadIntro.title}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-50 md:text-base">
                {publicMode
                  ? "학생이 제출한 진료회신란 또는 진료확인서를 업로드하는 전용 페이지입니다."
                  : uploadIntro.description}
              </p>
            </div>
            {!publicMode && <div className="rounded-2xl bg-white/10 p-4 text-sm leading-6 text-blue-50 md:max-w-sm">
              {uploadIntro.notice}
            </div>}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {uploadItems.map((item) => {
            const submitType = resolveSubmitCardType(item);
            const displayItem = submitType === "infection" ? { ...item, ...INFECTION_REPORT_CARD } : item;
            const handleClick = () => (
              submitType === "infection" ? navigate("/firebase-submit/infection") : setModalType(submitType)
            );
            return (
              <AppCard
                key={displayItem.id || `${submitType}-${displayItem.title}`}
                className={displayItem.highlight ? "border-[#D94F70]/30 ring-2 ring-[#FDEAF0]" : ""}
              >
                <div className="mb-4">
                  <div className="mb-3 flex justify-start">
                    <Badge
                      type={
                        item.uploadType === "request"
                          ? "blue"
                          : displayItem.highlight
                          ? "pink"
                          : "gray"
                      }
                    >
                      {displayItem.status}
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
                    {(displayItem.titleLines || [displayItem.title]).map((line, i) => (
                      <span key={i} className="block whitespace-nowrap">
                        {line}
                      </span>
                    ))}
                  </h3>
                  <p
                    className="mt-2 text-sm leading-7 text-slate-600"
                    style={{ wordBreak: "keep-all", overflowWrap: "normal" }}
                  >
                    {displayItem.description}
                  </p>
                </div>

                <div className="grid gap-3 rounded-2xl bg-[#F7F9FC] p-4 text-sm text-slate-700">
                  <div className="grid grid-cols-[44px_1fr] gap-2">
                    <b>대상</b>
                    <SafeText>{displayItem.target}</SafeText>
                  </div>
                  <div className="grid grid-cols-[44px_1fr] gap-2">
                    <b>자료</b>
                    <SafeText>{displayItem.documentType}</SafeText>
                  </div>
                  <div className="grid grid-cols-[44px_1fr] gap-2">
                    <b>마감</b>
                    <SafeText>{displayItem.deadline}</SafeText>
                  </div>
                </div>

                <p
                  className={`mt-4 whitespace-pre-line rounded-2xl p-4 text-sm leading-7 ${
                    displayItem.uploadType === "request"
                      ? "bg-[#EAF3FF] text-[#1A3B8B]"
                      : "bg-[#DFF4EC] text-[#1B5E20]"
                  }`}
                >
                  <SafeText>{displayItem.fileGuide}</SafeText>
                </p>

                {displayItem.buttonText && (
                  <button
                    onClick={handleClick}
                    className="mt-4 w-full rounded-2xl bg-[#1A3B8B] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow-md"
                  >
                    {displayItem.buttonText}
                  </button>
                )}
              </AppCard>
            );
          })}
        </div>

        {!publicMode && (
          <p className="mt-4 rounded-2xl bg-white p-4 text-sm leading-6 text-slate-500 shadow-sm">
            {uploadIntro.subNotice}
          </p>
        )}
      </section>

      {modalType && (
        <SubmitModal type={modalType} onClose={() => setModalType(null)} publicMode={publicMode} />
      )}
    </>
  );
}
