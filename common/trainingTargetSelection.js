const TEACHER_POSITIONS = new Set(["교장", "교감", "교사", "보건교사", "전문상담교사"]);
const PRESETS = new Set(["all", "teachers", "manual"]);

const normalized = (value) => String(value ?? "").normalize("NFKC").trim();

export function toggleTrainingTarget(selection, staffId, checked) {
  return { ...selection,
    includeStaffIds: checked ? [...new Set([...selection.includeStaffIds, staffId])] : selection.includeStaffIds.filter((id) => id !== staffId),
    excludeStaffIds: checked ? selection.excludeStaffIds.filter((id) => id !== staffId) : [...new Set([...selection.excludeStaffIds, staffId])] };
}

export function selectTrainingTargets(directory, selection) {
  if (!selection || !PRESETS.has(selection.preset) || typeof selection.includeAdministrativeStaff !== "boolean" ||
    typeof selection.includeHourlyInstructors !== "boolean" || typeof selection.department !== "string" ||
    !Array.isArray(selection.includeStaffIds) || !Array.isArray(selection.excludeStaffIds)) {
    throw new RangeError("교육 대상자 설정을 확인해 주세요.");
  }
  const people = directory.filter((person) => person.employmentStatus === "재직");
  const byId = new Map(people.map((person) => [person.staffId, person]));
  if (byId.size !== people.length || people.some((person) => !person.staffId || !person.name)) {
    throw new RangeError("교직원명단의 대상자 정보를 확인해 주세요.");
  }
  const department = normalized(selection.department);
  if (department && !people.some((person) => normalized(person.department) === department)) {
    throw new RangeError("선택한 부서를 확인해 주세요.");
  }
  const overrides = [...selection.includeStaffIds, ...selection.excludeStaffIds];
  if (overrides.length > 500 || overrides.some((id) => typeof id !== "string" || id !== normalized(id) || !byId.has(id))) {
    throw new RangeError("선택한 교직원ID를 확인해 주세요.");
  }
  const included = new Set(selection.includeStaffIds);
  const excluded = new Set(selection.excludeStaffIds);
  const selected = people.filter((person) => {
    const administrative = normalized(person.department) === "행정실";
    const instructor = normalized(person.position) === "시간강사";
    const teacher = TEACHER_POSITIONS.has(normalized(person.position)) || instructor;
    const base = selection.preset === "all" || (selection.preset === "teachers" && teacher);
    const byDepartment = !department || normalized(person.department) === department;
    const allowed = (!administrative || selection.includeAdministrativeStaff) &&
      (!instructor || selection.includeHourlyInstructors);
    return !excluded.has(person.staffId) && (included.has(person.staffId) ||
      ((base || (administrative && selection.includeAdministrativeStaff && selection.preset === "teachers")) && byDepartment && allowed));
  });
  if (!selected.length) throw new RangeError("대상 교직원을 한 명 이상 선택해 주세요.");
  return { members: selected.map(({ staffId, name, position, department }) => ({ staffId, name, position, department,
    targetStatus: "대상", required: true })), selection: { preset: selection.preset,
    includeAdministrativeStaff: selection.includeAdministrativeStaff, includeHourlyInstructors: selection.includeHourlyInstructors,
    department, includeStaffIds: [...included], excludeStaffIds: [...excluded] } };
}
