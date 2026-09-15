const SEOUL_TIME_ZONE = "Asia/Seoul";

const DISABLED_VALUES = new Set([
  "FALSE",
  "N",
  "NO",
  "0",
  "미사용",
  "비활성",
  "비공개",
  "숨김",
]);

const VISIBILITY_KEYS = [
  "enabled",
  "visible",
  "active",
  "public",
  "isEnabled",
  "isVisible",
  "사용여부",
  "노출",
  "사용",
  "공개",
];

function getText(value) {
  return String(value ?? "").trim();
}

function getSeoulTodayParts(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function dateKey(year, month, day) {
  const normalized = new Date(Date.UTC(year, month - 1, day));
  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() !== month - 1 ||
    normalized.getUTCDate() !== day
  ) {
    return null;
  }

  return year * 10000 + month * 100 + day;
}

export function getPortalItemDateText(item) {
  return (
    getText(item?.schedule) ||
    getText(item?.period) ||
    getText(item?.date) ||
    getText(item?.deadline) ||
    getText(item?.dateLabel)
  );
}

export function getPortalItemDateRange(item, now = new Date()) {
  const text = getPortalItemDateText(item);
  if (!text) return null;

  const today = getSeoulTodayParts(now);
  const currentYear = Number(today.year);
  const matches = [];
  const coveredRanges = [];
  const abbreviatedRangePattern = /(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*[~～-]\s*(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일/g;
  let match;

  while ((match = abbreviatedRangePattern.exec(text)) !== null) {
    const startMonth = Number(match[1]);
    const startDay = Number(match[2]);
    const endMonth = Number(match[3] || match[1]);
    const endDay = Number(match[4]);
    const endYear = endMonth < startMonth ? currentYear + 1 : currentYear;
    const startKey = dateKey(currentYear, startMonth, startDay);
    const endKey = dateKey(endYear, endMonth, endDay);
    if (startKey && endKey) matches.push(startKey, endKey);
    coveredRanges.push([match.index, match.index + match[0].length]);
  }

  const fullDatePattern = /(\d{4})\s*(?:년|[./-])\s*(\d{1,2})\s*(?:월|[./-])\s*(\d{1,2})\s*일?/g;

  while ((match = fullDatePattern.exec(text)) !== null) {
    const overlapsRange = coveredRanges.some(([start, end]) => match.index >= start && match.index < end);
    if (overlapsRange) continue;

    const key = dateKey(Number(match[1]), Number(match[2]), Number(match[3]));
    if (key) matches.push(key);
    coveredRanges.push([match.index, match.index + match[0].length]);
  }

  const shortDatePattern = /(\d{1,2})\s*(?:월|[./])\s*(\d{1,2})\s*일?/g;
  while ((match = shortDatePattern.exec(text)) !== null) {
    const overlapsFullDate = coveredRanges.some(([start, end]) => match.index >= start && match.index < end);
    if (overlapsFullDate) continue;

    const key = dateKey(currentYear, Number(match[1]), Number(match[2]));
    if (key) matches.push(key);
  }

  if (matches.length === 0) return null;
  return {
    start: Math.min(...matches),
    end: Math.max(...matches),
  };
}

export function isPortalItemEnabled(item) {
  for (const key of VISIBILITY_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(item || {}, key)) continue;

    const normalized = getText(item[key]).toUpperCase();
    if (DISABLED_VALUES.has(normalized)) return false;
  }

  return true;
}

export function isCurrentPortalItem(item, now = new Date()) {
  if (!isPortalItemEnabled(item)) return false;

  const range = getPortalItemDateRange(item, now);
  if (!range) return true;

  const today = getSeoulTodayParts(now);
  const todayKey = dateKey(Number(today.year), Number(today.month), Number(today.day));
  return range.end >= todayKey;
}

export function filterCurrentPortalItems(items, now = new Date()) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => item?.title && isCurrentPortalItem(item, now));
}

export function buildHomeSchedules(groups, now = new Date(), limit = 6) {
  const seen = new Set();

  return groups
    .flat()
    .map((item, index) => ({
      item,
      index,
      dateText: getPortalItemDateText(item),
      range: getPortalItemDateRange(item, now),
    }))
    .filter(({ item, dateText }) => item?.title && dateText && isCurrentPortalItem(item, now))
    .filter(({ item, dateText }) => {
      const key = `${getText(item.title).replace(/\s+/g, " ").toLowerCase()}|${dateText.replace(/\s+/g, " ").toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      if (a.range && b.range) return a.range.start - b.range.start || a.index - b.index;
      if (a.range) return -1;
      if (b.range) return 1;
      return a.index - b.index;
    })
    .slice(0, limit)
    .map(({ item }) => item);
}
