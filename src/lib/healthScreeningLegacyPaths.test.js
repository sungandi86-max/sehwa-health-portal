import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readHealthScreeningType } from "../../server/lib/healthScreeningTypeStore.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("annual screening store has no legacy Sheet or completion fallback", async () => {
  const store = read("../../server/lib/healthScreeningTypeStore.js");
  assert.doesNotMatch(store, /readGoogleSheetValues|readStaffDirectory|\.collection\(["']staff_submission_status["']\)|응답_교직원결핵검진유형선택/);
  const collections = [];
  const db = { collection(name) {
    collections.push(name);
    assert.equal(name, "staff_health_screening_types", "annual reads must never access a legacy or completion collection");
    return { doc: () => ({ get: async () => ({ exists: false }) }) };
  } };
  const item = await readHealthScreeningType(db, "fixture", 2026, { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" });
  assert.equal(item.screeningTypeConfirmed, false);
  assert.deepEqual(collections, ["staff_health_screening_types"]);
  assert.match(read("../../server/lib/staffDirectory.js"), /교직원명단/);
  assert.match(read("../../server/lib/trainingCenter.js"), /교직원교육대상/);
});

test("administrator anchors reference real sections without replacing TB semantics", () => {
  const page = read("../pages/FirebaseStaffSubmissionStatusAdminPage.jsx");
  for (const id of ["annual-screening-type", "training-source-check", "legal-training-exceptions", "completion-status"]) {
    assert.equal(page.split(`id="${id}"`).length - 1, 1);
    assert.match(page, new RegExp(`href="#${id}"`));
  }
  assert.match(page, /aria-label="결핵검진 신청 경로 필터"/);
  assert.match(page, /label="공단검진 신청 경로" value=\{selectedTask.summary.national\}/);
  assert.match(page, /isTbTask=\{selectedTask.taskId === TB_SCREENING_TASK_ID\}/);
  assert.match(page, /isHealthScreeningTypeEnabledHost\(globalThis.location\?\.hostname\) && <section id="annual-screening-type"/);
  assert.doesNotMatch(page, /ANNUAL_QA/);
});
