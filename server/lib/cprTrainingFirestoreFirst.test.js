import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimeFiles = [
  "api/submit.js",
  "server/lib/cprTrainingStatus.js",
  "server/lib/trainingCenterPhase2Api.js",
  "src/lib/staffSubmissionStatus.js",
  "src/lib/staffSubmissionStatusAdmin.js",
  "src/lib/staffSubmissions.js",
  "scripts/seedStaffSubmissionTasks.mjs",
];

test("CPR runtime no longer names the legacy status sheet", async () => {
  const contents = await Promise.all(runtimeFiles.map((path) => readFile(path, "utf8")));
  assert.equal(contents.some((content) => content.includes("교직원 심폐소생술 연수 이수")), false);
});

test("raw CPR evidence response remains available", async () => {
  const content = await readFile("src/lib/staffSubmissions.js", "utf8");
  assert.match(content, /응답_심폐소생술이수증/);
});

test("CPR submissions and status writes remain staffId and admin bound", async () => {
  const rules = await readFile("firestore.rules", "utf8");
  assert.match(rules, /request\.resource\.data\.staffId == get\(currentAssignmentPath\(request\.auth\.uid\)\)\.data\.staffId/);
  assert.match(rules, /isValidCprTrainingStatus/);
  assert.match(rules, /hasCurrentHealthTeacherOrAdminAssignment/);
});
