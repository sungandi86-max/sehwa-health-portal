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
    <section className={`mx-auto max-w-6xl px-3 pb-6 sm:px-4 md:pb-10 ${className}`}>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(ROUTE_MAP[item.id] || "/")}
            className={`min-h-32 min-w-0 rounded-2xl border p-3 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-md sm:min-h-40 sm:rounded-[24px] sm:p-5 ${
              item.featured ? "border-[#D94F70]/30 bg-[#FFF5F8]" : "border-slate-100 bg-white"
            }`}
          >
            <div className="mb-2 flex min-h-8 items-center justify-between sm:mb-4">
              <span className="text-2xl sm:text-3xl">{item.icon}</span>
              {item.featured && <Badge type="pink">핵심</Badge>}
            </div>
            <h3 className="text-sm font-extrabold leading-5 text-[#1A3B8B] sm:text-lg">{item.title}</h3>
            <p className="menu-card-description mt-1 text-xs leading-5 text-slate-600 sm:mt-2 sm:text-sm sm:leading-6">{item.description}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
