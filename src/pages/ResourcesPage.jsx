import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ResourceSection from "../components/ResourceSection.jsx";
import { fetchPortalContent } from "../lib/portalContent.js";

export default function ResourcesPage() {
  const navigate = useNavigate();
  const [resources, setResources] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resourceLoadFailed, setResourceLoadFailed] = useState(false);

  useEffect(() => {
    let shouldIgnore = false;
    const controller = new AbortController();

    async function loadResources() {
      setIsLoading(true);
      try {
        const portal = await fetchPortalContent("resources", controller.signal);
        if (shouldIgnore) return;

        setResources(Array.isArray(portal?.resources) ? portal.resources : []);
        setResourceLoadFailed(false);
        setIsLoading(false);
      } catch (error) {
        if (shouldIgnore) return;
        if (error?.name !== "AbortError") {
          console.error("[resources] Sheet load failed", error);
        }
        setResources([]);
        setResourceLoadFailed(true);
        setIsLoading(false);
      }
    }

    loadResources();

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
      <ResourceSection
        items={resources}
        loadFailed={resourceLoadFailed}
        isLoading={isLoading}
      />
    </>
  );
}
