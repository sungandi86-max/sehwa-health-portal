import assert from "node:assert/strict";
import test from "node:test";
import { isCompletedTbStatus, isTbScreeningSubmission, TB_SCREENING_TASK_ID,
  verifyTbSubmissionAllowed, verifyCurrentStaffSubmissionIdentity } from "./tbSubmissionGuard.js";
import { verifyQaTbProxyAdmin } from "./qaTbSubmissionAuth.js";

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

function qaAuthFixture(roles = ["admin"], status = null) {
  const reads = [];
  const options = { context: { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }, workflowEnvironment: "qa", schoolYear: 2026,
    auth: () => ({ verifyIdToken: async () => ({ uid: "qa-user" }) }), database: () => ({ collection(name) {
      assert.match(name, /_qa$/); return { doc(id) { reads.push(`${name}/${id}`); return { get: async () => ({ exists: true,
        data: () => name === "user_assignments_qa" ? { uid: "qa-user", staffId: "QA001", active: true, roles } : status }) }; } }; } }) };
  return { options, reads, req: { headers: { authorization: "Bearer fixture-token" } } };
}
test("QA normal administrator auth reads only QA assignment and retains role denial", async () => {
  const f = qaAuthFixture(); const result = await verifyQaTbProxyAdmin(f.req, f.options);
  assert.equal(result.ok, true); assert.equal(result.assignment.staffId, "QA001");
  assert.deepEqual(f.reads, ["user_assignments_qa/qa-user_2026_2"]);
  const denied = qaAuthFixture(["training_admin"]);
  assert.equal((await verifyQaTbProxyAdmin(denied.req, denied.options)).status, 403);
});
test("QA TB guard requires explicit year and uses only exact-year QA status", async () => {
  const f = qaAuthFixture(["staff"], { staffId: "QA001", schoolYear: 2026, taskId: "tb-screening-2026", status: "completed" });
  assert.equal((await verifyTbSubmissionAllowed(f.req, f.options)).status, 409);
  assert.deepEqual(f.reads, ["user_assignments_qa/qa-user_2026_2", "staff_submission_status_qa/QA001_tb-screening-2026"]);
  const missing = qaAuthFixture(); assert.equal((await verifyCurrentStaffSubmissionIdentity(missing.req,
    { ...missing.options, schoolYear: undefined })).status, 400); assert.equal(missing.reads.length, 0);
  const historical = qaAuthFixture(["staff"], { staffId: "QA001", taskId: "tb-screening-2026", status: "completed" });
  assert.equal((await verifyTbSubmissionAllowed(historical.req, historical.options)).ok, true);
});
