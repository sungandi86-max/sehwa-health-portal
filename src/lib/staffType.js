function normalizeText(value) {
  return String(value ?? "").trim();
}

function hasRole(assignment, role) {
  return Array.isArray(assignment?.roles) && assignment.roles.includes(role);
}

function includesAny(value, keywords) {
  return keywords.some((keyword) => value.includes(keyword));
}

export function inferSubmissionStaffType({ assignment, identity } = {}) {
  if (hasRole(assignment, "health_teacher") || hasRole(assignment, "homeroom")) {
    return "교사";
  }

  const position = [assignment?.position, identity?.position].map(normalizeText).filter(Boolean).join(" ");
  const department = [assignment?.department, identity?.department].map(normalizeText).filter(Boolean).join(" ");
  const joined = `${position} ${department}`;

  if (includesAny(position, ["시간강사", "강사"])) return "강사";
  if (includesAny(joined, ["행정직원", "행정직", "일반직", "사무직", "행정실", "교육공무직"])) {
    return "행정직원";
  }
  if (includesAny(position, ["교사", "교원", "담임", "부장"])) return "교사";

  return "";
}
