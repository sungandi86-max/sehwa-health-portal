import { quickMenuItems } from "../data/fallbackData.js";
import { Badge, scrollToSection } from "./ui.jsx";

export default function QuickMenu() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-10">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {quickMenuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => scrollToSection(item.id)}
            className={`rounded-[24px] border p-5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-md ${
              item.featured ? "border-[#D94F70]/30 bg-[#FFF5F8]" : "border-slate-100 bg-white"
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-3xl">{item.icon}</span>
              {item.featured && <Badge type="pink">핵심</Badge>}
            </div>
            <h3 className="text-lg font-extrabold text-[#1A3B8B]">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
