import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../pages/FirebaseDashboardPage.jsx", import.meta.url), "utf8");
const notifications = readFileSync(new URL("../components/AdminNotificationPanel.jsx", import.meta.url), "utf8");

test("dashboard prioritizes six work tasks and compact quick navigation", () => {
  assert.match(page, /오늘 확인할 업무/);
  assert.match(page, /buildDashboardTaskCards/);
  assert.match(page, /QUICK_ACTIONS/);
  assert.equal((page.match(/label: "(제출 관리|교직원 제출·이수 현황|교직원 교육 관리|권한 관리|감염병 사례관리)"/g) || []).length, 5);
  assert.doesNotMatch(page, /MENU_GROUPS/);
  assert.doesNotMatch(page, /관리 메뉴/);
});

test("dashboard loads one annual TB dataset and joins counts in memory", () => {
  assert.equal((page.match(/loadHealthScreeningTypes\(/g) || []).length, 1);
  assert.match(page, /getTbDashboardCounts\(screeningData\.items\)/);
  assert.match(page, /Promise\.all\(/);
  assert.doesNotMatch(page, /staffId.*loadHealthScreeningTypes/);
});

test("dashboard keeps the optimized notification contract and limits visible rows", () => {
  assert.match(page, /compact maxItems=\{3\}/);
  assert.match(notifications, /notifications\.notifications\.slice\(0, maxItems\)/);
  assert.match(notifications, /useAdminNotifications\(\{ user, enabled, includeAcknowledged: showAcknowledged \}\)/);
});

test("dashboard responsive layout uses two mobile columns and three desktop columns", () => {
  assert.match(page, /grid-cols-2 gap-2 lg:grid-cols-3/);
  assert.match(page, /lg:grid-cols-\[minmax\(0,2fr\)_minmax\(280px,1fr\)\]/);
});
