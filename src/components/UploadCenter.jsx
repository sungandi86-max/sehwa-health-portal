import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { uploadIntro } from "../data/fallbackData.js";
import { auth } from "../lib/firebase.js";
import { getStaffDisplayName, getStaffRoleDisplay, getAuthenticatedStaffIdentity } from "../lib/staffIdentity.js";
import { getUserAssignmentResult } from "../lib/userProfile.js";
import { PortalSubmissionCard } from "./PortalSubpageLayout.jsx";
import { SafeText } from "./ui.jsx";
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
    aliases: ["tb_registration", "tb-registration", "tb_group", "tb_group_screening", "tb_reply", "tb_response", "결핵검진회신서", "결핵검진유형선택"],
    keywords: ["교직원 결핵검진 단체검진", "단체검진 신청", "교직원 결핵검진 유형", "결핵검진 유형 선택", "결핵검진 회신", "회신서"],
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

const actionButtonClass =
  "inline-flex min-h-10 w-full items-center justify-center rounded-[10px] border border-[#0D4EA6] bg-[#0D4EA6] px-4 py-2 text-sm font-semibold text-white transition hover:border-[#183B8F] hover:bg-[#183B8F] focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/15 sm:w-fit";

const INTERNAL_TB_REGISTRATION_GUIDE_MARKERS = [
  "노출시작일",
  "노출종료일",
];

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

function SubmitterIdentity({ viewer }) {
  if (viewer.status === "loading") {
    return <span className="text-[#8A96A8]">교직원 정보 확인 중</span>;
  }

  if (viewer.status === "ready") {
    return (
      <>
        <span className="font-semibold text-[#102047]">{viewer.name}</span>
        <span className="text-[#C1CAD6]">·</span>
        <span className="text-[#627083]">{viewer.role}</span>
      </>
    );
  }

  if (viewer.status === "needs-assignment") {
    return <span className="text-[#9A6700]">교직원 정보 연결 필요</span>;
  }

  return <span className="text-[#627083]">로그인 후 제출</span>;
}

function getCompactActionLabel(item) {
  const label = String(item.buttonText || "제출하기");
  return label.endsWith("→") ? label : `${label} →`;
}

function getUserFacingFileGuide(item, submitType) {
  const guide = String(item.fileGuide || "").trim();
  if (submitType !== "tb_registration") return guide;

  return INTERNAL_TB_REGISTRATION_GUIDE_MARKERS.some((marker) => guide.includes(marker))
    ? ""
    : guide;
}

