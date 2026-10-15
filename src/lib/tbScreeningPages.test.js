import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), "utf8");

test("administrator annual navigation and submission details label screening routes", () => {
  const statusPage = read("../pages/FirebaseStaffSubmissionStatusAdminPage.jsx");
  const submissionsPage = read("../pages/FirebaseAdminSubmissionsPage.jsx");
  assert.match(statusPage, />결핵검진 경로<\/a>/);
  assert.doesNotMatch(statusPage, />건강검진 유형<\/a>/);
  assert.match(submissionsPage, /학년도 검진 경로:/);
  assert.doesNotMatch(submissionsPage, /학년도 검진 유형:/);
});

test("QA submission gate reads explicit current year server completion and keeps receipt pending", () => {
  const page = read("../pages/FirebaseTbSubmitPage.jsx");
  assert.match(page, /loadTbScreeningWorkflow\(\{ schoolYear: CURRENT_SCHOOL_YEAR \}\)/);
  assert.match(page, /result\.item\?\.completed/);
  assert.match(page, /관리자 확인 후 검진 완료/);
  assert.match(page, /TB_QA \? TB_QA_DOCUMENT_TYPE_OPTIONS : INDIVIDUAL_HEALTH_CHECKUP_DOCUMENT_OPTIONS/);
});

test("summary pages reuse annual data and bind configured year", () => {
  assert.match(read("../pages/MySubmissionStatusPage.jsx"), /getMyStaffSubmissionStatus\(assignment\.staffId, \{ schoolYear: CURRENT_SCHOOL_YEAR, qaSyntheticAccess \}\)/);
  assert.match(read("../pages/MySubmissionStatusPage.jsx"), /workflow=\{overview\.tbWorkflow\}/);
  assert.match(read("../pages/FirebaseStaffSubmissionStatusAdminPage.jsx"), /initialData=\{overview\.annualData\}/);
});

test("QA TB confirmation and invalidation use server workflow without Firestore writes", async () => {
  const calls = [];
  const source = read("./adminSubmissions.js").replace(/^import[\s\S]*?;\s*$/gm, "").replace(/^export \{[^\n]+$/gm, "").replace(/\bexport /g, "");
  const { updateStaffSubmissionStatus } = vm.runInNewContext(`${source}\n({updateStaffSubmissionStatus})`, {
    INFECTION_LEGACY_STATUS_OPTIONS: [], INDIVIDUAL_HEALTH_CHECKUP_TITLE: "검진",
    isHealthScreeningTypeQaHost: () => true,
    globalThis: { location: { hostname: "qa" } },
    reviewTbScreeningEvidence: async (value) => { calls.push(value); },
    updateDoc: () => { throw new Error("Production write forbidden"); },
    writeBatch: () => { throw new Error("Production write forbidden"); },
  });
  const item = { sourceEnvironment: "qa", itemId: "tb", id: "receipt", staffId: "staff", schoolYear: 2026, workflow: { status: { revision: 3 } } };
  await updateStaffSubmissionStatus(item, "completed");
  await updateStaffSubmissionStatus(item, "rejected");
  assert.equal(calls[0].action, "confirm");
  assert.equal(calls[0].expectedRevision, 3);
  assert.equal(calls[1].action, "invalidate");
  await assert.rejects(updateStaffSubmissionStatus(item, "reviewing"));
});
