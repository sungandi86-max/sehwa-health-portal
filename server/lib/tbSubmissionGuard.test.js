import assert from "node:assert/strict";
import test from "node:test";
import { isCompletedTbStatus, isTbScreeningSubmission, TB_SCREENING_TASK_ID, verifyCurrentStaffSubmissionIdentity, verifyTbSubmissionAllowed } from "./tbSubmissionGuard.js";

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


test("server submission identity keeps authenticated UID, approval and role checks independent of Rules", async () => {
  const canonical = { uid: "mock-staff", staffId: "S-A", active: true, roles: ["staff"], schoolYear: 2026, semester: 2 };
  const request = { headers: { authorization: "Bearer mock-only" } };
  async function check(change, projectId = "isolated-health-qa") {
    let reads = 0;
    const result = await verifyCurrentStaffSubmissionIdentity(request, {
      context: { APP_ENV: "qa", QA_FIREBASE_PROJECT_ID: "isolated-health-qa" },
      auth: () => ({ verifyIdToken: async () => ({ uid: canonical.uid }) }),
      database: () => ({ app: { options: { projectId } }, collection: (name) => {
        assert.equal(name, "user_assignments");
        return { doc: (id) => { assert.equal(id, "mock-staff_2026_2"); return {
          get: async () => { reads++; return { exists: true, data: () => ({ ...canonical, ...change }) }; },
        }; } };
      } }),
    });
    return { result, reads };
  }
  assert.equal((await check({})).result.ok, true);
  for (const change of [{ uid: "different" }, { uid: undefined }, { schoolYear: "2026" }, { semester: 1 }, { schoolYear: 2025 }, { active: false }, { roles: ["training_admin"] }, { qaOnly: true }]) {
    assert.equal((await check(change)).result.status, 403);
  }
  const mismatched = await check({}, "different-health-qa");
  assert.equal(mismatched.result.status, 503);
  assert.equal(mismatched.reads, 0);
});


test("completed-TB exception is opt-in for exact receipt lookup; default submission guard remains closed", async () => {
  const { staffReceiptDb } = await import("../../tests/fixtures/staffReceiptDb.js");
  const db = staffReceiptDb();
  db.records.set("user_assignments/staff_2026_2", { uid: "staff", staffId: "S-A", schoolYear: 2026, semester: 2, active: true, roles: ["staff"] });
  db.records.set("staff_submission_status_qa/S-A_tb-screening-2026", { staffId: "S-A", taskId: "tb-screening-2026", schoolYear: 2026, status: "completed" });
  const req = { headers: { authorization: "Bearer mock" } };
  const options = { context: { APP_ENV: "qa", QA_FIREBASE_PROJECT_ID: "isolated-health-qa" }, schoolYear: 2026,
    auth: () => ({ verifyIdToken: async () => ({ uid: "staff" }) }), database: () => db };
  assert.equal((await verifyTbSubmissionAllowed(req, options)).status, 409);
  const retry = await verifyTbSubmissionAllowed(req, { ...options, allowRecordedRetry: true });
  assert.equal(retry.ok, true); assert.equal(retry.statusValue, "completed");
});
