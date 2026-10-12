import assert from "node:assert/strict";
import test from "node:test";
import { isCompletedTbStatus, isTbScreeningSubmission, TB_SCREENING_TASK_ID,
  verifyTbSubmissionAllowed } from "./tbSubmissionGuard.js";

test("TB confirmation and group registration payloads use the TB guard", () => {
  assert.equal(isTbScreeningSubmission({ type: "tb" }), true);
  assert.equal(isTbScreeningSubmission({ type: "tb_registration" }), true);
  assert.equal(isTbScreeningSubmission({ sheetName: "응답_결핵검진확인증" }), false);
  assert.equal(isTbScreeningSubmission({ sheetName: "응답_교직원결핵검진유형선택" }), false);
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

test("fixed QA TB guard checks isolated status while Production checks shared status", async () => {
  const reads = [];
  const db = { collection(name) { return { doc(id) { return { async get() {
    reads.push({ name, id });
    return { exists: name === "staff_submission_status", data: () => ({
      staffId: "QA-TB-STAFF-001", taskId: TB_SCREENING_TASK_ID, status: "completed",
    }) };
  } }; } }; } };
  const verifyIdentity = async () => ({ ok: true, db, staffId: "QA-TB-STAFF-001", roles: ["staff"],
    identity: { staffId: "QA-TB-STAFF-001", name: "[QA] 합성", department: "[QA] 부서" } });
  const qa = await verifyTbSubmissionAllowed({}, { context: { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }, verifyIdentity });
  assert.equal(qa.ok, true);
  assert.equal(reads[0].name, "staff_submission_status_qa");
  const production = await verifyTbSubmissionAllowed({}, { context: { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }, verifyIdentity });
  assert.equal(production.ok, false);
  assert.equal(production.status, 409);
  assert.equal(reads[1].name, "staff_submission_status");
});
