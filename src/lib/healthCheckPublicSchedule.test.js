import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveHealthCheckProgress,
  getHealthCheckScheduleFreshness,
  normalizeHealthCheckClass,
  normalizeHealthCheckSession,
  selectDefaultHealthCheckSession,
  sortHealthCheckClasses,
} from "./healthCheckPublicSchedule.js";

const timestamp = (iso) => ({ toDate: () => new Date(iso) });

test("public session normalization keeps only the Phase 1 class-level contract", () => {
  const result = normalizeHealthCheckSession("session-1", {
    sessionId: "session-1",
    schoolKey: "school-a",
    examType: "urine",
    examDate: "2026-11-25",
    location: "본관 1층",
    status: "inProgress",
    updatedAt: timestamp("2026-11-25T00:10:00.000Z"),
    studentName: "노출되면 안 됨",
    internalLog: "노출되면 안 됨",
  });

  assert.deepEqual(result, {
    sessionId: "session-1",
    examType: "urine",
    examDate: "2026-11-25",
    location: "본관 1층",
    status: "inProgress",
    updatedAt: "2026-11-25T00:10:00.000Z",
  });
  assert.equal("schoolKey" in result, false);
  assert.equal("studentName" in result, false);
});

test("invalid or mismatched public sessions are rejected", () => {
  assert.equal(normalizeHealthCheckSession("session-1", { sessionId: "other" }), null);
  assert.equal(normalizeHealthCheckSession("session-1", {
    sessionId: "session-1", examType: "urine", examDate: "2026/11/25", location: "보건실", status: "scheduled",
  }), null);
  assert.equal(normalizeHealthCheckSession("session-1", {
    sessionId: "session-1", schoolKey: "other-school", examType: "urine", examDate: "2026-11-25", location: "보건실", status: "scheduled",
  }, { expectedSchoolKey: "school-health-check-scheduler" }), null);
});

test("class normalization drops student fields and rejects mismatched identifiers", () => {
  const result = normalizeHealthCheckClass("session-1", "2-1", {
    sessionId: "session-1",
    classId: "2-1",
    order: 2,
    scheduledTime: "09:20",
    displayStatus: "waiting",
    updatedAt: timestamp("2026-11-25T00:00:00.000Z"),
    students: [{ name: "합성 학생" }],
  });

  assert.deepEqual(result, {
    classId: "2-1",
    order: 2,
    scheduledTime: "09:20",
    displayStatus: "waiting",
    updatedAt: "2026-11-25T00:00:00.000Z",
  });
  assert.equal(normalizeHealthCheckClass("session-1", "2-1", { ...result, sessionId: "other" }), null);
});

test("default selection prefers active, then upcoming, then most recent completed session", () => {
  const sessions = [
    { sessionId: "done", examDate: "2026-11-20", status: "completed" },
    { sessionId: "future", examDate: "2026-11-26", status: "scheduled" },
    { sessionId: "active", examDate: "2026-11-25", status: "inProgress" },
  ];
  assert.equal(selectDefaultHealthCheckSession(sessions, "2026-11-24").sessionId, "active");
  assert.equal(selectDefaultHealthCheckSession(sessions.filter((item) => item.sessionId !== "active"), "2026-11-24").sessionId, "future");
  assert.equal(selectDefaultHealthCheckSession(sessions.filter((item) => item.status === "completed"), "2026-11-24").sessionId, "done");
});

test("current and next classes are derived from ordered class-level states", () => {
  const classes = sortHealthCheckClasses([
    { classId: "3-1", order: 3, scheduledTime: "10:00", displayStatus: "waiting" },
    { classId: "1-1", order: 1, scheduledTime: "09:00", displayStatus: "completed" },
    { classId: "2-1", order: 2, scheduledTime: "09:30", displayStatus: "active" },
  ]);
  const progress = deriveHealthCheckProgress(classes);
  assert.equal(progress.current.classId, "2-1");
  assert.equal(progress.next.classId, "3-1");
  assert.deepEqual(classes.map((item) => item.classId), ["1-1", "2-1", "3-1"]);
});

test("active data becomes stale without changing the stored schedule state", () => {
  assert.equal(getHealthCheckScheduleFreshness({
    status: "inProgress",
    updatedAt: "2026-11-25T00:00:00.000Z",
  }, new Date("2026-11-25T00:06:00.000Z")).status, "stale");
  assert.equal(getHealthCheckScheduleFreshness({
    status: "scheduled",
    updatedAt: "2026-11-25T00:00:00.000Z",
  }, new Date("2026-11-25T00:06:00.000Z")).status, "fresh");
});
