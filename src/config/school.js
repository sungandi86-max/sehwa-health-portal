export const CURRENT_SCHOOL_YEAR = 2026;
export const CURRENT_SEMESTER = 1;

export function getAssignmentId(uid, schoolYear = CURRENT_SCHOOL_YEAR, semester = CURRENT_SEMESTER) {
  return `${uid}_${schoolYear}_${semester}`;
}
