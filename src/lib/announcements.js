import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase.js";
import { formatContentEndDate, isContentVisible } from "./contentVisibility.js";

export const formatAnnouncementEndDate = formatContentEndDate;
export const isAnnouncementVisible = isContentVisible;

function normalizeOrder(value) {
  const order = Number(value);
  return Number.isFinite(order) ? order : 999;
}

function sortAnnouncements(a, b) {
  if (a.order !== b.order) return a.order - b.order;
  return a.title.localeCompare(b.title, "ko");
}

export function normalizeAnnouncement(docSnapshot) {
  const data = docSnapshot.data();
  const titleLines = [data.titleLine1, data.titleLine2].filter(Boolean);

  return {
    id: docSnapshot.id,
    title: data.title || "",
    titleLine1: data.titleLine1 || null,
    titleLine2: data.titleLine2 || null,
    titleLines,
    dateLabel: data.dateLabel || null,
    date: data.dateLabel || null,
    description: data.description || "",
    target: data.target || null,
    actionText: data.actionText || null,
    status: data.status || null,
    badgeType: data.badgeType || null,
    enabled: data.enabled === true,
    startAt: data.startAt || null,
    endAt: data.endAt || null,
    linkUrl: data.linkUrl || null,
    linkLabel: data.linkLabel || null,
    order: normalizeOrder(data.order),
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

export async function getAllAnnouncements() {
  const snapshot = await getDocs(collection(db, "announcements"));

  return snapshot.docs.map(normalizeAnnouncement).sort(sortAnnouncements);
}

export async function getActiveAnnouncements(now = new Date()) {
  const announcements = await getAllAnnouncements();

  return announcements.filter((announcement) => isContentVisible(announcement, now));
}
