import assert from "node:assert/strict";
import test from "node:test";
import {
  INFECTION_CASE_STATUS_LABELS,
  buildInfectionSheetValues,
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
});

test("projection planning leaves Firestore source data unchanged", () => {
  const document = infectionDocument("doc-1");
  const before = structuredClone(document);
  planInfectionSheetProjection([document], { rowCount: 10, rows: [], metadata: [] });
  assert.deepEqual(document, before);
});
