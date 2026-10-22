import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, BookOpen, GraduationCap } from "lucide-react";
import { getUsageGuide } from "../data/usageGuides.js";

export function ContextHelp({ guide: guideKey, label = "이용 방법", icon = "book-open", showArrow = false, className = "" }) {
  const guide = typeof guideKey === "string" ? getUsageGuide(guideKey) : guideKey;
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        window.setTimeout(() => triggerRef.current?.focus(), 0);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialogRef.current.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")]
        .filter((element) => !element.disabled && element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!guide) return null;
  const GuideIcon = icon === "graduation-cap" ? GraduationCap : BookOpen;

  function close() {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border border-[#C8D8FF] bg-[#F8FAFF] px-3 py-2 text-xs font-semibold text-[#0D4EA6] transition hover:border-[#0D4EA6] hover:bg-[#EEF4FF] focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/10 ${className}`}
        aria-haspopup="dialog"
      >
        <GuideIcon aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
        {label}
        {showArrow ? <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={2} /> : null}
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end bg-[#102047]/35 p-0 sm:items-center sm:justify-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[88dvh] w-full overflow-y-auto rounded-t-[16px] border border-[#DDEAE7] bg-white shadow-[0_20px_60px_rgba(16,32,71,0.2)] sm:max-w-[620px] sm:rounded-[16px]"
          >
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#DDEAE7] bg-white p-4 sm:p-5">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#0D4EA6]">{guide.audience}</p>
                <h2 id={titleId} className="mt-1 text-lg font-bold text-[#102047]">{guide.title}</h2>
                <p className="mt-1 break-keep text-sm leading-6 text-[#627083]">{guide.intro}</p>
              </div>
              <button ref={closeRef} type="button" onClick={close} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[9px] border border-[#DDEAE7] bg-white text-lg text-[#102047] hover:border-[#0D4EA6] focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/10" aria-label="이용 안내 닫기">×</button>
            </header>
            <div className="space-y-5 p-4 sm:p-5">
              <ol className="divide-y divide-[#DDEAE7] border-y border-[#DDEAE7]">
                {guide.steps.map(([stepTitle, description], index) => (
                  <li key={stepTitle} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 py-3.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EEF4FF] text-xs font-bold text-[#0D4EA6]">{index + 1}</span>
                    <div><h3 className="text-sm font-semibold text-[#102047]">{stepTitle}</h3><p className="mt-1 break-keep text-sm leading-6 text-[#627083]">{description}</p></div>
                  </li>
                ))}
              </ol>
              <section aria-labelledby={`${titleId}-troubleshooting`}>
                <h3 id={`${titleId}-troubleshooting`} className="text-sm font-bold text-[#102047]">문제가 생겼을 때</h3>
                <dl className="mt-2 divide-y divide-[#DDEAE7] rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3">
                  {guide.troubleshooting.map(([problem, solution]) => (
                    <div key={problem} className="py-3"><dt className="text-sm font-semibold text-[#102047]">{problem}</dt><dd className="mt-1 break-keep text-sm leading-6 text-[#627083]">{solution}</dd></div>
                  ))}
                </dl>
              </section>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
