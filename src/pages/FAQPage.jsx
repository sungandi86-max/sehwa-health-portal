import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import FAQSection from "../components/FAQSection.jsx";
import { fetchPortalContent } from "../lib/portalContent.js";

export default function FAQPage() {
  const navigate = useNavigate();
  const [faqs, setFaqs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let shouldIgnore = false;
    const controller = new AbortController();

    async function loadFaqs() {
      setIsLoading(true);

      try {
        const portal = await fetchPortalContent("faq", controller.signal);
        if (shouldIgnore) return;

        setFaqs(Array.isArray(portal?.faqs) ? portal.faqs : []);
        setLoadFailed(false);
        setIsLoading(false);
      } catch (error) {
        if (shouldIgnore) return;
        if (error?.name !== "AbortError") {
          console.error("[faq] Sheet load failed", error);
        }
        setFaqs([]);
        setLoadFailed(true);
        setIsLoading(false);
      }
    }

    loadFaqs();

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
      <FAQSection
        items={faqs}
        isLoading={isLoading}
        loadFailed={loadFailed}
      />
    </>
  );
}
