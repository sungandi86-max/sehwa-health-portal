import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTbAdminSummary,
  buildTbCurrentStaffItems,
  getTbAdminUpdate,
  normalizeTbScreening,
} from "./tbScreeningStatusModel.js";

test("TB detail normalization keeps unknown fields explicit", () => {
  assert.deepEqual(normalizeTbScreening({}), {
    targetStatus: "unknown",
    latentStatus: "unknown",
    screeningType: "unknown",
    completed: false,
    screeningDate: "",
    note: "",
    registrationStatus: "none",
  });
});

test("TB admin update validates controlled values and completion", () => {
  const result = getTbAdminUpdate({
    targetStatus: "target",
    latentStatus: "completed",
    screeningType: "national",
    status: "completed",
    screeningDate: "2026-09-17",
    note: "확인 완료",
  });
  assert.equal(result.status, "completed");
  assert.equal(result.screening.completed, true);
  assert.equal(result.screening.screeningType, "national");
  assert.throws(() => getTbAdminUpdate({ targetStatus: "invalid" }), /대상 상태/);
});

test("admin roster joins only by staffId and isolates same-name staff", () => {
  const directory = [
    { staffId: "A", realName: "동명이인", employmentStatus: "재직" },
    { staffId: "B", realName: "동명이인", employmentStatus: "재직" },
  ];
  const statusItems = [{ id: "A_tb", staffId: "A", status: "completed", screening: { screeningType: "individual" } }];

  const result = buildTbCurrentStaffItems(directory, statusItems);

  assert.equal(result.find((item) => item.staffId === "A").status, "completed");
  assert.equal(result.find((item) => item.staffId === "B").status, "unknown");
});

test("TB admin summary counts target, completion, type, and excluded staff", () => {
  const summary = buildTbAdminSummary([
    { status: "completed", employmentStatus: "재직", screening: { targetStatus: "target", screeningType: "group" } },
    { status: "incomplete", employmentStatus: "재직", screening: { targetStatus: "target", screeningType: "individual" } },
    { status: "unknown", employmentStatus: "재직", screening: { targetStatus: "target", screeningType: "national" } },
    { status: "not_applicable", employmentStatus: "휴직", screening: { targetStatus: "excluded", screeningType: "none" } },
  ]);

  assert.deepEqual(summary, {
    total: 3,
    completed: 1,
    incomplete: 2,
    group: 1,
    individual: 1,
    national: 1,
    unregistered: 0,
    excluded: 1,
  });
});
