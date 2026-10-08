import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimeFiles = [
  "api/submit.js",
  "apps-script/Code.gs",
  "scripts/seedStaffSubmissionTasks.mjs",
  "src/lib/staffSubmissionStatus.js",
  "src/lib/staffSubmissionStatusAdmin.js",
];

test("TB runtime no longer references the legacy status sheet", async () => {
  const sources = await Promise.all(runtimeFiles.map((path) => readFile(path, "utf8")));
  assert.equal(sources.some((source) => source.includes("교직원 결핵검진현황")), false);
});

test("Apps Script keeps the raw response tab without name-based master updates", async () => {
  const source = await readFile("apps-script/Code.gs", "utf8");
  assert.equal(source.includes("응답_교직원결핵검진유형선택"), true);
  assert.equal(source.includes("findTbScreeningMasterRow_"), false);
  assert.equal(source.includes("TB_GROUP_SCREENING_MASTER_TYPE"), false);
});

test("Firestore rules keep self reads staffId-bound and admin writes role-bound", async () => {
  const source = await readFile("firestore.rules", "utf8");
  assert.equal(source.includes("resource.data.staffId == get(currentAssignmentPath(request.auth.uid)).data.staffId"), true);
  assert.equal(source.includes("allow create: if hasCurrentHealthTeacherOrAdminAssignment()"), true);
  assert.equal(source.includes("isValidTbScreeningStatus() || isValidCprTrainingStatus()"), true);
  assert.equal(source.includes("allow delete: if false"), true);
});
