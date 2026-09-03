export const ACCESS_REQUEST_STAFF_TYPES = ["교사", "직원", "기타"];

export const ACCESS_REQUEST_DEPARTMENT_OPTIONS = {
  교사: [
    "교무교육과정부",
    "진로진학홍보부",
    "연구정보부",
    "창의인성부",
    "생활안전부",
    "1학년부",
    "2학년부",
    "3학년부",
  ],
  직원: ["행정실"],
  기타: ["기타"],
};

const REAL_NAME_MIN_LENGTH = 2;

export function getAccessRequestDepartmentOptions(staffType) {
  return ACCESS_REQUEST_DEPARTMENT_OPTIONS[staffType] || [];
}

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

  const departmentOptions = getAccessRequestDepartmentOptions(staffType);
  const normalizedDepartment = staffType === "기타" && !department ? "기타" : department;
  const hasValidDepartment =
    staffType === "기타" ? normalizedDepartment.length > 0 : departmentOptions.includes(normalizedDepartment);

  if (!hasValidDepartment) {
    return {
      applicant: null,
      message: "소속/부서를 선택해 주세요.",
    };
  }

  return {
    applicant: {
      realName,
      department: normalizedDepartment,
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
