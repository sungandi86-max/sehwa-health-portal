import assert from "node:assert/strict";
import test from "node:test";
import { buildCprAdminSummary, buildCprCurrentStaffItems, normalizeCprTraining } from "./cprTrainingStatusModel.js";

test("CPR status joins canonical people by staffId even when names can match", () => {
  const directory = [
    { staffId: "T001", realName: "동명이인", employmentStatus: "재직" },
    { staffId: "T002", realName: "동명이인", employmentStatus: "재직" },
  ];
  const items = buildCprCurrentStaffItems(directory, [{ staffId: "T002", status: "completed", training: { completionMethod: "group" } }]);
  assert.equal(items.find((item) => item.staffId === "T001").status, "incomplete");
  assert.equal(items.find((item) => item.staffId === "T002").status, "completed");
});

test("CPR summary separates group, individual, pending and excluded", () => {
  const summary = buildCprAdminSummary([
    { status: "completed", training: normalizeCprTraining({ completionMethod: "group" }) },
    { status: "completed", training: normalizeCprTraining({ completionMethod: "individual" }) },
    { status: "pending", training: normalizeCprTraining({ completionMethod: "individual" }) },
    { status: "incomplete", training: normalizeCprTraining({ completionMethod: "none" }) },
    { status: "not_applicable", training: normalizeCprTraining({ completionMethod: "none" }) },
  ]);
  assert.deepEqual(summary, { target: 4, completed: 2, incomplete: 1, group: 1, individual: 1, needsCheck: 1, excluded: 1 });
});
