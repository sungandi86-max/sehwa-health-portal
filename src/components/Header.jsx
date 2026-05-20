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
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <button onClick={() => navigate("/")} className="flex items-center gap-2 text-left">
          <SchoolEmblem />
          <div>
            <p className="text-sm font-extrabold text-[#1A3B8B] md:text-base">세화여고 온라인 보건실</p>
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
          className="rounded-full bg-[#D94F70] px-4 py-2 text-xs font-bold text-white shadow-sm"
        >
          제출하기
        </button>
      </div>
    </header>
  );
}
