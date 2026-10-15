import test from "node:test";
import assert from "node:assert/strict";
import { validatedSchoolYear, tbWorkflowTaskId, evidenceRoute, hasEvidenceRouteMismatch, joinTbScreeningWorkflow } from "./tbScreeningWorkflowModel.js";

test("workflow year is explicit and strict, with distinct yearly task IDs", () => {
  assert.equal(validatedSchoolYear("2027"), 2027);
  assert.equal(tbWorkflowTaskId(2026), "tb-screening-2026");
  assert.equal(tbWorkflowTaskId(2027), "tb-screening-2027");
  for (const value of [undefined, null, "", " 2026", "2026 ", "2026.0", 2026.5, 1999, 2101, true]) {
    assert.throws(() => validatedSchoolYear(value), { status: 400 });
  }
});

test("evidence classification is an exact form-value mapping only", () => {
  assert.equal(evidenceRoute("결핵검진 확인증"), "individual");
  assert.equal(evidenceRoute("흉부 X-ray 확인 자료"), "nhis");
  assert.equal(evidenceRoute("채용검진 확인 자료"), "employment");
  for (const value of [null, "other", "individual", "결핵검진 확인증 추가", "흉부 X-ray 확인 자료 "]) assert.equal(evidenceRoute(value), null);
  assert.equal(hasEvidenceRouteMismatch("individual", "nhis"), true);
  for (const pair of [["other", "nhis"], ["none", "nhis"], ["nhis", null], ["nhis", "nhis"]]) assert.equal(hasEvidenceRouteMismatch(...pair), false);
});

test("workflow join uses exact staff and explicit year with separate completion", () => {
  const evidence = [
    { id: "current", staffId: "fixture", schoolYear: 2026, evidenceRoute: "individual" },
    { id: "past", staffId: "fixture", schoolYear: 2025 },
    { id: "historical", staffId: "fixture", submittedAt: "2026-10-15" },
    { id: "foreign", staffId: "foreign", schoolYear: 2026 },
  ];
  const route = { staffId: "fixture", schoolYear: 2026, screeningType: "nhis", selfChoice: null };
  const result = joinTbScreeningWorkflow({ staffId: "fixture", schoolYear: 2026, route, evidence, status: null });
  assert.deepEqual(result.evidence.map(({ id }) => id), ["current"]);
  assert.equal(result.completed, false);
  assert.equal(result.routeMismatch, true);
  const next = joinTbScreeningWorkflow({ staffId: "fixture", schoolYear: 2027, route, evidence, status: { staffId: "fixture", schoolYear: 2026, status: "completed", screening: { completed: true } } });
  assert.equal(next.route, null);
  assert.deepEqual(next.evidence, []);
  assert.equal(next.completed, false);
  assert.equal(joinTbScreeningWorkflow({ staffId: "fixture", schoolYear: 2026, evidence: [], evidenceComplete: false }).evidenceState, "unknown");
  assert.equal(joinTbScreeningWorkflow({ staffId: "fixture", schoolYear: 2026, status: { staffId: "fixture", schoolYear: 2026, status: "completed", screening: { completed: true } } }).completed, true);
  assert.equal(joinTbScreeningWorkflow({ staffId: "fixture", schoolYear: 2026, status: { staffId: "fixture", schoolYear: 2026, completed: true, status: "pending", screening: { completed: true } } }).completed, false);
});
