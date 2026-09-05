import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SectionTitle, isValidUrl } from "./ui.jsx";
import SubmitModal from "./SubmitModal.jsx";

// "자료실 열기" 버튼은 내부 resources 섹션으로 이동
const INTERNAL_BUTTONS = {
  "자료실 열기": "resources",
  "자료실로 이동": "resources",
};

const btnCls = "inline-flex min-h-10 w-full items-center justify-center rounded-[10px] bg-[#0D4EA6] px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[#183B8F] md:w-auto";
const secondaryBtnCls = "inline-flex min-h-10 w-full items-center justify-center rounded-[10px] border border-[#C9DFFF] bg-white px-4 py-2.5 text-center text-sm font-semibold text-[#102047] transition hover:border-[#9DB7F0] hover:bg-[#F6FAFF] md:w-auto";

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
  return (
    <span className={`inline-flex shrink-0 items-center rounded-[8px] border px-2.5 py-1 text-xs font-semibold ${getStatusChipClass(children)}`}>
      {children}
    </span>
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
      <SectionTitle
        title="검진·검사 안내"
        description="1학년 건강검진, 2·3학년 결핵검진·소변검사, 교직원 결핵검진 안내를 모아둔 영역입니다."
      />

      <div className="overflow-hidden rounded-[12px] border border-[#DDEAE7] bg-white">
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
            <article key={item.title} className="border-b border-[#E8F0EE] px-3.5 py-3.5 last:border-b-0 md:px-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <h3 className="text-base font-bold leading-6 text-[#102047]">{item.title}</h3>
                    <StatusChip>{statusText}</StatusChip>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-[#102047]">대상 · {item.target}</p>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-[#627083]">{item.description}</p>
                  {!!(item.details || []).length && (
                    <details className="mt-2 text-xs leading-5 text-[#627083]">
                      <summary className="cursor-pointer font-semibold text-[#3154A3]">
                        세부 확인사항 보기
                      </summary>
                      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                        {(item.details || []).map((detail, i) => (
                          <li key={i}>{detail}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:justify-end">
                  {primaryButtonText && effectiveDisplayMode === "link" && (internalTarget || isValidUrl(item.url)) && (
                    <button type="button" onClick={() => openLinkAction(item, internalTarget)} className={btnCls}>
                      {primaryButtonText}
                    </button>
                  )}
                  {primaryButtonText && hasPrimaryModalAction && (
                    <button type="button" onClick={() => openPrimaryAction(item)} className={btnCls}>
                      {primaryButtonText}
                    </button>
                  )}
                  {item.secondaryText && secondaryAction === "notice" && (
                    <button type="button" onClick={() => runSecondaryAction(item)} className={secondaryBtnCls}>
                      {item.secondaryText}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}

        {/* 교직원 결핵검진 유형 선택 카드 — 사용 TRUE이고 접수기간 안일 때만 표시 */}
        {!isLoading && !loadFailed && shouldShowTbRegistrationCard && (
          <article className="border-b border-[#E8F0EE] px-3.5 py-3.5 last:border-b-0 md:px-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <h3 className="text-base font-bold leading-6 text-[#102047]">교직원 결핵검진 유형 선택</h3>
                  <StatusChip>신청 접수 중</StatusChip>
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-[#627083]">
                  학교 단체검진, 개별검진, 공단검진, 채용검진 대체 확인 중 해당 유형을 선택해 제출해주세요.
                </p>
              </div>
              <button onClick={() => setTbRegistrationOpen(true)} className={btnCls}>
                유형 선택하기
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
