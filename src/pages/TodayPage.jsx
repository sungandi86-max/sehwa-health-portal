import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import TodaySection from "../components/TodaySection.jsx";
import { fetchPortalContent } from "../lib/portalContent.js";

export default function TodayPage() {
  const navigate = useNavigate();
  const [notices, setNotices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let shouldIgnore = false;
    const controller = new AbortController();

    async function loadNotices() {
      setIsLoading(true);

      try {
        const portal = await fetchPortalContent("today", controller.signal);
        if (shouldIgnore) return;

        setNotices(Array.isArray(portal?.notices) ? portal.notices : []);
        setLoadFailed(false);
        setIsLoading(false);
      } catch (error) {
        if (shouldIgnore) return;
        if (error?.name !== "AbortError") {
          console.error("[today] Sheet load failed", error);
        }
        setNotices([]);
        setLoadFailed(true);
        setIsLoading(false);
      }
    }

    loadNotices();

    return () => {
      shouldIgnore = true;
      controller.abort();
    };
  }, []);

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
      <TodaySection
        items={notices}
        isLoading={isLoading}
        loadFailed={loadFailed}
      />
    </>
  );
}
