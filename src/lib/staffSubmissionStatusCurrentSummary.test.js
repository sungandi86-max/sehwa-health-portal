import test from "node:test";
import assert from "node:assert/strict";
import { reconcileCurrentTaskStatusItems } from "./staffSubmissionStatusCurrentSummary.js";

const HEALTH_TASK_ID = "health-mandatory-training-2026";

function item(staffId, status, taskId = HEALTH_TASK_ID) {
  return { id: `${staffId}_${taskId}`, staffId, taskId, status };
}

test("current mandatory-training summary excludes preserved orphan snapshots", () => {
  const currentTargetStaffIds = Array.from({ length: 84 }, (_, index) => `T${String(index + 1).padStart(3, "0")}`);
  const currentItems = currentTargetStaffIds.map((staffId, index) => item(staffId, index < 51 ? "completed" : "unknown"));
  const orphanItems = [
    item("OLD001", "completed"),
    item("OLD002", "completed"),
    item("OLD003", "completed"),
    item("OLD004", "unknown"),
  ];

  const result = reconcileCurrentTaskStatusItems({
    taskId: HEALTH_TASK_ID,
    items: [...currentItems, ...orphanItems],
    currentTargetStaffIds,
  });

  assert.equal(result.items.length, 84);
  assert.equal(result.items.filter((entry) => entry.status === "completed").length, 51);
  assert.equal(result.items.filter((entry) => entry.status === "incomplete").length, 0);
  assert.equal(result.items.filter((entry) => entry.status === "unknown").length, 33);
  assert.equal(result.preservedOrphans, 4);
});

test("TB and CPR task summaries are unchanged", () => {
  for (const taskId of ["tb-screening-2026", "cpr-training-2026"]) {
    const items = [item("T001", "completed", taskId), item("T002", "incomplete", taskId)];
    const result = reconcileCurrentTaskStatusItems({ taskId, items, currentTargetStaffIds: null });

    assert.deepEqual(result.items, items);
    assert.equal(result.preservedOrphans, 0);
  }
});

test("mandatory-training summary fails closed when current targets are unavailable", () => {
  assert.throws(
    () => reconcileCurrentTaskStatusItems({ taskId: HEALTH_TASK_ID, items: [], currentTargetStaffIds: null }),
    /현재 대상/
  );
});
