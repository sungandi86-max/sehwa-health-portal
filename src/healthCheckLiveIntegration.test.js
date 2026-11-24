import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("live health check route stays behind the existing staff assignment gate", () => {
  const app = read("./App.jsx");
  const page = read("./pages/FirebaseHealthCheckLivePage.jsx");
  assert.match(app, /path="\/firebase-checkups\/live"/);
  assert.match(page, /FirebaseStaffSubmissionAccessGate readOnly/);
  assert.match(page, /accessTitle="별도검사 일정·진행 현황"/);
});

test("secondary Firebase integration is read-only and cannot access student collections", () => {
  const client = read("./lib/healthCheckPublicScheduleClient.js");
  assert.match(client, /health_check_public_schedules/);
  assert.match(client, /orderBy\("examDate", "desc"\)/);
  assert.match(client, /limit\(24\)/);
  assert.match(client, /limit\(40\)/);
  assert.doesNotMatch(client, /health_check_students|health_check_operation_logs/);
  assert.doesNotMatch(client, /addDoc|setDoc|updateDoc|deleteDoc|writeBatch/);
});

test("checkup landing page links to the live schedule without replacing existing guidance", () => {
  const page = read("./pages/FirebaseCheckupsPage.jsx");
  assert.match(page, /별도검사 일정·진행 현황/);
  assert.match(page, /href="\/firebase-checkups\/live"/);
  assert.match(page, /getActiveCheckups/);
});

test("completed sessions do not retain active progress styling", () => {
  const view = read("./components/HealthCheckLiveView.jsx");
  assert.match(view, /active=\{selected\.status === "inProgress" && Boolean\(progress\.current\)\}/);
  assert.match(view, /PortalBadge tone=\{classStatusTones\[status\]/);
});