export default function UploadCenter({ items, publicMode = false, publicType = "", tbConfig = null }) {
  const navigate = useNavigate();
  const [modalType, setModalType] = useState(null);
  const [viewer, setViewer] = useState({ status: publicMode ? "hidden" : "loading", name: "", role: "" });
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
  const rows = Object.entries(groupedItems).flatMap(([group, entries]) =>
    entries.map((entry) => ({ ...entry, group }))
  );

  useEffect(() => {
    if (!publicMode || publicType !== "tbreply") return;
    setModalType("student_tb_reply");
  }, [publicMode, publicType]);

  useEffect(() => {
    if (publicMode) {
      setViewer({ status: "hidden", name: "", role: "" });
      return undefined;
    }

    let isMounted = true;
    let requestId = 0;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      requestId += 1;
      const currentRequestId = requestId;

      if (!currentUser) {
        if (isMounted) setViewer({ status: "signed-out", name: "", role: "" });
        return;
      }

      if (isMounted) setViewer({ status: "loading", name: "", role: "" });

      try {
        const assignmentResult = await getUserAssignmentResult(
          currentUser.uid,
          CURRENT_SCHOOL_YEAR,
          CURRENT_SEMESTER
        );
        const assignment = assignmentResult.assignment;
        let identity = null;

        if (assignment?.staffId) {
          identity = await getAuthenticatedStaffIdentity().catch(() => null);
        }

        if (!isMounted || currentRequestId !== requestId) return;

        if (!assignment?.active) {
          setViewer({ status: "needs-assignment", name: "", role: "" });
          return;
        }

        setViewer({
          status: "ready",
          name: getStaffDisplayName({ identity, displayName: currentUser.displayName, user: currentUser }),
          role: getStaffRoleDisplay({ assignment, identity }),
        });
      } catch {
        if (isMounted && currentRequestId === requestId) {
          setViewer({ status: "needs-assignment", name: "", role: "" });
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [publicMode]);

  return (
    <>
      <section id="upload" className={`mx-auto w-full max-w-[1120px] scroll-mt-24 px-3 ${publicMode ? "py-4" : "py-2 sm:py-3"} sm:px-4`}>
        <header className={`rounded-[14px] border border-[#DDEAE7] bg-white p-4 sm:p-5 ${publicMode ? "mb-4" : ""}`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <h1 className="text-[22px] font-bold leading-tight text-[#102047] sm:text-2xl">
                {publicMode ? "결핵검진 진료회신 제출" : "제출·보고 센터"}
              </h1>
              <p className="mt-1.5 max-w-3xl text-sm font-normal leading-6 text-[#627083]" style={{ wordBreak: "keep-all" }}>
                {publicMode
                  ? "학생이 제출한 진료회신란 또는 진료확인서를 업로드하는 전용 페이지입니다."
                  : "교직원 제출 및 학생 관련 보고 업무를 확인할 수 있습니다."}
              </p>
            </div>
            {!publicMode && (
              <div className="inline-flex w-fit max-w-full items-center gap-2 rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2 text-sm">
                <SubmitterIdentity viewer={viewer} />
              </div>
            )}
          </div>
        </header>

        {!publicMode && (
          <div className="mt-3 flex gap-2 rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2.5 text-sm leading-6 text-[#627083]">
            <span className="shrink-0 font-semibold text-[#0D4EA6]">안내</span>
            <p>{uploadIntro.subNotice}</p>
          </div>
        )}

        <section className="mt-3 rounded-[14px] border border-[#DDEAE7] bg-white p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3 px-1 pb-3">
            <div>
              <h2 className="text-base font-semibold text-[#102047]">제출 항목</h2>
              {!publicMode && <p className="mt-0.5 text-xs text-[#627083]">현재 접수 중인 제출·보고 항목</p>}
            </div>
            <span className="shrink-0 rounded-[8px] border border-[#DDEAE7] bg-[#F8FAFA] px-2.5 py-1 text-xs font-semibold text-[#627083]">{rows.length}개 항목</span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {rows.map(({ item: displayItem, submitType }) => {
              const fileGuide = getUserFacingFileGuide(displayItem, submitType);
              const handleClick = () => (
                submitType === "infection" ? navigate("/firebase-submit/infection") : setModalType(submitType)
              );

              return (
                <PortalSubmissionCard
                  key={displayItem.id || `${submitType}-${displayItem.title}`}
                  title={displayItem.title}
                  description={displayItem.description ? <SafeText>{displayItem.description}</SafeText> : null}
                  status={displayItem.status}
                  deadline={displayItem.deadline}
                  target={displayItem.target ? <SafeText>{displayItem.target}</SafeText> : null}
                  documentType={displayItem.documentType ? <SafeText>{displayItem.documentType}</SafeText> : null}
                  guideText={fileGuide ? <SafeText>{fileGuide}</SafeText> : null}
                  action={displayItem.buttonText && (
                    <button
                      type="button"
                      onClick={handleClick}
                      className={actionButtonClass}
                    >
                      {getCompactActionLabel(displayItem)}
                    </button>
                  )}
                />
              );
            })}
          </div>
        </section>
      </section>

      {modalType && (
        <SubmitModal
          type={modalType}
          onClose={() => setModalType(null)}
          publicMode={publicMode}
          tbConfig={modalType === "tb_registration" ? tbConfig : null}
        />
      )}
    </>
  );
}
