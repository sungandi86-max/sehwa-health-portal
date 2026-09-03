export const ACCESS_REQUEST_STAFF_TYPES = ["교사", "직원", "기타"];

const REAL_NAME_MIN_LENGTH = 2;

export function normalizeAccessRequestApplicant(input = {}) {
  const realName = typeof input.realName === "string" ? input.realName.trim() : "";
  const department = typeof input.department === "string" ? input.department.trim() : "";
  const staffType = typeof input.staffType === "string" ? input.staffType.trim() : "";

  if (realName.length < REAL_NAME_MIN_LENGTH) {
    return {
      applicant: null,
      message: "실명을 2글자 이상 입력해 주세요.",
    };
  }

  if (!ACCESS_REQUEST_STAFF_TYPES.includes(staffType)) {
    return {
      applicant: null,
      message: "교직원 구분을 선택해 주세요.",
    };
  }

  return {
    applicant: {
      realName,
      department: department || null,
      staffType,
    },
    message: "",
  };
}

export function getAccessRequestPosition(applicant) {
  const department = typeof applicant?.department === "string" ? applicant.department.trim() : "";
  const staffType = typeof applicant?.staffType === "string" ? applicant.staffType.trim() : "";

  if (department && staffType) return `${department} · ${staffType}`;
  return department || staffType || "교직원";
}
