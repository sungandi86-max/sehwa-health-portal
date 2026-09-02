import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase.js";
import { isContentVisible } from "./contentVisibility.js";

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

export function normalizeCheckup(docSnapshot) {
  const data = docSnapshot.data();

  return {
    id: docSnapshot.id,
    title: data.title || "",
    description: data.description || "",
    target: data.target || null,
    status: data.status || null,
    operatingStatus: data.operatingStatus || null,
    details: normalizeDetails(data.details),
    enabled: data.enabled === true,
    startAt: data.startAt || null,
    endAt: data.endAt || null,
    linkUrl: data.linkUrl || null,
    linkLabel: data.linkLabel || data.buttonText || null,
    displayMode: data.displayMode || "link",
    imageUrl: data.imageUrl || null,
    downloadUrl: data.downloadUrl || null,
    order: normalizeOrder(data.order),
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

export async function getAllCheckups() {
  const snapshot = await getDocs(collection(db, "checkups"));

  return snapshot.docs.map(normalizeCheckup).sort(sortCheckups);
}

export async function getActiveCheckups(now = new Date()) {
  const checkups = await getAllCheckups();

  return checkups.filter((checkup) => isContentVisible(checkup, now));
}
