import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatContentEndDate } from "../lib/contentVisibility.js";
import { isValidUrl } from "./ui.jsx";
import SubmitModal from "./SubmitModal.jsx";

// "자료실 열기" 버튼은 내부 resources 섹션으로 이동
const INTERNAL_BUTTONS = {
  "자료실 열기": "resources",
  "자료실로 이동": "resources",
};

const btnCls = "inline-flex min-h-10 items-center justify-center rounded-[9px] border border-[#C8D8FF] bg-white px-3.5 py-2 text-center text-sm font-semibold text-[#0D4EA6] transition hover:border-[#0D4EA6] hover:bg-[#EEF4FF] md:min-w-[128px]";
const secondaryBtnCls = "inline-flex min-h-10 items-center justify-center rounded-[9px] border border-[#DDEAE7] bg-white px-3.5 py-2 text-center text-sm font-semibold text-[#102047] transition hover:border-[#C8D8FF] hover:bg-[#F8FAFA] md:min-w-[128px]";

function getStatusChipClass(status) {
  const text = String(status || "").trim();
  if (text.includes("확인") || text.includes("예정") || text.includes("준비")) {
    return "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]";
  }
  if (text.includes("완료")) {
    return "border-[#BFEBDC] bg-[#F0FBF7] text-[#08754B]";
  }
  if (text.includes("중") || text.includes("자료")) {
    return "border-[#C8D8FF] bg-[#EEF4FF] text-[#3154A3]";
  }
  return "border-[#DDEAE7] bg-[#F8FAFA] text-[#627083]";
}

function StatusChip({ children }) {
  if (!children) return null;

  return (
    <span className={`inline-flex shrink-0 items-center rounded-[8px] border px-2 py-0.5 text-[11px] font-semibold ${getStatusChipClass(children)}`}>
      {children}
    </span>
  );
}

function getScheduleText(item) {
  const directSchedule = item.schedule || item.period || item.date || item.deadline;
  if (directSchedule) return directSchedule;
  return formatContentEndDate(item);
}

function DetailsDisclosure({ item }) {
  const details = Array.isArray(item.details) ? item.details.filter(Boolean) : [];
  const hasUpdateNotice = Boolean(item.updateNotice);
  if (!details.length && !hasUpdateNotice) return null;

  return (
    <details className="mt-2 text-xs leading-5 text-[#627083]">
      <summary className="cursor-pointer font-semibold text-[#0D4EA6]">
        검진 안내 보기
      </summary>
      <div className="mt-1.5 space-y-2 border-l border-[#DDEAE7] pl-3">
        {details.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {details.map((detail, i) => (
              <li key={i}>{detail}</li>
            ))}
          </ul>
        )}
        {hasUpdateNotice && (
          <p className="text-[#806018]">{item.updateNotice}</p>
        )}
      </div>
    </details>
  );
}

function parseDateBoundary(value, boundary) {
  const text = String(value || "").trim();
  if (!text) return null;

  const dateMatch = text.match(/^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return boundary === "end"
      ? new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999)
      : new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;

  return boundary === "end"
    ? new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 23, 59, 59, 999)
    : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
}

function isTbRegistrationPeriodOpen(tbConfig) {
  if (String(tbConfig?.enabled || "").trim().toUpperCase() !== "TRUE") return false;

  const now = new Date();
  const startDate = parseDateBoundary(tbConfig?.startDate, "start");
  const endDate = parseDateBoundary(tbConfig?.endDate, "end");

  if (startDate && now < startDate) return false;
  if (endDate && now > endDate) return false;
  return true;
}

