import assert from "node:assert/strict";
import test from "node:test";
import {
  INFECTION_CASE_STATUS_LABELS,
  buildInfectionSheetValues,
  getInfectionSheetFallbackFormula,
  planInfectionSheetProjection,
} from "./infectionSheetProjection.js";

function infectionDocument(id, caseStatus = "new") {
  return {
    id,
    data: {
      submittedAt: new Date("2026-09-18T00:00:00.000Z"),
      student: { grade: 2, classNo: 3, number: 4, name: "테스트" },
      infection: {
        diseaseName: "테스트 질환",
        diagnosisDate: "2026-09-17",
        exclusionStartDate: "2026-09-17",
        exclusionEndDate: "2026-09-20",
      },
      report: { note: "", caseStatus },
    },
  };
}

function matchingRowValues(document) {
  const desired = buildInfectionSheetValues(document);
  const values = [];
  desired.bToJ.forEach((value, index) => {
    values[index + 1] = value;
  });
  values[10] = false;
  values[11] = desired.note;
  values[13] = desired.caseStatus;
  return values;
}

test("new document plans an insert without touching unmanaged rows", () => {
  const plan = planInfectionSheetProjection([infectionDocument("doc-1")], {
    rowCount: 10,
    rows: [{ rowNumber: 5, values: [1, "", "", "", "", "legacy", "legacy", 1] }],
    metadata: [],
  });
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].type, "insert");
  assert.equal(plan.operations[0].rowNumber, 6);
  assert.equal(plan.unmanagedSheetRows, 1);
});

test("legacy data in any managed input column reserves its row", () => {
  const values = [];
  values[4] = 12;
  values[11] = "legacy note";
  values[13] = "관리 중";
  const plan = planInfectionSheetProjection([infectionDocument("doc-1")], {
    rowCount: 10,
    rows: [{ rowNumber: 5, values }],
    metadata: [],
  });
  assert.equal(plan.operations[0].rowNumber, 6);
  assert.equal(plan.unmanagedSheetRows, 1);
});

test("existing projection plans an update when mapped values changed", () => {
  const plan = planInfectionSheetProjection([infectionDocument("doc-1", "managing")], {
    rowCount: 10,
    rows: [{ rowNumber: 5, values: [] }],
    metadata: [{ docId: "doc-1", rowNumber: 5 }],
  });
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].type, "update");
  assert.equal(plan.operations[0].desired.caseStatus, "관리 중");
});

test("all five case statuses map to their operational labels", () => {
  for (const [status, label] of Object.entries(INFECTION_CASE_STATUS_LABELS)) {
    assert.equal(buildInfectionSheetValues(infectionDocument("doc", status)).caseStatus, label);
  }
});

test("legacy report status uses the established compatibility mapping", () => {
  const reviewing = infectionDocument("reviewing");
  delete reviewing.data.report.caseStatus;
  reviewing.data.report.status = "reviewing";
  const completed = infectionDocument("completed");
  delete completed.data.report.caseStatus;
  completed.data.report.status = "completed";
  assert.equal(buildInfectionSheetValues(reviewing).caseStatus, "확인 중");
  assert.equal(buildInfectionSheetValues(completed).caseStatus, "종결");
});

test("duplicate projection metadata fails safely", () => {
  const plan = planInfectionSheetProjection([infectionDocument("doc-1")], {
    rowCount: 10,
    rows: [],
    metadata: [
      { docId: "doc-1", rowNumber: 5 },
      { docId: "doc-1", rowNumber: 6 },
    ],
  });
  assert.equal(plan.operations.length, 0);
  assert.equal(plan.duplicates, 1);
  assert.equal(plan.errors, 1);
});

test("two projection ids attached to one row fail safely", () => {
  const plan = planInfectionSheetProjection([infectionDocument("doc-1"), infectionDocument("doc-2")], {
    rowCount: 10,
    rows: [],
    metadata: [
      { docId: "doc-1", rowNumber: 5 },
      { docId: "doc-2", rowNumber: 5 },
    ],
  });
  assert.equal(plan.operations.length, 0);
  assert.equal(plan.duplicates, 1);
  assert.equal(plan.errors, 2);
});

test("partial insert recovery restores an empty report-complete checkbox", () => {
  const desired = buildInfectionSheetValues(infectionDocument("doc-1"));
  const rowValues = [];
  desired.bToJ.forEach((value, index) => {
    rowValues[index + 1] = value;
  });
  rowValues[11] = desired.note;
  rowValues[13] = desired.caseStatus;
  const plan = planInfectionSheetProjection([infectionDocument("doc-1")], {
    rowCount: 10,
    rows: [{ rowNumber: 5, values: rowValues }],
    metadata: [{ docId: "doc-1", rowNumber: 5 }],
  });
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].initializeReportComplete, true);
  assert.equal(plan.operations[0].initializeSequence, true);
  assert.equal(plan.operations[0].initializeMonth, true);
});

test("managed rows with literal A and M values are repaired with formulas", () => {
  const document = infectionDocument("doc-1");
  const rowValues = matchingRowValues(document);
  rowValues[0] = 1;
  rowValues[12] = "2026-09";
  const plan = planInfectionSheetProjection([document], {
    rowCount: 10,
    rows: [{ rowNumber: 5, values: rowValues }],
    formulaRows: [{ rowNumber: 5, values: rowValues }],
    metadata: [{ docId: "doc-1", rowNumber: 5 }],
  });

  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].initializeSequence, true);
  assert.equal(plan.operations[0].initializeMonth, true);
});

test("managed rows preserve existing A and M formulas even when rendered values can be blank", () => {
  const document = infectionDocument("doc-1");
  const rowValues = matchingRowValues(document);
  rowValues[0] = 1;
  rowValues[12] = "";
  const formulaValues = [...rowValues];
  formulaValues[0] = "=ROW()-4";
  formulaValues[12] = '=IF(H5="","",TEXT(H5,"yyyy-mm"))';
  const plan = planInfectionSheetProjection([document], {
    rowCount: 10,
    rows: [{ rowNumber: 5, values: rowValues }],
    formulaRows: [{ rowNumber: 5, values: formulaValues }],
    metadata: [{ docId: "doc-1", rowNumber: 5 }],
  });

  assert.equal(plan.operations.length, 0);
});

test("missing infection row formula sources have deterministic safe fallbacks", () => {
  assert.equal(getInfectionSheetFallbackFormula(5, 0), "=ROW()-4");
  assert.equal(getInfectionSheetFallbackFormula(5, 12), '=IF(H5="","",TEXT(H5,"yyyy-mm"))');
  assert.equal(getInfectionSheetFallbackFormula(5, 4), "");
});

test("projection planning leaves Firestore source data unchanged", () => {
  const document = infectionDocument("doc-1");
  const before = structuredClone(document);
  planInfectionSheetProjection([document], { rowCount: 10, rows: [], metadata: [] });
  assert.deepEqual(document, before);
});
