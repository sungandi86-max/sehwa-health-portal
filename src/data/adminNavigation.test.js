import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_HOME, ADMIN_NAV_GROUPS, getActiveAdminNavigation, getAdminBreadcrumbs } from "./adminNavigation.js";

const location = (pathname, search = "", hash = "") => ({ pathname, search, hash });

test("admin navigation preserves the dashboard and five workflow groups", () => {
  assert.equal(ADMIN_HOME.to, "/firebase-dashboard");
  assert.deepEqual(ADMIN_NAV_GROUPS.map(({ label }) => label), ["제출·검토", "검진·검사", "교육·연수", "계정·권한", "감염병"]);
  assert.equal(ADMIN_NAV_GROUPS.flatMap(({ items }) => items).filter(({ to }) => to).length, 18);
});

test("planned checkup integration is visible as a non-interactive status", () => {
  const planned = ADMIN_NAV_GROUPS.flatMap(({ items }) => items).find(({ id }) => id === "checkup-helper");
  assert.equal(planned.to, null);
  assert.equal(planned.planned, true);
  assert.equal(planned.statusLabel, "연동 예정");
});

test("specific query and hash destinations win over their parent screen", () => {
  assert.equal(getActiveAdminNavigation(location("/firebase-admin/submissions", "?tab=infection")).itemId, "infection-reports");
  assert.equal(getActiveAdminNavigation(location("/firebase-admin/submission-status", "?item=cpr")).itemId, "cpr-receipts");
  assert.equal(getActiveAdminNavigation(location("/firebase-admin/staff-submission-status", "?task=cpr-training-2026", "#completion-status")).itemId, "cpr-completion");
  assert.equal(getActiveAdminNavigation(location("/firebase-admin/staff-submission-status", "?task=tb-screening-2026")).itemId, "tb-completion");
  assert.equal(getActiveAdminNavigation(location("/firebase-admin/trainings", "?mode=manual-cpr-2026")).itemId, "cpr-batch");
  assert.equal(getActiveAdminNavigation(location("/firebase-admin/staff-submission-status", "", "#training-source-refresh")).itemId, "research-refresh");
});

test("existing direct URLs keep a useful active destination", () => {
  assert.equal(getActiveAdminNavigation(location("/firebase-admin/submissions")).itemId, "submissions");
  assert.equal(getActiveAdminNavigation(location("/firebase-admin/submission-status")).itemId, "submission-status");
  assert.equal(getActiveAdminNavigation(location("/firebase-admin/staff-submission-status")).itemId, "completion-status");
  assert.equal(getActiveAdminNavigation(location("/firebase-admin/trainings")).itemId, "trainings");
});

test("breadcrumbs describe the workflow without changing the destination", () => {
  assert.deepEqual(getAdminBreadcrumbs(location("/firebase-dashboard")), [{ label: "관리자 홈" }]);
  assert.deepEqual(getAdminBreadcrumbs(location("/firebase-admin/staff-submission-status", "", "#training-source-check")), [
    { label: "관리자 홈", to: "/firebase-dashboard" },
    { label: "교육·연수" },
    { label: "연구부 연수 원본 점검" },
  ]);
});
