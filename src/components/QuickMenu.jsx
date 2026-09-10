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
    card: "border-[#D7E8FF] bg-[#F1F7FF]",
    tile: "border-[#D7E8FF] bg-[#E4F1FF] text-[#0D4EA6]",
    cta: "text-[#3154A3]",
  },
  upload: {
    card: "border-[#D7F1E8] bg-[#F0FBF7]",
    tile: "border-[#C8F0E2] bg-[#DDF8EE] text-[#08754B]",
    cta: "text-[#08754B]",
  },
  checkup: {
    card: "border-[#E4DDFB] bg-[#F7F3FF]",
    tile: "border-[#DDD2FB] bg-[#EFE8FF] text-[#5B45C4]",
    cta: "text-[#5B45C4]",
  },
  education: {
    card: "border-[#F9D9E2] bg-[#FFF4F7]",
    tile: "border-[#F7C7D5] bg-[#FFE8EF] text-[#D13C55]",
    cta: "text-[#B4234F]",
  },
  homeroom: {
    card: "border-[#F7E0C2] bg-[#FFF8EF]",
    tile: "border-[#F4D6AB] bg-[#FFF0DB] text-[#D97706]",
    cta: "text-[#B45309]",
  },
  studentCare: {
    card: "border-[#D8F0D8] bg-[#F2FBF2]",
    tile: "border-[#C8EBC8] bg-[#E5F8E5] text-[#169A36]",
    cta: "text-[#169A36]",
  },
  resources: {
    card: "border-[#F5E4BF] bg-[#FFF9EA]",
    tile: "border-[#F0D898] bg-[#FFF1C8] text-[#D68A00]",
    cta: "text-[#B86F00]",
  },
  faq: {
    card: "border-[#DDDFF4] bg-[#F5F6FF]",
    tile: "border-[#D0D4EF] bg-[#EBEEFF] text-[#4F5BC4]",
    cta: "text-[#4F5BC4]",
  },
  default: {
    card: "border-[#DDEAE7] bg-white",
    tile: "border-[#DDEAE7] bg-[#F8FAFA] text-[#627083]",
    cta: "text-[#627083]",
  },
};

const PRIORITY_MENU_IDS = new Set(["today", "upload", "studentCare"]);

function MenuIcon({ id }) {
  if (id === "upload") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 3h7l4 4v14H7z" />
        <path d="M14 3v5h5" />
        <path d="M12 18v-6" />
        <path d="m9.5 14.5 2.5-2.5 2.5 2.5" />
      </svg>
    );
  }
  if (id === "checkup" || id === "studentCare") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="3.3" />
        <path d="M5 20c1.2-3.8 4-5.7 7-5.7s5.8 1.9 7 5.7" />
      </svg>
    );
  }
  if (id === "education" || id === "resources") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="5" width="16" height="14" rx="3" />
        <path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (id === "homeroom" || id === "faq") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 5h12v14H6z" />
        <path d="M9 9h6" />
        <path d="M9 13h4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
    <section className={`mx-auto w-full max-w-6xl px-3 sm:px-4 lg:max-w-[1280px] ${isPortalCompact ? "pb-3" : "pb-6 md:pb-10"} ${className}`}>
      <div className={`grid auto-rows-fr grid-cols-1 ${isPortalCompact ? "gap-3 sm:grid-cols-2 lg:grid-cols-4" : "gap-2.5 sm:gap-3 md:grid-cols-2 lg:grid-cols-4 lg:gap-4"}`}>
        {items.map((item) => {
          const tone = MENU_TONES[item.id] || MENU_TONES.default;
          const target = item.href || ROUTE_MAP[item.id] || "/";
          const isPriority = PRIORITY_MENU_IDS.has(item.id);
          return (
            <button
              key={item.id}
              onClick={() => navigate(target)}
              className={
                isPortalCompact
                  ? `group flex h-full min-h-[108px] min-w-0 flex-col rounded-[14px] border p-3 text-left shadow-[0_6px_16px_rgba(16,32,71,0.035)] transition hover:-translate-y-0.5 hover:border-[#C8D8FF] hover:shadow-[0_8px_20px_rgba(16,32,71,0.06)] focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/10 sm:min-h-[116px] sm:p-3.5 ${tone.card}`
                  : `group flex h-full min-h-32 min-w-0 flex-col rounded-[12px] border p-4 text-left shadow-none transition hover:border-[#C8D8FF] focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/10 sm:p-4 lg:min-h-36 ${tone.card}`
              }
            >
              <div className={`${isPortalCompact ? "mb-1.5 flex items-start justify-between gap-2" : "mb-2.5 flex items-start justify-between gap-3 sm:mb-3"}`}>
                <span className={
                  isPortalCompact
                    ? `grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border ${tone.tile}`
                    : `grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border ${tone.tile}`
                }>
                  <MenuIcon id={item.id} />
                </span>
                {isPortalCompact ? (
                  <span className={`text-sm font-semibold ${isPriority ? "text-[#0D4EA6]" : tone.cta}`}>→</span>
                ) : item.featured ? <Badge type="blue">핵심</Badge> : <span className={`text-base font-semibold ${tone.cta}`}>→</span>}
              </div>
              <h3 className={`${isPortalCompact ? "text-base font-semibold leading-6" : "text-[15px] font-semibold leading-5"} text-[#0F1F4B]`} style={{ wordBreak: "keep-all" }}>
                {item.title}
              </h3>
              <p className={`${isPortalCompact ? "mt-1.5 line-clamp-2 text-sm font-normal leading-5" : "menu-card-description mt-1.5 text-xs font-medium leading-5 sm:text-sm sm:leading-6"} text-slate-600`}>
                {item.description}
              </p>
              {!isPortalCompact && (
                <p className={`mt-auto flex items-center pt-3 text-xs font-semibold ${tone.cta}`}>
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
