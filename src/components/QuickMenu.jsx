import { useNavigate } from "react-router-dom";
import { quickMenuItems } from "../data/fallbackData.js";
import { Badge } from "./ui.jsx";

const ROUTE_MAP = {
  today: "/today",
  upload: "/upload",
  checkup: "/checkup",
  education: "/education",
  homeroom: "/homeroom",
  studentCare: "/student-care",
  resources: "/resources",
  faq: "/faq",
};

const MENU_TONES = {
  today: {
    card: "border-[#CBD3FF] bg-[linear-gradient(145deg,#EEF1FF_0%,rgba(255,255,255,0.82)_58%,#F8FAFF_100%)]",
    tile: "bg-[linear-gradient(135deg,#6E72FF_0%,#4B50E6_48%,#243BC8_100%)] shadow-[#5B5FEF]/30",
    cta: "text-[#4B50E6]",
  },
  upload: {
    card: "border-[#BFEBD7] bg-[linear-gradient(145deg,#ECFBF3_0%,rgba(255,255,255,0.82)_58%,#F6FFFA_100%)]",
    tile: "bg-[linear-gradient(135deg,#5EDC9A_0%,#25B978_48%,#078B55_100%)] shadow-[#12A66A]/30",
    cta: "text-[#0E9F63]",
  },
  checkup: {
    card: "border-[#F8D7E5] bg-[linear-gradient(145deg,#FFF6FA_0%,rgba(255,255,255,0.88)_62%,#FFFFFF_100%)]",
    tile: "bg-[linear-gradient(135deg,#FF70B4_0%,#EF4590_48%,#C51F68_100%)] shadow-[#E2367F]/30",
    cta: "text-[#E2367F]",
  },
  education: {
    card: "border-[#D9CCFF] bg-[linear-gradient(145deg,#F4EFFF_0%,rgba(255,255,255,0.82)_58%,#F8FAFF_100%)]",
    tile: "bg-[linear-gradient(135deg,#9B73FF_0%,#7452EA_48%,#1556C7_100%)] shadow-[#7452EA]/30",
    cta: "text-[#6346D9]",
  },
  default: {
    card: "border-[rgba(120,140,180,0.14)] bg-[rgba(255,255,255,0.78)]",
    tile: "bg-[linear-gradient(135deg,#4FA2FF_0%,#277BEE_48%,#1556C7_100%)] shadow-[#1663D8]/20",
    cta: "text-[#183B8F]",
  },
};

function MenuIcon({ id }) {
  if (id === "upload") {
    return (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 3h7l4 4v14H7z" />
        <path d="M14 3v5h5" />
        <path d="M12 18v-6" />
        <path d="m9.5 14.5 2.5-2.5 2.5 2.5" />
      </svg>
    );
  }
  if (id === "checkup" || id === "studentCare") {
    return (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="3.3" />
        <path d="M5 20c1.2-3.8 4-5.7 7-5.7s5.8 1.9 7 5.7" />
      </svg>
    );
  }
  if (id === "education" || id === "resources") {
    return (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="5" width="16" height="14" rx="3" />
        <path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (id === "homeroom" || id === "faq") {
    return (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 5h12v14H6z" />
        <path d="M9 9h6" />
        <path d="M9 13h4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 5h5v5H5z" />
      <path d="M14 5h5v5h-5z" />
      <path d="M5 14h5v5H5z" />
      <path d="M15 15h4v4" />
      <path d="M14 19h.01" />
    </svg>
  );
}

export default function QuickMenu({ items = quickMenuItems, className = "", variant = "default" }) {
  const navigate = useNavigate();
  const isPortalCompact = variant === "portalCompact";

  return (
    <section className={`mx-auto w-full max-w-6xl px-3 sm:px-4 lg:max-w-[1280px] ${isPortalCompact ? "pb-2" : "pb-6 md:pb-10"} ${className}`}>
      <div className={`grid auto-rows-fr grid-cols-2 ${isPortalCompact ? "gap-2.5 lg:grid-cols-4" : "gap-2.5 sm:gap-3 lg:grid-cols-4 lg:gap-4"}`}>
        {items.map((item, index) => {
          const tone = MENU_TONES[item.id] || MENU_TONES.default;
          const isSecondary = index >= 4;
          const target = item.href || ROUTE_MAP[item.id] || "/";
          return (
            <button
              key={item.id}
              onClick={() => navigate(target)}
              className={
                isPortalCompact
                  ? "group flex h-full min-h-[124px] min-w-0 flex-col rounded-[16px] border border-[#DDEAE7] bg-white/95 p-3 text-left transition hover:-translate-y-0.5 hover:border-[#BFEBDC] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 sm:min-h-[140px] sm:p-4"
                  : `group flex h-full min-h-36 min-w-0 flex-col rounded-[24px] border p-4 text-left shadow-[var(--shh-shadow)] transition hover:-translate-y-0.5 hover:shadow-[var(--shh-shadow-hover)] sm:min-h-44 sm:rounded-[28px] sm:p-6 lg:min-h-48 ${isSecondary ? "lg:shadow-[0_10px_30px_rgba(30,41,59,0.045)]" : ""} ${tone.card}`
              }
            >
              <div className={`${isPortalCompact ? "mb-2 flex items-start justify-between gap-2" : "mb-2.5 flex items-start justify-between gap-3 sm:mb-3"}`}>
                <span className={
                  isPortalCompact
                    ? "grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[#F0FBF7] text-[#08754B]"
                    : `grid h-14 w-14 shrink-0 place-items-center rounded-[18px] text-white shadow-xl sm:h-16 sm:w-16 ${isSecondary ? "lg:opacity-90" : ""} ${tone.tile}`
                }>
                  <MenuIcon id={item.id} />
                </span>
                {isPortalCompact ? <span className="text-sm font-bold text-[#20A982]">→</span> : item.featured ? <Badge type="pink">핵심</Badge> : <span className={`text-2xl font-black ${tone.cta}`}>→</span>}
              </div>
              <h3 className={`${isPortalCompact ? "text-sm font-bold leading-5 sm:text-[15px]" : "text-base font-black leading-6 sm:text-lg"} text-[#0F1F4B]`} style={{ wordBreak: "keep-all" }}>
                {item.title}
              </h3>
              <p className={`${isPortalCompact ? "mt-1 line-clamp-2 text-xs font-medium leading-5" : "menu-card-description mt-1.5 text-xs font-medium leading-5 sm:text-sm sm:leading-6"} text-slate-600`}>
                {item.description}
              </p>
              {!isPortalCompact && (
                <p className={`mt-auto flex items-center pt-4 text-sm font-black ${tone.cta}`}>
                  열기 <span className="ml-1">→</span>
                </p>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
