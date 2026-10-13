import assert from "node:assert/strict";
import test from "node:test";
import { recentTrainingAttendance, trainingAttendanceCounts } from "./trainingAttendancePresentation.js";

test("training attendance presentation derives missing count from the live summary", () => {
  assert.deepEqual(trainingAttendanceCounts({ target: 9, signed: 7, excluded: 0 }), { target: 9, signed: 7, missing: 2, excluded: 0 });
  assert.deepEqual(trainingAttendanceCounts({ target: 1, signed: 2, excluded: 3 }).missing, 0);
});

test("recent attendance includes only signed rows in reverse chronological order", () => {
  const rows = [
    { staffId: "A", status: "서명 완료", signedAt: "2026-10-13T03:10:00Z" },
    { staffId: "B", status: "미서명", signedAt: "" },
    { staffId: "C", status: "서명 완료", signedAt: "2026-10-13T03:12:00Z" },
  ];
  assert.deepEqual(recentTrainingAttendance(rows).map((row) => row.staffId), ["C", "A"]);
});
