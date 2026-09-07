import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CheckupSection from "../components/CheckupSection.jsx";
import { fetchPortalContent } from "../lib/portalContent.js";

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
        const portal = await fetchPortalContent("checkups", controller.signal);
        if (shouldIgnore) return;

        setCheckups(Array.isArray(portal?.checkups) ? portal.checkups : []);
        setEffectiveTbConfig(portal?.tbConfig || tbConfig);
        setLoadFailed(false);
        setIsLoading(false);
      } catch (error) {
        if (shouldIgnore) return;
        if (error?.name !== "AbortError") {
          console.error("[checkup] Sheet load failed", error);
        }
        setCheckups(Array.isArray(items) ? items : []);
        setEffectiveTbConfig(tbConfig);
        setLoadFailed(true);
        setFallbackUsed(Array.isArray(items) && items.length > 0);
        setIsLoading(false);
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
          className="mb-2 flex min-h-10 items-center gap-1 rounded-[10px] px-3 py-2 text-sm font-semibold text-[#627083] transition hover:bg-[#F3F8F6] hover:text-[#102047]"
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
