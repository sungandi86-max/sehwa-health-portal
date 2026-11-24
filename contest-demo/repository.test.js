import assert from "node:assert/strict";
import test from "node:test";
import { deriveHealthCheckProgress } from "../src/lib/healthCheckPublicSchedule.js";
import { ROLES, STAFF, initialDemo, updateDemo } from "./repository.js";

test("a simulated submission is shared by staff and administrator views and removed on reset", () => {
  const initial = initialDemo();
  const id = ROLES.staff.member.id;
  const at = "2026-11-26T00:30:00.000Z";
  assert.equal(STAFF.length, 12);
  assert.equal(initial.submissions[id], undefined);
  const submitted = updateDemo(initial, { type: "submit", id, at });
  assert.deepEqual(submitted.submissions[id], { filename: "가상-검진확인서-demo-1.pdf", submittedAt: at });
  assert.equal(Object.keys(submitted.submissions).length, Object.keys(initial.submissions).length + 1);
  assert.deepEqual(updateDemo(submitted, { type: "toggleSubmission", id, at }), initial);
  assert.deepEqual(updateDemo(submitted, { type: "reset" }), initial);
});

test("class progression updates current, next, completion and timestamps without changing evidence", () => {
  const initial = initialDemo();
  let state = updateDemo(initial, { type: "advance" });
  const { current, next } = deriveHealthCheckProgress(state.schedule.classes);
  assert.equal(current.classId, "2학년 3반");
  assert.equal(next.classId, "2학년 4반");
  assert.equal(state.schedule.classes[1].displayStatus, "completed");
  assert.ok(Date.parse(state.schedule.session.updatedAt) > Date.parse(initial.schedule.session.updatedAt));

  for (let count = 0; count < 4; count += 1) state = updateDemo(state, { type: "advance" });
  assert.equal(state.schedule.session.status, "completed");
  assert.ok(state.schedule.classes.every(({ displayStatus }) => displayStatus === "completed"));
  assert.equal(updateDemo(state, { type: "advance" }).schedule, state.schedule);
  assert.equal(state.submissions, initial.submissions);
  assert.deepEqual(updateDemo(state, { type: "resetSchedule" }).schedule, initial.schedule);
});

test("CPR, legal training, and schedule controls change independent records", () => {
  const initial = initialDemo();
  const id = ROLES.staff.member.id;
  const cpr = updateDemo(initial, { type: "toggleCpr", id });
  const legal = updateDemo(cpr, { type: "toggleLegal", id });
  assert.equal(cpr.cpr[id], null);
  assert.equal(legal.legal[id], true);
  assert.equal(cpr.legal, initial.legal);
  assert.equal(legal.cpr, cpr.cpr);
  assert.equal(updateDemo(legal, { type: "resetSchedule" }).legal, legal.legal);
});
