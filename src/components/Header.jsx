import { useLocation, useNavigate } from "react-router-dom";
import { quickMenuItems } from "../data/fallbackData.js";
import { firebaseV2MenuItems } from "../data/firebaseV2Navigation.js";
import { SchoolEmblem } from "./ui.jsx";

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

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const isFirebaseV2 = location.pathname.startsWith("/firebase");
  const isOperationalEntry = isFirebaseV2 || location.pathname === "/";
  const isPublicUpload =
    location.pathname === "/upload" &&
    params.get("mode") === "public" &&
    params.get("type") === "tbreply";

  if (isPublicUpload) return null;

  const navItems = isOperationalEntry ? firebaseV2MenuItems : quickMenuItems.slice(0, 5);

  return (
    <header className="sticky top-0 z-50 border-b border-[rgba(120,140,180,0.14)] bg-white/78 shadow-[0_10px_30px_rgba(30,41,59,0.04)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-2.5">
        <button
          onClick={() => navigate("/")}
          className={`flex min-w-0 items-center gap-2 text-left sm:gap-2.5 ${
            isOperationalEntry ? "min-h-10" : ""
          }`}
        >
          <SchoolEmblem />
          <div className="min-w-0 pt-0.5">
            <p className="truncate text-xs font-black leading-[1.15] text-[#1A3B8B] sm:text-sm md:text-[0.95rem]">
              세화여자고등학교 온라인 보건실
            </p>
            <p className="mt-0.5 hidden text-[0.7rem] font-semibold leading-4 text-slate-500 md:block">
              교직원 공유용 보건업무 포털
            </p>
          </div>
        </button>
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => {
            const target = item.href || ROUTE_MAP[item.id] || "/";
            return (
            <button
              key={item.id}
              onClick={() => navigate(target)}
              className={`rounded-full px-2.5 py-1.5 text-xs font-bold transition ${
                isOperationalEntry ? "min-h-10" : ""
              } ${
                location.pathname === target
                  ? "bg-[#EEF1FF] text-[var(--shh-primary)]"
                  : "text-slate-600 hover:bg-[#EEF1FF] hover:text-[var(--shh-primary)]"
              }`}
            >
              {item.title}
            </button>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-1.5">
          {isOperationalEntry && (
            <button
              onClick={() => navigate("/firebase-submissions")}
              className="min-h-10 rounded-full bg-[#20A982] px-3 py-1.5 text-xs font-bold text-white shadow-[0_10px_24px_rgba(32,169,130,0.18)] transition hover:-translate-y-[1px] hover:bg-[#178C6C] sm:px-3.5"
            >
              교직원 로그인
            </button>
          )}
          <button
            onClick={() => navigate(isOperationalEntry ? "/firebase-dashboard" : "/admin")}
            className={`min-h-10 rounded-full px-3 py-1.5 text-xs font-bold transition hover:-translate-y-[1px] sm:px-3.5 ${
              isOperationalEntry
                ? "border border-[#DDEAE7] bg-white text-[#102047]"
                : "bg-[var(--shh-primary)] text-white shadow-[0_10px_24px_rgba(24,59,143,0.22)] hover:shadow-[0_14px_30px_rgba(24,59,143,0.28)]"
            }`}
          >
            {isOperationalEntry ? "관리자" : "관리자 로그인"}
          </button>
        </div>
      </div>
    </header>
  );
}
