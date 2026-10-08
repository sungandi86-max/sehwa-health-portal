import { fetchPortalContent } from "./portalContent.js";

function normalizeOrder(value) {
  const order = Number(value);
  return Number.isFinite(order) ? order : 999;
}

function normalizeDetails(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split(/\r?\n|<br\s*\/?>/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sortCheckups(a, b) {
  if (a.order !== b.order) return a.order - b.order;
  return a.title.localeCompare(b.title, "ko");
}

export function normalizeCheckup(docSnapshot, index = 0) {
  const data = typeof docSnapshot.data === "function" ? docSnapshot.data() : docSnapshot;

  return {
    id: docSnapshot.id || data.title,
    title: data.title || "",
    description: data.description || "",
    target: data.target || null,
    status: data.status || null,
    operatingStatus: data.scheduleStatus || data.operatingStatus || null,
    scheduleStatus: data.scheduleStatus || data.operatingStatus || null,
    details: normalizeDetails(data.details),
    enabled: data.enabled !== false,
    startAt: data.startAt || null,
    endAt: data.endAt || null,
    linkUrl: data.primaryLink || data.linkUrl || data.url || null,
    linkLabel: data.primaryButtonLabel || data.linkLabel || data.buttonText || null,
    primaryButtonLabel: data.primaryButtonLabel || data.linkLabel || data.buttonText || null,
    primaryLink: data.primaryLink || data.linkUrl || data.url || null,
    buttonText: data.primaryButtonLabel || data.linkLabel || data.buttonText || null,
    url: data.primaryLink || data.linkUrl || data.url || null,
    displayMode: data.displayMode ? String(data.displayMode).trim().toLowerCase() : "link",
    imageUrl: data.imageUrl || null,
    downloadUrl: data.downloadUrl || null,
    secondaryButtonLabel: data.secondaryButtonLabel || data.secondaryText || null,
    secondaryText: data.secondaryButtonLabel || data.secondaryText || null,
    secondaryAction: data.secondaryAction ? String(data.secondaryAction).trim().toLowerCase() : null,
    copyText: data.copyText || null,
    updateNotice: data.updateNotice || null,
    order: normalizeOrder(data.order ?? index + 1),
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

export async function getAllCheckups() {
  const portal = await fetchPortalContent("checkups");
  return (portal.checkups || []).map(normalizeCheckup).sort(sortCheckups);
}

export async function getActiveCheckups() {
  return getAllCheckups();
}
