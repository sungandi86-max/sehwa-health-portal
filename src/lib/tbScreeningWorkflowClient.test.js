import test from "node:test";
import assert from "node:assert/strict";
import { mergeTbWorkflowPages, tbEvidenceLabel } from "./tbScreeningWorkflowClient.js";

test("paged join retains evidence, exact year and latest status, clears unknown only after complete", () => {
  const row = (evidence, status, complete) => ({ staffId: "a", schoolYear: 2026, workflow: { staffId: "a", schoolYear: 2026, route: { staffId: "a", schoolYear: 2026, screeningType: "nhis" }, evidence, status, evidenceComplete: complete } });
  const evidence = { submissionId: "one", staffId: "a", schoolYear: 2026, evidenceRoute: "individual" };
  const first = { items: [row([evidence], null, false)], datasets: { completeness: { evidence: false, statuses: true } } };
  const final = { items: [row([{ ...evidence, schoolYear: 2027 }], { staffId: "a", schoolYear: 2026, status: "completed", screening: { completed: true }, revision: 1 }, true)], datasets: { completeness: { evidence: true, statuses: true } } };
  assert.equal(tbEvidenceLabel(first.items[0].workflow), "조회 미완료 · 자료 유무 확인 필요");
  const merged = mergeTbWorkflowPages(first, final).items[0].workflow;
  assert.equal(merged.evidence.length, 1);
  assert.equal(merged.evidenceComplete, true);
  assert.equal(merged.completed, true);
  assert.equal(merged.routeMismatch, true);
});
