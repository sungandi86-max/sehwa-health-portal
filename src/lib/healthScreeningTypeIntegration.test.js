import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { saveTbScreeningStatus, TB_SCREENING_TASK_ID } from "../../server/lib/tbScreeningStatus.js";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("annual Production feature uses existing router and both protected pages", () => {
  assert.match(source("../../api/firebase/staff-directory.js"), /resource === "health-screening-types"/);
  for (const page of ["MySubmissionStatusPage", "FirebaseStaffSubmissionStatusAdminPage"]) {
    assert.match(source(`../pages/${page}.jsx`), /isHealthScreeningTypeEnabledHost/);
  }
  assert.match(source("../pages/MySubmissionStatusPage.jsx"), /기존 결핵검진 신청 경로/);
  assert.match(source("../pages/FirebaseStaffSubmissionStatusAdminPage.jsx"), /기존 결핵검진 신청 경로/);
});

test("opening annual panels only loads; saves are explicit form handlers", () => {
  for (const component of ["HealthScreeningTypePanel", "HealthScreeningTypeAdminPanel"]) {
    const text = source(`../components/${component}.jsx`);
    assert.match(text, /useEffect/);
    assert.match(text, /loadHealthScreeningTypes/);
    assert.match(text, /saveHealthScreeningType/);
    assert.doesNotMatch(text, /setDoc|updateDoc|writeBatch|staff_submissions/);
  }
});

test("completion updates leave the annual Production record and history unchanged", async () => {
  const annual = { staffId: "STAFF-LOCAL-001", schoolYear: 2026, screeningType: "nhis", revision: 1 };
  const records = new Map([["staff_health_screening_types/STAFF-LOCAL-001_2026", annual]]);
  const accessed = [];
  const db = { collection: (name) => {
    accessed.push(name);
    return { doc: (id) => ({ id, get: async () => ({ exists: false }), set: async (item) => records.set(`${name}/${id}`, item) }) };
  } };
  await saveTbScreeningStatus({ db, payload: { staffId: annual.staffId, taskId: TB_SCREENING_TASK_ID, status: "completed", screening: { completed: true } } });
  assert.deepEqual(records.get("staff_health_screening_types/STAFF-LOCAL-001_2026"), annual);
  assert.deepEqual(accessed, ["staff_submission_status"]);
});

test("submission and proxy status paths cannot automatically write annual type", () => {
  for (const path of ["./adminSubmissions.js", "./submissionStatus.js", "./staffSubmissionStatusAdmin.js", "../../api/submit.js"]) {
    assert.doesNotMatch(source(path), /healthScreeningTypeStore|saveHealthScreeningType|staff_health_screening_types/);
  }
});
