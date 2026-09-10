import { Navigate, useSearchParams } from "react-router-dom";
import { PortalBackToHome } from "../components/PortalSubpageLayout.jsx";
import UploadCenter from "../components/UploadCenter.jsx";

export default function UploadPage({ items, tbConfig }) {
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
        <div className="mx-auto w-full max-w-[1280px] px-3 pt-4 sm:px-4 sm:pt-5">
          <PortalBackToHome />
        </div>
      )}
      <UploadCenter
        items={items}
        publicMode={isPublicTbReply}
        publicType={isPublicTbReply ? "tbreply" : ""}
        tbConfig={tbConfig}
      />
    </>
  );
}
