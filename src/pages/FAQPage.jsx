import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import FAQSection from "../components/FAQSection.jsx";
import { getActiveFaqs } from "../lib/faqs.js";

const DEV_PORTAL_API_FALLBACK = "https://sehwa-health-portal.vercel.app/api/portal";

async function fetchLegacyFaqs(signal) {
  const response = await fetch("/api/portal", { signal });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!contentType.includes("application/json") && import.meta.env.DEV) {
    return fetchLegacyFaqsFromUrl(`${DEV_PORTAL_API_FALLBACK}?preview=local`, signal);
  }

  const portal = await response.json();
  if (portal?.success === false || portal?.result === "error") {
    throw new Error(portal.message || "Portal API error");
  }

  return Array.isArray(portal?.faqs) ? portal.faqs : [];
}

async function fetchLegacyFaqsFromUrl(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`fallback HTTP ${response.status}`);

  const portal = await response.json();
  if (portal?.success === false || portal?.result === "error") {
    throw new Error(portal.message || "Portal API error");
  }

  return Array.isArray(portal?.faqs) ? portal.faqs : [];
}

export default function FAQPage({ items }) {
  const navigate = useNavigate();
  const [faqs, setFaqs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState(false);

  useEffect(() => {
    let shouldIgnore = false;
    const controller = new AbortController();

    async function loadFaqs() {
      setIsLoading(true);
      setFallbackUsed(false);

      try {
        const firestoreFaqs = await getActiveFaqs();
        if (shouldIgnore) return;

        setFaqs(firestoreFaqs);
        setLoadFailed(false);
        setIsLoading(false);
      } catch (error) {
        if (shouldIgnore) return;
        console.error("[faq] Firestore load failed", error);

        try {
          const legacyFaqs = await fetchLegacyFaqs(controller.signal);
          if (shouldIgnore) return;

          setFaqs(legacyFaqs);
          setLoadFailed(legacyFaqs.length === 0);
          setFallbackUsed(true);
          setIsLoading(false);
        } catch (fallbackError) {
          if (shouldIgnore) return;
          if (fallbackError?.name !== "AbortError") {
            console.error("[faq] legacy fallback failed", fallbackError);
          }
          setFaqs(Array.isArray(items) ? items : []);
          setLoadFailed(true);
          setIsLoading(false);
        }
      }
    }

    loadFaqs();

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
      <FAQSection
        items={faqs}
        isLoading={isLoading}
        loadFailed={loadFailed}
        fallbackUsed={fallbackUsed}
      />
    </>
  );
}
