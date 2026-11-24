const SESSION_STATUSES = new Set(["draft", "scheduled", "inProgress", "completed", "archived"]);
const EXAM_TYPES = new Set(["urine", "tuberculosis", "general", "other"]);
const CLASS_STATUSES = new Set(["waiting", "active", "completed", "missing"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const HEALTH_CHECK_EXAM_LABELS = Object.freeze({
  urine: "소변검사",
  tuberculosis: "결핵검진",
  general: "건강검진",
  other: "별도검사",
});

export const HEALTH_CHECK_SESSION_LABELS = Object.freeze({
  draft: "일정 준비 중",
  scheduled: "진행 예정",
  inProgress: "진행 중",
  completed: "종료",
  archived: "종료",
});

export const HEALTH_CHECK_CLASS_LABELS = Object.freeze({
  waiting: "대기",
  active: "진행 중",
  completed: "완료",
  missing: "추후 확인",
});

function toIsoTimestamp(value) {
  try {
    if (value && typeof value.toDate === "function") return value.toDate().toISOString();
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  } catch {
    return "";
  }
  return "";
}

export function normalizeHealthCheckSession(documentId, value, { expectedSchoolKey = "" } = {}) {
  if (!value || typeof value !== "object" || value.sessionId !== documentId) return null;
  if (expectedSchoolKey && value.schoolKey !== expectedSchoolKey) return null;
  if (!EXAM_TYPES.has(value.examType) || !SESSION_STATUSES.has(value.status)) return null;
  if (typeof value.examDate !== "string" || !DATE_PATTERN.test(value.examDate)) return null;
  if (typeof value.location !== "string" || value.location.length > 100) return null;

  return {
    sessionId: documentId,
    examType: value.examType,
    examDate: value.examDate,
    location: value.location,
    status: value.status,
    updatedAt: toIsoTimestamp(value.updatedAt),
  };
}

export function normalizeHealthCheckClass(sessionId, documentId, value) {
  if (!value || typeof value !== "object" || value.sessionId !== sessionId || value.classId !== documentId) return null;
  if (!Number.isInteger(value.order) || value.order < 1 || value.order > 200) return null;
  if (typeof value.scheduledTime !== "string" || (value.scheduledTime && !TIME_PATTERN.test(value.scheduledTime))) return null;
  if (!CLASS_STATUSES.has(value.displayStatus)) return null;

  return {
    classId: documentId,
    order: value.order,
    scheduledTime: value.scheduledTime,
    displayStatus: value.displayStatus,
    updatedAt: toIsoTimestamp(value.updatedAt),
  };
}

export function sortHealthCheckClasses(classes) {
  return [...classes].sort((a, b) => a.order - b.order
    || a.scheduledTime.localeCompare(b.scheduledTime)
    || a.classId.localeCompare(b.classId, "ko", { numeric: true }));
}

export function selectDefaultHealthCheckSession(sessions, today = new Date().toISOString().slice(0, 10)) {
  if (!sessions.length) return null;
  const active = sessions.find((session) => session.status === "inProgress");
  if (active) return active;

  const upcoming = sessions
    .filter((session) => ["draft", "scheduled"].includes(session.status) && session.examDate >= today)
    .sort((a, b) => a.examDate.localeCompare(b.examDate))[0];
  if (upcoming) return upcoming;

  return [...sessions].sort((a, b) => b.examDate.localeCompare(a.examDate))[0];
}

export function deriveHealthCheckProgress(classes) {
  const ordered = sortHealthCheckClasses(classes);
  const current = ordered.find((item) => item.displayStatus === "active") || null;
  const next = ordered.find((item) => item.displayStatus === "waiting" && (!current || item.order > current.order))
    || ordered.find((item) => item.displayStatus === "waiting")
    || null;
  return { current, next };
}

export function getHealthCheckScheduleFreshness(session, now = new Date()) {
  const updatedAt = session?.updatedAt ? new Date(session.updatedAt) : null;
  if (!updatedAt || Number.isNaN(updatedAt.getTime())) return { status: "unknown", ageMinutes: null };
  const ageMinutes = Math.max(0, Math.floor((now.getTime() - updatedAt.getTime()) / 60_000));
  const staleAfterMinutes = session.status === "inProgress" ? 5 : 60;
  return { status: ageMinutes > staleAfterMinutes ? "stale" : "fresh", ageMinutes };
}

export function getLatestHealthCheckUpdate(session, classes) {
  const timestamps = [session?.updatedAt, ...classes.map((item) => item.updatedAt)]
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()));
  if (!timestamps.length) return "";
  return new Date(Math.max(...timestamps.map((value) => value.getTime()))).toISOString();
}
