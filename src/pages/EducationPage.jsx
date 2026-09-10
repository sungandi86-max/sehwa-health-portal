import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import EducationSection from "../components/EducationSection.jsx";
import { fetchPortalContent } from "../lib/portalContent.js";

export default function EducationPage() {
  const navigate = useNavigate();
  const [educations, setEducations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let shouldIgnore = false;
    const controller = new AbortController();

    async function loadEducations() {
      setIsLoading(true);

      try {
        const portal = await fetchPortalContent("education", controller.signal);
        if (shouldIgnore) return;

        setEducations(Array.isArray(portal?.educations) ? portal.educations : []);
        setLoadFailed(false);
        setIsLoading(false);
      } catch (error) {
        if (shouldIgnore) return;
        if (error?.name !== "AbortError") {
          console.error("[education] Sheet load failed", error);
        }
        setEducations([]);
        setLoadFailed(true);
        setIsLoading(false);
      }
    }

    loadEducations();

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
      <EducationSection
        items={educations}
        isLoading={isLoading}
        loadFailed={loadFailed}
      />
    </>
  );
}
