import { useNavigate } from "react-router-dom";
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
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
        <button onClick={() => navigate("/")} className="flex min-w-0 items-center gap-2 text-left">
          <SchoolEmblem />
          <div className="min-w-0">
            <p className="text-xs font-extrabold leading-5 text-[#1A3B8B] sm:text-sm md:text-base">세화여자고등학교 온라인 보건실</p>
            <p className="hidden text-xs text-slate-500 md:block">교직원 공유용 보건업무 포털</p>
          </div>
        </button>
        <nav className="hidden items-center gap-2 md:flex">
          {quickMenuItems.slice(0, 5).map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(ROUTE_MAP[item.id] || "/")}
              className="rounded-full px-3 py-2 text-xs font-bold text-slate-600 hover:bg-[#EAF3FF] hover:text-[#1A3B8B]"
            >
              {item.title}
            </button>
          ))}
        </nav>
        <button
          onClick={() => navigate("/upload")}
          className="min-h-11 shrink-0 rounded-full bg-[#D94F70] px-3 py-2 text-xs font-bold text-white shadow-sm sm:px-4"
        >
          제출하기
        </button>
      </div>
    </header>
  );
}
