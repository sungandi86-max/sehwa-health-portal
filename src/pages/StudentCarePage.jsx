import { useNavigate } from "react-router-dom";
import StudentCareSection from "../components/StudentCareSection.jsx";

export default function StudentCarePage({ items }) {
  const navigate = useNavigate();
  return (
    <>
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <button
          onClick={() => navigate("/")}
          className="mb-2 flex min-h-10 items-center gap-1 rounded-[10px] px-3 py-2 text-sm font-semibold text-[#627083] transition hover:bg-[#F3F8F6] hover:text-[#102047]"
        >
          ← 메인으로
        </button>
      </div>
      <StudentCareSection items={items} />
    </>
  );
}
