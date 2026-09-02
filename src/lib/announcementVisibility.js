export function toAnnouncementDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === "function") return value.toDate();

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isAnnouncementVisible(announcement, now = new Date()) {
  if (!announcement?.enabled) return false;

  const startAt = toAnnouncementDate(announcement.startAt);
  const endAt = toAnnouncementDate(announcement.endAt);
  const currentTime = now.getTime();

  if (startAt && currentTime < startAt.getTime()) return false;
  if (endAt && currentTime > endAt.getTime()) return false;

  return true;
}

export function formatAnnouncementEndDate(announcement) {
  const endAt = toAnnouncementDate(announcement?.endAt);
  if (!endAt) return "상시";

  return `${endAt.getFullYear()}-${String(endAt.getMonth() + 1).padStart(2, "0")}-${String(
    endAt.getDate()
  ).padStart(2, "0")}까지`;
}
