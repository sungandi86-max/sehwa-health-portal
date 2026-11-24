import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("grouped sidebar exposes disclosure state, active route, and mobile close behavior", () => {
  const source = readSource("./components/WorkspaceShell.jsx");
  assert.match(source, /aria-expanded=\{isOpen\}/);
  assert.match(source, /activeGroup === group\.id/);
  assert.match(source, /onClick=\{closeMenu\}/);
  assert.match(source, /aria-current=\{active === item\.id \? "page"/);
  assert.match(source, /workspace-nav-planned/);
  assert.match(source, /currentGroupLabel \? `\$\{currentGroupLabel\} · \$\{currentLabel\}`/);
});

test("administrator shell derives breadcrumbs and active groups from the current URL", () => {
  const source = readSource("./components/AdminWorkspaceLayout.jsx");
  assert.match(source, /getActiveAdminNavigation\(location\)/);
  assert.match(source, /getAdminBreadcrumbs\(location\)/);
  assert.match(source, /groups=\{ADMIN_NAV_GROUPS\}/);
  assert.match(source, /homeItem=\{ADMIN_HOME\}/);
});

test("training navigation preserves training_admin scope and adds admin context conditionally", () => {
  const layout = readSource("./components/TrainingAdminLayout.jsx");
  const gate = readSource("./components/FirebaseAdminRoleAccessGate.jsx");
  assert.match(layout, /hasTopLevelAdminAccess \? "\/firebase-dashboard" : "\/training"/);
  assert.match(layout, /showDashboardLink=\{hasTopLevelAdminAccess\}/);
  assert.match(gate, /allowTrainingAdmin/);
  assert.match(gate, /hasTopLevelAdminAccess/);
});

test("focused administrator views render only their requested work area", () => {
  const statusPage = readSource("./pages/FirebaseStaffSubmissionStatusAdminPage.jsx");
  const trainingPage = readSource("./pages/FirebaseTrainingAdminPage.jsx");
  const researchPanel = readSource("./components/ResearchTrainingDryRunPanel.jsx");
  const hook = readSource("./lib/useDeferredHashNavigation.js");

  for (const id of ["annual-screening-type", "training-source-check", "legal-training-exceptions", "completion-status"]) {
    assert.match(statusPage, new RegExp(`id="${id}"`));
  }
  assert.match(statusPage, /activeView\.mode === "screening"/);
  assert.match(statusPage, /activeView\.mode === "research"/);
  assert.match(statusPage, /activeView\.mode === "exceptions"/);
  assert.match(statusPage, /activeView\.mode === "completion"/);
  assert.match(trainingPage, /id="manual-cpr-batch"/);
  assert.match(researchPanel, /id="training-source-refresh"/);
  assert.match(hook, /document\.getElementById\(targetId\)/);
  assert.match(hook, /scrollIntoView/);
});

test("all existing application routes remain registered", () => {
  const app = readSource("./App.jsx");
  assert.equal((app.match(/<Route path=/g) || []).length, 46);
  assert.match(app, /path="\/firebase-checkups\/live"/);
  assert.match(app, /path="\/admin\/infections" element=\{<Navigate to="\/firebase-admin\/infections" replace/);
  assert.match(app, /path="\/admin\/infection-reports" element=\{<Navigate to="\/firebase-admin\/infections" replace/);
});
