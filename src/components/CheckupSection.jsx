import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppCard, Badge, SectionTitle, isValidUrl } from "./ui.jsx";
import SubmitModal from "./SubmitModal.jsx";

// "자료실 열기" 버튼은 내부 resources 섹션으로 이동
const INTERNAL_BUTTONS = {
  "자료실 열기": "resources",
  "자료실로 이동": "resources",
};

const btnCls = "inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[#1A3B8B] px-5 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow-md md:w-auto";
const secondaryBtnCls = "inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-[#C9DFFF] bg-white px-5 py-3 text-center text-sm font-bold text-[#1A3B8B] shadow-sm transition hover:-translate-y-[1px] hover:bg-[#EAF3FF] md:w-auto";

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
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-3xl sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-xl font-extrabold text-[#1A3B8B]">{modal.title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-full bg-slate-100 px-3 text-lg font-bold text-slate-600"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {modal.type === "image" ? (
          <>
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-[#F7F9FC]">
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
          <p className="mt-4 whitespace-pre-line rounded-2xl bg-[#F7F9FC] p-4 text-sm leading-7 text-slate-700" style={{ wordBreak: "keep-all" }}>
            {modal.message}
          </p>
        )}
      </div>
    </div>
  );
}

export default function CheckupSection({ items, tbConfig }) {
  const navigate = useNavigate();
  const [tbRegistrationOpen, setTbRegistrationOpen] = useState(false);
  const [activeModal, setActiveModal] = useState(null);

  const tbBadge = tbConfig
    ? (tbConfig.endDate && new Date() > new Date(tbConfig.endDate)
        ? { type: "gray", label: "접수 마감" }
        : { type: "pink", label: "신청 접수 중" })
    : null;

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
    <section id="checkup" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-10">
      <SectionTitle
        eyebrow="CHECKUP"
        title="검진·검사 안내"
        description="1학년 건강검진, 2·3학년 결핵검진·소변검사, 교직원 결핵검진 안내를 모아둔 영역입니다."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {items.map((item) => {
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
          return (
            <AppCard key={item.title}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-extrabold text-[#263238]">{item.title}</h3>
                <Badge type="blue">{item.operatingStatus || item.status}</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
              <p className="mt-3 text-sm font-bold text-[#1A3B8B]">대상 · {item.target}</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                {(item.details || []).map((detail, i) => (
                  <li key={i}>• {detail}</li>
                ))}
              </ul>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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
            </AppCard>
          );
        })}

        {/* 교직원 결핵검진 유형 선택 카드 — config.enabled === "TRUE" 일 때만 표시 */}
        {tbConfig?.enabled === "TRUE" && (
          <AppCard>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-extrabold text-[#263238]">교직원 결핵검진 유형 선택</h3>
              <Badge type={tbBadge.type}>{tbBadge.label}</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              학교 단체검진, 개별검진, 공단검진, 채용검진 대체 확인 중 해당 유형을 선택해 제출해주세요.
            </p>
            <button onClick={() => setTbRegistrationOpen(true)} className={`${btnCls} mt-4`}>
              유형 선택하기
            </button>
          </AppCard>
        )}
      </div>

      {tbRegistrationOpen && (
        <SubmitModal type="tb_registration" onClose={() => setTbRegistrationOpen(false)} tbConfig={tbConfig} />
      )}
      {activeModal && <CheckupModal modal={activeModal} onClose={() => setActiveModal(null)} />}
    </section>
  );
}
