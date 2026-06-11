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

export default function QuickMenu({ items = quickMenuItems, className = "" }) {
  const navigate = useNavigate();
  return (
    <section className={`mx-auto w-full max-w-[1280px] px-3 pb-6 sm:px-4 md:pb-10 ${className}`}>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(ROUTE_MAP[item.id] || "/")}
            className={`min-h-36 min-w-0 rounded-2xl border p-3.5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-md sm:min-h-44 sm:rounded-[24px] sm:p-5 md:p-6 ${
              item.featured ? "border-[#D94F70]/30 bg-[#FFF5F8]" : "border-slate-100 bg-white"
            }`}
          >
            <div className="mb-2.5 flex min-h-8 items-center justify-between sm:mb-4">
              <span className="text-2xl sm:text-3xl">{item.icon}</span>
              {item.featured && <Badge type="pink">핵심</Badge>}
            </div>
            <h3 className="text-[0.95rem] font-extrabold leading-5 text-[#1A3B8B] sm:text-lg">{item.title}</h3>
            <p className="menu-card-description mt-1.5 text-xs leading-5 text-slate-600 sm:mt-2 sm:text-[0.95rem] sm:leading-6">{item.description}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
