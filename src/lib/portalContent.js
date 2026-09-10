const PORTAL_API_URL = "/api/portal";
const DEV_PORTAL_API_FALLBACK = "https://sehwa-health-portal.vercel.app/api/portal";

function portalContentUrl(type) {
  const params = new URLSearchParams({
    scope: "fallback",
    type,
  });

  return `${PORTAL_API_URL}?${params.toString()}`;
}

async function readPortalJson(response, sourceLabel) {
  if (!response.ok) throw new Error(`${sourceLabel} HTTP ${response.status}`);

  const portal = await response.json();
  if (portal?.success === false || portal?.result === "error") {
    throw new Error(portal.message || "Portal API error");
  }

  return portal;
}

export async function fetchPortalContent(type, signal) {
  const response = await fetch(portalContentUrl(type), { signal });
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json") && import.meta.env.DEV) {
    const fallbackUrl = `${DEV_PORTAL_API_FALLBACK}?scope=fallback&type=${encodeURIComponent(type)}&preview=local`;
    const fallbackResponse = await fetch(fallbackUrl, { signal });
    return readPortalJson(fallbackResponse, "fallback");
  }

  return readPortalJson(response, "portal");
}

export async function fetchPortalUploads(signal) {
  const response = await fetch(`${PORTAL_API_URL}?scope=upload`, { signal });
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json") && import.meta.env.DEV) {
    const fallbackResponse = await fetch(`${DEV_PORTAL_API_FALLBACK}?scope=upload&preview=local`, { signal });
    return readPortalJson(fallbackResponse, "fallback");
  }

  return readPortalJson(response, "portal");
}
