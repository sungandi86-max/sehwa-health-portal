export const ROLE_LABELS = {
  staff: "교직원",
  homeroom: "담임교사",
  admin: "관리자",
  health_teacher: "보건교사",
};

export function getRoleLabel(role) {
  return ROLE_LABELS[role] || role;
}

export function getRoleLabels(roles) {
  return Array.isArray(roles) ? roles.map(getRoleLabel) : [];
}
