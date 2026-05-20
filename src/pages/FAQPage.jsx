import { useNavigate } from "react-router-dom";
import FAQSection from "../components/FAQSection.jsx";

export default function FAQPage({ items }) {
  const navigate = useNavigate();
  return (
    <>
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <button
          onClick={() => navigate("/")}
          className="mb-2 flex items-center gap-1 rounded-full px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-[#EAF3FF] hover:text-[#1A3B8B]"
        >
          ← 메인으로
        </button>
      </div>
      <FAQSection items={items} />
    </>
  );
}
