import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { uploadIntro } from "../data/fallbackData.js";
import { Badge, SafeText } from "./ui.jsx";
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

const SUBMIT_GROUP_LABELS = {
  staff: "교직원 제출",
  homeroom: "학생·담임 제출",
  other: "기타 제출",
};

const primaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-[10px] bg-[#0D4EA6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#183B8F] md:min-w-[150px]";

function getStatusBadgeType(item) {
  const status = String(item.status || "").trim();
  if (status === "접수 중" || status === "로그인 후 접수") return "blue";
  if (status === "완료") return "green";
  if (status === "확인 필요") return "pink";
  return "gray";
}

function getSubmitGroup(type) {
  if (["cpr", "tb_registration", "tb", "recruit"].includes(type)) return "staff";
  if (["infection", "student_tb_reply"].includes(type)) return "homeroom";
  return "other";
}

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
  const groupedItems = uploadItems.reduce((groups, item) => {
    const submitType = resolveSubmitCardType(item);
    const group = publicMode ? "homeroom" : getSubmitGroup(submitType);
    const nextItem = submitType === "infection" ? { ...item, ...INFECTION_REPORT_CARD } : item;
    return {
      ...groups,
      [group]: [...(groups[group] || []), { item: nextItem, submitType }],
    };
  }, {});

  useEffect(() => {
    if (!publicMode || publicType !== "tbreply") return;
    setModalType("student_tb_reply");
  }, [publicMode, publicType]);

  return (
    <>
      <section id="upload" className={`mx-auto max-w-6xl scroll-mt-24 px-4 ${publicMode ? "py-5" : "py-8"}`}>
        <div className={`rounded-[12px] border border-[#DDEAE7] bg-white p-4 md:p-5 ${publicMode ? "mb-4" : ""}`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#102047] md:text-2xl">
                {publicMode ? "결핵검진 진료회신 제출" : "제출 항목"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#627083]">
                {publicMode
                  ? "학생이 제출한 진료회신란 또는 진료확인서를 업로드하는 전용 페이지입니다."
                  : uploadIntro.description}
              </p>
            </div>
            {!publicMode && <div className="rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2 text-xs leading-5 text-[#627083] md:max-w-sm">
              {uploadIntro.notice}
            </div>}
          </div>
        </div>

        <div className="mt-4 space-y-5">
          {Object.entries(groupedItems).map(([group, entries]) => (
            <div key={group}>
              {!publicMode && (
                <h3 className="mb-2 text-sm font-semibold text-[#102047]">
                  {SUBMIT_GROUP_LABELS[group] || SUBMIT_GROUP_LABELS.other}
                </h3>
              )}
              <div className="overflow-hidden rounded-[12px] border border-[#DDEAE7] bg-white">
                {entries.map(({ item: displayItem, submitType }, index) => {
                  const handleClick = () => (
                    submitType === "infection" ? navigate("/firebase-submit/infection") : setModalType(submitType)
                  );
                  return (
                    <div
                      key={displayItem.id || `${submitType}-${displayItem.title}`}
                      className={`grid gap-3 p-3.5 md:grid-cols-[minmax(0,1fr)_160px] md:items-center md:p-4 ${
                        index > 0 ? "border-t border-[#DDEAE7]" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                          <h4 className="text-[15px] font-semibold leading-6 text-[#102047] md:text-base">
                            {displayItem.title}
                          </h4>
                          <Badge type={getStatusBadgeType(displayItem)}>
                            {displayItem.status}
                          </Badge>
                        </div>
                        <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-[#627083]">
                          <div><dt className="inline font-semibold text-[#102047]">대상 </dt><dd className="inline"><SafeText>{displayItem.target}</SafeText></dd></div>
                          <div><dt className="inline font-semibold text-[#102047]">마감 </dt><dd className="inline"><SafeText>{displayItem.deadline}</SafeText></dd></div>
                        </dl>
                        <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-[#627083]">
                          <SafeText>{displayItem.description}</SafeText>
                        </p>
                        {(displayItem.documentType || displayItem.fileGuide) && (
                          <details className="mt-2 text-xs leading-5 text-[#627083]">
                            <summary className="cursor-pointer font-semibold text-[#3154A3]">
                              제출자료·안내 보기
                            </summary>
                            <div className="mt-1.5 space-y-1">
                              {displayItem.documentType && (
                                <p><span className="font-semibold text-[#102047]">제출자료 </span><SafeText>{displayItem.documentType}</SafeText></p>
                              )}
                              {displayItem.fileGuide && (
                                <p className="whitespace-pre-line"><SafeText>{displayItem.fileGuide}</SafeText></p>
                              )}
                            </div>
                          </details>
                        )}
                      </div>
                      {displayItem.buttonText && (
                        <button
                          onClick={handleClick}
                          className={primaryButtonClass}
                        >
                          {displayItem.buttonText}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {!publicMode && (
          <p className="mt-4 rounded-[10px] border border-[#DDEAE7] bg-white px-4 py-3 text-sm leading-6 text-[#627083]">
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
