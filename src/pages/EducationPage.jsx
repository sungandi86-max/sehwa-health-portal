import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import EducationSection from "../components/EducationSection.jsx";
import { getActiveEducationResources } from "../lib/educationResources.js";

const DEV_PORTAL_API_FALLBACK = "https://sehwa-health-portal.vercel.app/api/portal";

async function fetchLegacyEducations(signal) {
  const response = await fetch("/api/portal", { signal });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!contentType.includes("application/json") && import.meta.env.DEV) {
    return fetchLegacyEducationsFromUrl(`${DEV_PORTAL_API_FALLBACK}?preview=local`, signal);
  }

  const portal = await response.json();
  if (portal?.success === false || portal?.result === "error") {
    throw new Error(portal.message || "Portal API error");
  }

  return Array.isArray(portal?.educations) ? portal.educations : [];
}

async function fetchLegacyEducationsFromUrl(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`fallback HTTP ${response.status}`);

  const portal = await response.json();
  if (portal?.success === false || portal?.result === "error") {
    throw new Error(portal.message || "Portal API error");
  }

  return Array.isArray(portal?.educations) ? portal.educations : [];
}

export default function EducationPage({ items }) {
  const navigate = useNavigate();
  const [educations, setEducations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState(false);

  useEffect(() => {
    let shouldIgnore = false;
    const controller = new AbortController();

    async function loadEducations() {
      setIsLoading(true);
      setFallbackUsed(false);

      try {
        const firestoreEducations = await getActiveEducationResources();
        if (shouldIgnore) return;

        setEducations(firestoreEducations);
        setLoadFailed(false);
        setIsLoading(false);
      } catch (error) {
        if (shouldIgnore) return;
        console.error("[education] Firestore load failed", error);

        try {
          const legacyEducations = await fetchLegacyEducations(controller.signal);
          if (shouldIgnore) return;

          setEducations(legacyEducations);
          setLoadFailed(legacyEducations.length === 0);
          setFallbackUsed(true);
          setIsLoading(false);
        } catch (fallbackError) {
          if (shouldIgnore) return;
          if (fallbackError?.name !== "AbortError") {
            console.error("[education] legacy fallback failed", fallbackError);
          }
          setEducations(Array.isArray(items) ? items : []);
          setLoadFailed(true);
          setIsLoading(false);
        }
      }
    }

    loadEducations();

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
      <EducationSection
        items={educations}
        isLoading={isLoading}
        loadFailed={loadFailed}
        fallbackUsed={fallbackUsed}
      />
    </>
  );
}
