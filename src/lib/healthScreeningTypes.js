import { CURRENT_SCHOOL_YEAR } from "../config/school.js";

export function canEditHealthScreeningYear(schoolYear = CURRENT_SCHOOL_YEAR) {
  return Number(schoolYear) === CURRENT_SCHOOL_YEAR;
}

export const SCREENING_TYPE_OPTIONS = [
  { value: "nhis", label: "공단검진" },
  { value: "employment", label: "채용검진" },
  { value: "none", label: "해당 없음" },
  { value: "other", label: "기타" },
];

export function isHealthScreeningTypeQaHost(hostname) {
  return hostname === "sehwa-health-portal-git-qa-sungandi86-maxs-projects.vercel.app";
}

export function screeningTypeLabel(value) {
  return SCREENING_TYPE_OPTIONS.find((option) => option.value === value)?.label || "미선택";
}

export function hasSelfScreeningConfirmation(item) {
  return Boolean(item?.selfChoice);
}

export function screeningConfirmationLabel(item) {
  return hasSelfScreeningConfirmation(item) ? "확인 완료" : "미확인";
}

export class HealthScreeningTypeError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "HealthScreeningTypeError";
    this.status = status;
  }
}

async function request({ schoolYear, scope = "self", signal, body }) {
  const { auth } = await import("./firebase.js");
  if (!auth.currentUser) throw new HealthScreeningTypeError("로그인 후 이용해주세요.", 401);
  let token;
  try { token = await auth.currentUser.getIdToken(); }
  catch { throw new HealthScreeningTypeError("로그인 상태를 확인하지 못했습니다. 다시 로그인해주세요.", 401); }
  const query = new URLSearchParams({ resource: "health-screening-types", schoolYear: String(schoolYear) });
  if (scope === "admin") query.set("scope", "admin");
  let response;
  try { response = await fetch(`/api/firebase/staff-directory?${query}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    signal,
    ...(body ? { body: JSON.stringify(body) } : {}),
  }); } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new HealthScreeningTypeError("서버에 연결하지 못했습니다. 연결 상태를 확인 후 다시 시도해주세요.", 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok !== true) {
    const message = response.status === 409 ? "다른 변경이 저장되었습니다. 최신 내용을 다시 확인해주세요."
      : response.status === 403 ? "이 건강검진 유형 정보를 이용할 권한이 없습니다."
      : response.status === 404 ? "건강검진 유형 정보를 이용할 수 없습니다."
      : "건강검진 유형 정보를 처리하지 못했습니다. 다시 시도해주세요.";
    throw new HealthScreeningTypeError(message, response.status);
  }
  return data;
}

export function loadHealthScreeningTypes({ schoolYear = CURRENT_SCHOOL_YEAR, scope = "self", signal } = {}) {
  return request({ schoolYear, scope, signal });
}

export function saveHealthScreeningType({ schoolYear, scope = "self", screeningType, staffId, expectedRevision }) {
  return request({ schoolYear, scope, body: {
    scope, schoolYear, screeningType, expectedRevision,
    ...(scope === "admin" ? { staffId } : {}),
  } });
}
