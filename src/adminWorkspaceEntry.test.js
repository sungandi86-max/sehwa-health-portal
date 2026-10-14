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

test("dashboard workspace keeps the admin menu and returns to the portal", () => {
  const layoutSource = readSource("./components/AdminWorkspaceLayout.jsx");

  for (const label of [
    "제출·보고 관리",
    "제출 현황",
    "교직원 제출·이수 현황",
    "법정의무연수 보고서",
    "교직원 교육 관리",
    "권한 신청",
    "교직원 권한 관리",
    "감염병 사례관리",
  ]) {
    assert.match(layoutSource, new RegExp(label));
  }

  assert.match(layoutSource, /pathname === "\/firebase-dashboard"/);
  assert.match(layoutSource, /backTo=\{isDashboard \? "\/" : "\/firebase-dashboard"\}/);
  assert.match(layoutSource, /showDashboardLink=\{!isDashboard\}/);
});
