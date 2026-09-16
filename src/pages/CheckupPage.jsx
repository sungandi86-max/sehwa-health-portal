import { useEffect, useState } from "react";
import CheckupSection from "../components/CheckupSection.jsx";
import { PortalBackToHome } from "../components/PortalSubpageLayout.jsx";
import { fetchPortalContent, getCachedPortalContent } from "../lib/portalContent.js";

export default function CheckupPage({ tbConfig }) {
  const cachedPortal = getCachedPortalContent("checkups");
  const [checkups, setCheckups] = useState(() => (
    Array.isArray(cachedPortal?.checkups) ? cachedPortal.checkups : []
  ));
  const [effectiveTbConfig, setEffectiveTbConfig] = useState(cachedPortal?.tbConfig || tbConfig);
  const [isLoading, setIsLoading] = useState(!cachedPortal);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let shouldIgnore = false;
    const controller = new AbortController();

    async function loadCheckups() {
      if (!cachedPortal) setIsLoading(true);

      try {
        const portal = await fetchPortalContent("checkups", controller.signal, {
          forceRefresh: Boolean(cachedPortal),
        });
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
        setCheckups([]);
        setEffectiveTbConfig(tbConfig);
        setLoadFailed(true);
        setIsLoading(false);
      }
    }

    loadCheckups();

    return () => {
      shouldIgnore = true;
      controller.abort();
    };
  }, [tbConfig]);

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
      />
    </>
  );
}
