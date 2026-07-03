import { useLocation, useNavigate } from "react-router-dom";
import { quickMenuItems } from "../data/fallbackData.js";
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
  const isPublicUpload =
    location.pathname === "/upload" &&
    params.get("mode") === "public" &&
    params.get("type") === "tbreply";

  if (isPublicUpload) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-[rgba(120,140,180,0.14)] bg-white/78 shadow-[0_10px_30px_rgba(30,41,59,0.04)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-2.5">
        <button onClick={() => navigate("/")} className="flex min-w-0 items-center gap-2 text-left sm:gap-2.5">
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
          {quickMenuItems.slice(0, 5).map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(ROUTE_MAP[item.id] || "/")}
              className={`rounded-full px-2.5 py-1.5 text-xs font-bold transition ${
                location.pathname === ROUTE_MAP[item.id]
                  ? "bg-[#EEF1FF] text-[var(--shh-primary)]"
                  : "text-slate-600 hover:bg-[#EEF1FF] hover:text-[var(--shh-primary)]"
              }`}
            >
              {item.title}
            </button>
          ))}
        </nav>
        <button
          onClick={() => navigate("/admin")}
          className="min-h-10 shrink-0 rounded-full bg-[var(--shh-primary)] px-3 py-1.5 text-xs font-bold text-white shadow-[0_10px_24px_rgba(24,59,143,0.22)] transition hover:-translate-y-[1px] hover:shadow-[0_14px_30px_rgba(24,59,143,0.28)] sm:px-3.5"
        >
          관리자 로그인
        </button>
      </div>
    </header>
  );
}
