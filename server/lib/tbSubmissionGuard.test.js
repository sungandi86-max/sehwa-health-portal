import assert from "node:assert/strict";
import test from "node:test";
import { isCompletedTbStatus, isTbScreeningSubmission, TB_SCREENING_TASK_ID } from "./tbSubmissionGuard.js";

test("TB confirmation and group registration payloads use the TB guard", () => {
  assert.equal(isTbScreeningSubmission({ type: "tb" }), true);
  assert.equal(isTbScreeningSubmission({ type: "tb_registration" }), true);
  assert.equal(isTbScreeningSubmission({ sheetName: "응답_결핵검진확인증" }), true);
  assert.equal(isTbScreeningSubmission({ sheetName: "응답_교직원결핵검진유형선택" }), true);
});

test("unrelated submissions do not use the TB guard", () => {
  assert.equal(isTbScreeningSubmission({ type: "cpr", sheetName: "응답_심폐소생술이수증" }), false);
  assert.equal(isTbScreeningSubmission({ type: "recruit" }), false);
  assert.equal(isTbScreeningSubmission({ type: "infection" }), false);
});

test("only the current staffId completed snapshot blocks submission", () => {
  const completed = { staffId: "T001", taskId: TB_SCREENING_TASK_ID, status: "completed" };
  assert.equal(isCompletedTbStatus(completed, "T001"), true);
  assert.equal(isCompletedTbStatus({ ...completed, status: "incomplete" }, "T001"), false);
  assert.equal(isCompletedTbStatus({ ...completed, status: "unknown" }, "T001"), false);
  assert.equal(isCompletedTbStatus(completed, "T002"), false);
  assert.equal(isCompletedTbStatus(null, "T001"), false);
});
