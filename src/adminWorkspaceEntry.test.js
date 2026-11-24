import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("admin entry opens the shared workspace dashboard", () => {
  const headerSource = readSource("./components/Header.jsx");
  const homeAuthSource = readSource("./components/FirebaseHomeAuthPanel.jsx");
  const dashboardSource = readSource("./pages/FirebaseDashboardPage.jsx");

  assert.match(headerSource, /navigate\("\/firebase-dashboard"\)/);
  assert.match(homeAuthSource, /to="\/firebase-dashboard"/);
  assert.match(dashboardSource, /<AdminWorkspaceLayout/);
  assert.match(dashboardSource, /title="관리자 대시보드"/);
});

test("dashboard workspace keeps grouped administrator navigation and returns to the portal", () => {
  const layoutSource = readSource("./components/AdminWorkspaceLayout.jsx");
  const navigationSource = readSource("./data/adminNavigation.js");

  for (const label of [
    "관리자 홈",
    "제출·검토",
    "검진·검사",
    "교육·연수",
    "계정·권한",
    "감염병",
  ]) {
    assert.match(navigationSource, new RegExp(label));
  }

  assert.match(layoutSource, /location\.pathname === "\/firebase-dashboard"/);
  assert.match(layoutSource, /backTo=\{isDashboard \? "\/" : "\/firebase-dashboard"\}/);
  assert.match(layoutSource, /showDashboardLink=\{!isDashboard\}/);
});
