export function trainingAttendanceCounts(counts = {}) {
  const target = Number(counts.target) || 0;
  const signed = Number(counts.signed) || 0;
  const excluded = Number(counts.excluded) || 0;
  const manual = Number(counts.manual) || 0;
  return { target, signed, missing: Math.max(0, target - signed - manual), excluded, ...(counts.manual !== undefined ? {manual,attended:signed+manual} : {}) };
}

export function recentTrainingAttendance(rows = [], limit = 5) {
  return rows
    .filter((row) => row.status === "서명 완료" && Number.isFinite(Date.parse(row.signedAt)))
    .sort((left, right) => Date.parse(right.signedAt) - Date.parse(left.signedAt))
    .slice(0, limit);
}

export function formatTrainingDateTime(value, options = {}) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value || "기록 없음";
  const includeDate = !options.timeOnly;
  const includeTime = !options.dateOnly;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: includeDate ? "numeric" : undefined,
    month: includeDate ? "2-digit" : undefined,
    day: includeDate ? "2-digit" : undefined,
    hour: includeTime ? "2-digit" : undefined,
    minute: includeTime ? "2-digit" : undefined,
    second: includeTime ? "2-digit" : undefined,
    hour12: false,
  }).format(new Date(parsed));
}
