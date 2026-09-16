import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { PortalBackToHome } from "../components/PortalSubpageLayout.jsx";
import UploadCenter from "../components/UploadCenter.jsx";
import { fetchPortalUploads, getCachedPortalUploads } from "../lib/portalContent.js";

export default function UploadPage() {
  const [searchParams] = useSearchParams();
  const cachedPortal = getCachedPortalUploads();
  const [portal, setPortal] = useState(cachedPortal);
  const [loadState, setLoadState] = useState(cachedPortal ? "ready" : "loading");
  const isPublicTbReply =
    searchParams.get("mode") === "public" &&
    searchParams.get("type") === "tbreply";
  const legacyInfectionType = ["infection", "infection_report", "infectionreport"].includes(
    String(searchParams.get("type") || "").trim().toLowerCase(),
  );

  useEffect(() => {
    let shouldIgnore = false;
    let activeController = null;

    async function loadUploads(forceRefresh = false) {
      activeController?.abort();
      activeController = new AbortController();

      try {
        const nextPortal = await fetchPortalUploads(activeController.signal, { forceRefresh });
        if (shouldIgnore) return;
        setPortal(nextPortal);
        setLoadState("ready");
      } catch (error) {
        if (shouldIgnore || error?.name === "AbortError") return;
        console.error("[upload] Sheet load failed", error);
        if (!getCachedPortalUploads()) setLoadState("error");
      }
    }

    loadUploads();
    const handleFocus = () => loadUploads(true);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") loadUploads(true);
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      shouldIgnore = true;
      activeController?.abort();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

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
        items={portal?.uploads || []}
        publicMode={isPublicTbReply}
        publicType={isPublicTbReply ? "tbreply" : ""}
        tbConfig={portal?.tbConfig || null}
        isLoading={loadState === "loading"}
        loadFailed={loadState === "error"}
      />
    </>
  );
}
