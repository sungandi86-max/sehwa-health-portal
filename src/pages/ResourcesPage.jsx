import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ResourceSection from "../components/ResourceSection.jsx";
import { getActiveHealthResources } from "../lib/healthResources.js";

const DEV_PORTAL_API_FALLBACK = "https://sehwa-health-portal.vercel.app/api/portal";

async function fetchLegacyResources(signal) {
  const response = await fetch("/api/portal", { signal });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!contentType.includes("application/json") && import.meta.env.DEV) {
    return fetchLegacyResourcesFromUrl(`${DEV_PORTAL_API_FALLBACK}?preview=local`, signal);
  }

  const portal = await response.json();
  if (portal?.success === false || portal?.result === "error") {
    throw new Error(portal.message || "Portal API error");
  }

  return Array.isArray(portal?.resources) ? portal.resources : [];
}

async function fetchLegacyResourcesFromUrl(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`fallback HTTP ${response.status}`);

  const portal = await response.json();
  if (portal?.success === false || portal?.result === "error") {
    throw new Error(portal.message || "Portal API error");
  }

  return Array.isArray(portal?.resources) ? portal.resources : [];
}

export default function ResourcesPage({ items }) {
  const navigate = useNavigate();
  const [resources, setResources] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resourceLoadFailed, setResourceLoadFailed] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState(false);

  useEffect(() => {
    let shouldIgnore = false;
    const controller = new AbortController();

    async function loadResources() {
      setIsLoading(true);
      setFallbackUsed(false);
      try {
        const firestoreResources = await getActiveHealthResources();
        if (shouldIgnore) return;

        setResources(firestoreResources);
        setResourceLoadFailed(false);
        setIsLoading(false);
      } catch (error) {
        if (shouldIgnore) return;
        console.error("[resources] Firestore load failed", error);

        try {
          const legacyResources = await fetchLegacyResources(controller.signal);
          if (shouldIgnore) return;

          setResources(legacyResources);
          setResourceLoadFailed(legacyResources.length === 0);
          setFallbackUsed(true);
          setIsLoading(false);
        } catch (fallbackError) {
          if (shouldIgnore) return;
          if (fallbackError?.name !== "AbortError") {
            console.error("[resources] legacy fallback failed", fallbackError);
          }
          setResources(Array.isArray(items) ? items : []);
          setResourceLoadFailed(true);
          setIsLoading(false);
        }
      }
    }

    loadResources();

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
          className="mb-2 flex items-center gap-1 rounded-full px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-[#EAF3FF] hover:text-[#1A3B8B]"
        >
          ← 메인으로
        </button>
      </div>
      <ResourceSection
        items={resources}
        loadFailed={resourceLoadFailed}
        isLoading={isLoading}
        fallbackUsed={fallbackUsed}
      />
    </>
  );
}
