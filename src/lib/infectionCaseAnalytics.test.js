import assert from "node:assert/strict";
import test from "node:test";
import { filterInfectionCases, getInfectionOverview } from "./infectionCaseAnalytics.js";

const cases = [
  {
    id: "case-a",
    caseStatus: "managing",
    submissionStatus: "submitted",
    student: { grade: 1, classNo: 2, number: 3, name: "학생A" },
    infection: { diseaseName: "인플루엔자", diagnosisDate: "2026-09-17" },
  },
  {
    id: "case-b",
    caseStatus: "closed",
    submissionStatus: "reviewed",
    student: { grade: 2, classNo: 4, number: 5, name: "학생B" },
    infection: { diseaseName: "인플루엔자", diagnosisDate: "2026-10-02" },
  },
  {
    id: "case-c",
    caseStatus: "checking",
    submissionStatus: "reviewed",
    student: { grade: 1, classNo: 2, number: 6, name: "학생C" },
    infection: { diseaseName: "수두", diagnosisDate: "" },
  },
];

test("infection overview includes operational totals and grouped statistics", () => {
  const overview = getInfectionOverview(cases);
  assert.deepEqual(overview.totals, { all: 3, active: 2, closed: 1, pendingReport: 1 });
  assert.deepEqual(overview.monthly, [
    { label: "날짜 미입력", count: 1 },
    { label: "2026-10", count: 1 },
    { label: "2026-09", count: 1 },
  ]);
  assert.deepEqual(overview.diseases, [
    { label: "인플루엔자", count: 2 },
    { label: "수두", count: 1 },
  ]);
});

test("infection filters combine grade, status, disease, search and closed visibility", () => {
  const visible = filterInfectionCases(cases, {
    caseStatus: "all",
    diseaseName: "플루",
    grade: "1",
    classNo: "2",
    includeClosed: false,
    searchText: "학생",
  });
  assert.deepEqual(visible.map((item) => item.id), ["case-a"]);
  assert.deepEqual(
    filterInfectionCases(cases, {
      caseStatus: "all",
      diseaseName: "",
      grade: "",
      classNo: "",
      includeClosed: true,
      searchText: "인플루엔자",
    }),
    []
  );
  assert.deepEqual(
    filterInfectionCases(cases, {
      caseStatus: "all",
      diseaseName: "",
      grade: "",
      classNo: "",
      includeClosed: true,
      searchText: "",
    }).map((item) => item.id),
    ["case-a", "case-b", "case-c"]
  );

  assert.deepEqual(
    filterInfectionCases(cases, {
      caseStatus: "closed",
      diseaseName: "",
      grade: "",
      classNo: "",
      includeClosed: false,
      searchText: "",
    }).map((item) => item.id),
    ["case-b"]
  );
});
