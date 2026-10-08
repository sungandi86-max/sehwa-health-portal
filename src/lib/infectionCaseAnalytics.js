import { INFECTION_CASE_STATUS, INFECTION_SUBMISSION_STATUS } from "./infectionStatus.js";

export function getInfectionOverview(cases) {
  const monthlyCounts = new Map();
  const diseaseCounts = new Map();

  for (const infectionCase of cases) {
    const diagnosisDate = String(infectionCase.infection?.diagnosisDate || "");
    const month = /^\d{4}-\d{2}/.test(diagnosisDate) ? diagnosisDate.slice(0, 7) : "날짜 미입력";
    const diseaseName = String(infectionCase.infection?.diseaseName || "미입력").trim() || "미입력";
    monthlyCounts.set(month, (monthlyCounts.get(month) || 0) + 1);
    diseaseCounts.set(diseaseName, (diseaseCounts.get(diseaseName) || 0) + 1);
  }

  const byCountThenLabel = ([leftLabel, leftCount], [rightLabel, rightCount]) =>
    rightCount - leftCount || leftLabel.localeCompare(rightLabel, "ko");

  return {
    totals: {
      all: cases.length,
      active: cases.filter((item) => item.caseStatus !== INFECTION_CASE_STATUS.closed).length,
      closed: cases.filter((item) => item.caseStatus === INFECTION_CASE_STATUS.closed).length,
      pendingReport: cases.filter(
        (item) => item.submissionStatus === INFECTION_SUBMISSION_STATUS.submitted
      ).length,
    },
    monthly: [...monthlyCounts.entries()]
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([label, count]) => ({ label, count })),
    diseases: [...diseaseCounts.entries()]
      .sort(byCountThenLabel)
      .map(([label, count]) => ({ label, count })),
  };
}

function matchesText(infectionCase, searchText) {
  const keyword = String(searchText || "").trim().toLowerCase();
  if (!keyword) return true;

  const student = infectionCase.student || {};
  return String(student.name || "").toLowerCase().includes(keyword);
}

export function filterInfectionCases(cases, filters) {
  return cases.filter((infectionCase) => {
    const student = infectionCase.student || {};
    const matchesStatus = filters.caseStatus === "all" || infectionCase.caseStatus === filters.caseStatus;
    const matchesGrade = !filters.grade || String(student.grade || "") === filters.grade;
    const matchesClassNo = !filters.classNo || String(student.classNo || "") === filters.classNo.trim();
    const diseaseKeyword = String(filters.diseaseName || "").trim().toLowerCase();
    const matchesDisease =
      !diseaseKeyword ||
      String(infectionCase.infection?.diseaseName || "").toLowerCase().includes(diseaseKeyword);
    const matchesClosed =
      filters.includeClosed ||
      filters.caseStatus === INFECTION_CASE_STATUS.closed ||
      infectionCase.caseStatus !== INFECTION_CASE_STATUS.closed;
    return (
      matchesStatus &&
      matchesGrade &&
      matchesClassNo &&
      matchesDisease &&
      matchesClosed &&
      matchesText(infectionCase, filters.searchText)
    );
  });
}
