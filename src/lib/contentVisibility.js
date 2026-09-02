export function toContentDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === "function") return value.toDate();

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isContentVisible(content, now = new Date()) {
  if (!content?.enabled) return false;

  const startAt = toContentDate(content.startAt);
  const endAt = toContentDate(content.endAt);
  const currentTime = now.getTime();

  if (startAt && currentTime < startAt.getTime()) return false;
  if (endAt && currentTime > endAt.getTime()) return false;

  return true;
}

export function formatContentEndDate(content) {
  const endAt = toContentDate(content?.endAt);
  if (!endAt) return "상시";

  return `${endAt.getFullYear()}-${String(endAt.getMonth() + 1).padStart(2, "0")}-${String(
    endAt.getDate()
  ).padStart(2, "0")}까지`;
}
