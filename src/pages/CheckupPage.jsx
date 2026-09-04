import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CheckupSection from "../components/CheckupSection.jsx";
import { getActiveCheckups } from "../lib/checkups.js";

const DEV_PORTAL_API_FALLBACK = "https://sehwa-health-portal.vercel.app/api/portal";

async function fetchLegacyCheckups(signal) {
  const response = await fetch("/api/portal?scope=fallback&type=checkups", { signal });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!contentType.includes("application/json") && import.meta.env.DEV) {
    return fetchLegacyCheckupsFromUrl(`${DEV_PORTAL_API_FALLBACK}?scope=fallback&type=checkups&preview=local`, signal);
  }

  const portal = await response.json();
  if (portal?.success === false || portal?.result === "error") {
    throw new Error(portal.message || "Portal API error");
  }

  return {
    checkups: Array.isArray(portal?.checkups) ? portal.checkups : [],
    tbConfig: portal?.tbConfig || null,
  };
}

async function fetchLegacyCheckupsFromUrl(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`fallback HTTP ${response.status}`);

  const portal = await response.json();
  if (portal?.success === false || portal?.result === "error") {
    throw new Error(portal.message || "Portal API error");
  }

  return {
    checkups: Array.isArray(portal?.checkups) ? portal.checkups : [],
    tbConfig: portal?.tbConfig || null,
  };
}

export default function CheckupPage({ items, tbConfig }) {
  const navigate = useNavigate();
  const [checkups, setCheckups] = useState([]);
  const [effectiveTbConfig, setEffectiveTbConfig] = useState(tbConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState(false);

  useEffect(() => {
    let shouldIgnore = false;
    const controller = new AbortController();

    async function loadCheckups() {
      setIsLoading(true);
      setFallbackUsed(false);

      try {
        const firestoreCheckups = await getActiveCheckups();
        if (shouldIgnore) return;

        setCheckups(firestoreCheckups);
        setEffectiveTbConfig(tbConfig);
        setLoadFailed(false);
        setIsLoading(false);
      } catch (error) {
        if (shouldIgnore) return;
        console.error("[checkup] Firestore load failed", error);

        try {
          const legacy = await fetchLegacyCheckups(controller.signal);
          if (shouldIgnore) return;

          setCheckups(legacy.checkups);
          setEffectiveTbConfig(legacy.tbConfig || tbConfig);
          setLoadFailed(legacy.checkups.length === 0);
          setFallbackUsed(true);
          setIsLoading(false);
        } catch (fallbackError) {
          if (shouldIgnore) return;
          if (fallbackError?.name !== "AbortError") {
            console.error("[checkup] legacy fallback failed", fallbackError);
          }
          setCheckups(Array.isArray(items) ? items : []);
          setEffectiveTbConfig(tbConfig);
          setLoadFailed(true);
          setIsLoading(false);
        }
      }
    }

    loadCheckups();

    return () => {
      shouldIgnore = true;
      controller.abort();
    };
  }, [items, tbConfig]);

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
      <CheckupSection
        items={checkups}
        tbConfig={effectiveTbConfig}
        isLoading={isLoading}
        loadFailed={loadFailed}
        fallbackUsed={fallbackUsed}
      />
    </>
  );
}
