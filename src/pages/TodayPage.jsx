import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import TodaySection from "../components/TodaySection.jsx";
import { getActiveAnnouncements } from "../lib/announcements.js";

const DEV_PORTAL_API_FALLBACK = "https://sehwa-health-portal.vercel.app/api/portal";

async function fetchLegacyNotices(signal) {
  const response = await fetch("/api/portal?scope=fallback&type=today", { signal });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!contentType.includes("application/json") && import.meta.env.DEV) {
    return fetchLegacyNoticesFromUrl(`${DEV_PORTAL_API_FALLBACK}?scope=fallback&type=today&preview=local`, signal);
  }

  const portal = await response.json();
  if (portal?.success === false || portal?.result === "error") {
    throw new Error(portal.message || "Portal API error");
  }

  return Array.isArray(portal?.notices) ? portal.notices : [];
}

async function fetchLegacyNoticesFromUrl(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`fallback HTTP ${response.status}`);

  const portal = await response.json();
  if (portal?.success === false || portal?.result === "error") {
    throw new Error(portal.message || "Portal API error");
  }

  return Array.isArray(portal?.notices) ? portal.notices : [];
}

export default function TodayPage({ items }) {
  const navigate = useNavigate();
  const [notices, setNotices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState(false);

  useEffect(() => {
    let shouldIgnore = false;
    const controller = new AbortController();

    async function loadNotices() {
      setIsLoading(true);
      setFallbackUsed(false);

      try {
        const firestoreNotices = await getActiveAnnouncements();
        if (shouldIgnore) return;

        setNotices(firestoreNotices);
        setLoadFailed(false);
        setIsLoading(false);
      } catch (error) {
        if (shouldIgnore) return;
        console.error("[today] Firestore load failed", error);

        try {
          const legacyNotices = await fetchLegacyNotices(controller.signal);
          if (shouldIgnore) return;

          setNotices(legacyNotices);
          setLoadFailed(legacyNotices.length === 0);
          setFallbackUsed(true);
          setIsLoading(false);
        } catch (fallbackError) {
          if (shouldIgnore) return;
          if (fallbackError?.name !== "AbortError") {
            console.error("[today] legacy fallback failed", fallbackError);
          }
          setNotices(Array.isArray(items) ? items : []);
          setLoadFailed(true);
          setIsLoading(false);
        }
      }
    }

    loadNotices();

    return () => {
      shouldIgnore = true;
      controller.abort();
    };
  }, [items]);

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
        fallbackUsed={fallbackUsed}
      />
    </>
  );
}
