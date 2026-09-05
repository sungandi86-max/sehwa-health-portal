import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import UploadCenter from "../components/UploadCenter.jsx";

export default function UploadPage({ items }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPublicTbReply =
    searchParams.get("mode") === "public" &&
    searchParams.get("type") === "tbreply";
  const legacyInfectionType = ["infection", "infection_report", "infectionreport"].includes(
    String(searchParams.get("type") || "").trim().toLowerCase()
  );

  if (legacyInfectionType) {
    return <Navigate to="/firebase-submit/infection" replace />;
  }

  return (
    <>
      {!isPublicTbReply && (
        <div className="mx-auto max-w-6xl px-4 pt-6">
          <button
            onClick={() => navigate("/")}
            className="mb-2 flex min-h-10 items-center gap-1 rounded-[10px] px-3 py-2 text-sm font-semibold text-[#627083] transition hover:bg-[#F3F8F6] hover:text-[#102047]"
          >
            ← 메인으로
          </button>
        </div>
      )}
      <UploadCenter items={items} publicMode={isPublicTbReply} publicType={isPublicTbReply ? "tbreply" : ""} />
    </>
  );
}
