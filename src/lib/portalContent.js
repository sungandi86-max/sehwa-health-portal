const PORTAL_API_URL = "/api/portal";
const DEV_PORTAL_API_FALLBACK = "https://sehwa-health-portal.vercel.app/api/portal";
const SEOUL_TIME_ZONE = "Asia/Seoul";
const FIXED_TB_REGISTRATION_TYPE = "단체검진 신청";

function fetchNoStore(url, signal) {
  return fetch(url, { signal, cache: "no-store" });
}

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

function getSeoulDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function seoulDateBoundary(year, month, day, boundary) {
  const hour = boundary === "end" ? 23 : 0;
  const minute = boundary === "end" ? 59 : 0;
  const second = boundary === "end" ? 59 : 0;
  const millisecond = boundary === "end" ? 999 : 0;
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, second, millisecond));
}

function parsePortalDateBoundary(value, boundary) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const parts = getSeoulDateParts(value);
    return seoulDateBoundary(Number(parts.year), Number(parts.month), Number(parts.day), boundary);
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.replace(/\s+/g, " ");
  const localDateMatch = normalized.match(
    /^(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/,
  );
  if (localDateMatch) {
    const [, year, month, day] = localDateMatch;
    return seoulDateBoundary(Number(year), Number(month), Number(day), boundary);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  const parts = getSeoulDateParts(parsed);
  return seoulDateBoundary(Number(parts.year), Number(parts.month), Number(parts.day), boundary);
}

function isEnabledValue(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return ["TRUE", "Y", "YES", "1", "사용"].includes(normalized);
}

export function getTbRegistrationWindowState(tbConfig, now = new Date()) {
  if (!isEnabledValue(tbConfig?.enabled)) return "disabled";

  const startDate = parsePortalDateBoundary(tbConfig?.startDate, "start");
  const endDate = parsePortalDateBoundary(tbConfig?.endDate, "end");
  if (!startDate || !endDate) return "missing-period";

  const nowTime = now.getTime();
  if (nowTime < startDate.getTime()) return "before";
  if (nowTime > endDate.getTime()) return "closed";
  return "open";
}

export function isTbRegistrationWindowOpen(tbConfig, now = new Date()) {
  return getTbRegistrationWindowState(tbConfig, now) === "open";
}

export function getFixedTbRegistrationType() {
  return FIXED_TB_REGISTRATION_TYPE;
}

function isTbRegistrationUploadItem(item) {
  const text = [
    item?.uploadType,
    item?.type,
    item?.submissionType,
    item?.title,
    item?.documentType,
    item?.buttonText,
    item?.url,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    text.includes("tb_registration") ||
    text.includes("tb-registration") ||
    text.includes("tb_group") ||
    text.includes("교직원 결핵검진 단체검진") ||
    text.includes("단체검진 신청") ||
    text.includes("결핵검진 유형")
  );
}

export function filterPortalUploads(portal) {
  if (!Array.isArray(portal?.uploads)) return portal;

  const tbRegistrationOpen = isTbRegistrationWindowOpen(portal?.tbConfig);
  return {
    ...portal,
    uploads: portal.uploads.filter((item) => !isTbRegistrationUploadItem(item) || tbRegistrationOpen),
  };
}

export async function fetchPortalContent(type, signal) {
  const response = await fetchNoStore(portalContentUrl(type), signal);
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json") && import.meta.env.DEV) {
    const fallbackUrl = `${DEV_PORTAL_API_FALLBACK}?scope=fallback&type=${encodeURIComponent(type)}&preview=local`;
    const fallbackResponse = await fetchNoStore(fallbackUrl, signal);
    return readPortalJson(fallbackResponse, "fallback");
  }

  return readPortalJson(response, "portal");
}

export async function fetchPortalUploads(signal) {
  const response = await fetchNoStore(`${PORTAL_API_URL}?scope=upload`, signal);
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json") && import.meta.env.DEV) {
    const fallbackResponse = await fetchNoStore(`${DEV_PORTAL_API_FALLBACK}?scope=upload&preview=local`, signal);
    return filterPortalUploads(await readPortalJson(fallbackResponse, "fallback"));
  }

  return filterPortalUploads(await readPortalJson(response, "portal"));
}