function CheckupModal({ modal, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={modal.title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[16px] bg-white p-5 shadow-sm sm:max-w-3xl sm:rounded-[16px] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-bold text-[#102047]">{modal.title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 min-w-10 rounded-[10px] border border-[#DDEAE7] bg-white px-3 text-lg font-semibold text-[#627083]"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {modal.type === "image" ? (
          <>
            <div className="mt-4 overflow-hidden rounded-[12px] border border-[#DDEAE7] bg-[#F8FAFA]">
              <img
                src={modal.imageUrl}
                alt={`${modal.title} 안내 이미지`}
                className="max-h-[65vh] w-full object-contain"
              />
            </div>
            {isValidUrl(modal.downloadUrl) && (
              <a
                href={modal.downloadUrl.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className={`${btnCls} mt-4`}
              >
                원본 보기
              </a>
            )}
          </>
        ) : (
          <p className="mt-4 whitespace-pre-line rounded-[12px] border border-[#DDEAE7] bg-[#F8FAFA] p-4 text-sm leading-7 text-[#435061]" style={{ wordBreak: "keep-all" }}>
            {modal.message}
          </p>
        )}
      </div>
    </div>
  );
}

export default function CheckupSection({ items, tbConfig, isLoading = false, loadFailed = false, fallbackUsed = false }) {
  const navigate = useNavigate();
  const [tbRegistrationOpen, setTbRegistrationOpen] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const shouldShowTbRegistrationCard = isTbRegistrationPeriodOpen(tbConfig);

  const openPrimaryAction = (item) => {
    const configuredMode = String(item.displayMode || "link").trim().toLowerCase();
    const displayMode = item.title === "2·3학년 결핵검진 안내"
      ? (isValidUrl(item.imageUrl) ? "image" : "pending")
      : configuredMode;

    if (displayMode === "pending") {
      setActiveModal({
        type: "notice",
        title: item.title,
        message: item.updateNotice || "업데이트 준비 중입니다.",
      });
      return;
    }

    if (displayMode === "image" && isValidUrl(item.imageUrl)) {
      setActiveModal({
        type: "image",
        title: item.title,
        imageUrl: item.imageUrl,
        downloadUrl: item.downloadUrl,
      });
    }
  };

  const openLinkAction = (item, internalTarget) => {
    if (internalTarget) {
      navigate(`/${internalTarget}`);
      return;
    }
    if (isValidUrl(item.url)) {
      window.open(item.url.trim(), "_blank", "noopener,noreferrer");
    }
  };

  const runSecondaryAction = (item) => {
    const action = String(item.secondaryAction || "").trim().toLowerCase();

    if (action === "notice") {
      setActiveModal({
        type: "notice",
        title: item.secondaryText || item.title,
        message: item.copyText || item.updateNotice || "추가 안내가 준비 중입니다.",
      });
    }
  };

  return (
    <section id="checkup" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-8">
      <div className="border-b border-[#DDEAE7] pb-4">
        <h1 className="text-2xl font-bold leading-tight text-[#102047] md:text-[1.65rem]">
          검진·검사 안내
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#627083]">
          학교에서 진행되는 검진과 검사 일정을 확인합니다.
        </p>
      </div>

      <div className="mt-5 overflow-hidden rounded-[12px] border border-[#DDEAE7] bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-[#DDEAE7] px-4 py-3">
          <div>
            <h2 className="text-base font-bold text-[#102047]">검진·검사 항목</h2>
            <p className="mt-0.5 text-xs text-[#627083]">현재 안내 중인 검진·검사 일정</p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-[#627083]">
            {items.length + (shouldShowTbRegistrationCard ? 1 : 0)}개
          </span>
        </div>

        {isLoading && (
          <p className="px-4 py-5 text-sm font-semibold text-[#627083]">검진·검사 안내를 불러오는 중입니다.</p>
        )}

        {!isLoading && loadFailed && (
          <p className="px-4 py-5 text-sm font-semibold text-[#627083]">검진·검사 안내를 불러오지 못했습니다. 잠시 후 다시 확인해주세요.</p>
        )}

        {!isLoading && !loadFailed && items.map((item) => {
          const internalTarget = INTERNAL_BUTTONS[item.buttonText];
          const displayMode = String(item.displayMode || "link").trim().toLowerCase();
          const secondaryAction = String(item.secondaryAction || "").trim().toLowerCase();
          const isStudentTbSchedule = item.title === "2·3학년 결핵검진 안내";
          const effectiveDisplayMode = isStudentTbSchedule
            ? (isValidUrl(item.imageUrl) ? "image" : "pending")
            : displayMode;
          const primaryButtonText = isStudentTbSchedule
            ? (isValidUrl(item.imageUrl) ? "운영표 보기" : "운영표 업데이트 예정")
            : item.buttonText;
          const hasPrimaryModalAction =
            effectiveDisplayMode === "pending" ||
            (effectiveDisplayMode === "image" && isValidUrl(item.imageUrl));
          const statusText = item.operatingStatus || item.status;
          return (
            <article key={item.title} className="border-b border-[#DDEAE7] px-4 py-3.5 last:border-b-0 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4 md:py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip>{statusText}</StatusChip>
                  <span className="text-xs font-medium text-[#627083]">대상 · {item.target || "전체"}</span>
                  <span className="text-xs font-medium text-[#627083]">일정 · {getScheduleText(item)}</span>
                </div>

                <h3 className="mt-1.5 text-[15px] font-semibold leading-6 text-[#102047] md:text-base">
                  {item.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#627083] md:line-clamp-1">
                  {item.description}
                </p>
                <DetailsDisclosure item={item} />
              </div>

              <div className="mt-3 flex flex-wrap gap-2 md:mt-0 md:justify-end">
                {primaryButtonText && effectiveDisplayMode === "link" && (internalTarget || isValidUrl(item.url)) && (
                  <button type="button" onClick={() => openLinkAction(item, internalTarget)} className={btnCls}>
                    {primaryButtonText} →
                  </button>
                )}
                {primaryButtonText && hasPrimaryModalAction && (
                  <button type="button" onClick={() => openPrimaryAction(item)} className={btnCls}>
                    {primaryButtonText} →
                  </button>
                )}
                {item.secondaryText && secondaryAction === "notice" && (
                  <button type="button" onClick={() => runSecondaryAction(item)} className={secondaryBtnCls}>
                    {item.secondaryText} →
                  </button>
                )}
              </div>
            </article>
          );
        })}

        {!isLoading && !loadFailed && shouldShowTbRegistrationCard && (
          <article className="border-b border-[#DDEAE7] px-4 py-3.5 last:border-b-0 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4 md:py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip>신청 접수 중</StatusChip>
                <span className="text-xs font-medium text-[#627083]">대상 · 교직원</span>
                <span className="text-xs font-medium text-[#627083]">일정 · 접수기간 내</span>
              </div>
              <h3 className="mt-1.5 text-[15px] font-semibold leading-6 text-[#102047] md:text-base">교직원 결핵검진 유형 선택</h3>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#627083] md:line-clamp-1">
                학교 단체검진, 개별검진, 공단검진, 채용검진 대체 확인 중 해당 유형을 선택해 제출해주세요.
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 md:mt-0 md:justify-end">
              <button type="button" onClick={() => setTbRegistrationOpen(true)} className={btnCls}>
                유형 선택하기 →
              </button>
            </div>
          </article>
        )}
      </div>

      {tbRegistrationOpen && (
        <SubmitModal type="tb_registration" onClose={() => setTbRegistrationOpen(false)} tbConfig={tbConfig} />
      )}
      {activeModal && <CheckupModal modal={activeModal} onClose={() => setActiveModal(null)} />}
    </section>
  );
}
