import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function useDeferredHashNavigation(readyKey) {
  const { hash } = useLocation();

  useEffect(() => {
    const targetId = hash.startsWith("#") ? hash.slice(1) : "";
    if (!targetId) return undefined;

    let cancelled = false;
    let frameId = 0;
    let attempts = 0;

    const moveToTarget = () => {
      if (cancelled) return;
      const target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        if (typeof target.focus === "function") target.focus({ preventScroll: true });
        return;
      }
      attempts += 1;
      if (attempts < 30) frameId = window.requestAnimationFrame(moveToTarget);
    };

    frameId = window.requestAnimationFrame(moveToTarget);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [hash, readyKey]);
}
