import { useEffect, useState } from "react";
import CheckupSection from "../components/CheckupSection.jsx";
import { PortalBackToHome } from "../components/PortalSubpageLayout.jsx";
import { fetchPortalContent } from "../lib/portalContent.js";

export default function CheckupPage({ items, tbConfig }) {
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
      <div className="mx-auto w-full max-w-[1280px] px-3 pt-4 sm:px-4 sm:pt-5">
        <PortalBackToHome />
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
