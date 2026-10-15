import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("annual route controls consistently name routes rather than screening types", () => {
  for (const path of ["../components/HealthScreeningTypePanel.jsx", "../components/HealthScreeningTypeAdminPanel.jsx"]) {
    const panel = source(path);
    assert.ok(!panel.includes("검진 유형"), "current annual labels must use 검진 경로");
    assert.ok(!panel.includes("경로을"), "route copy uses the correct Korean object particle");
    assert.ok(panel.includes("검진 경로"));
  }
});

test("annual evidence label distinguishes canonical proxy and self receipts", () => {
  const panel = source("../components/HealthScreeningTypeAdminPanel.jsx");
  const label = panel.match(/\{([^{}]+\? "대리 접수" : "본인 접수")\}/)?.[1];
  assert.ok(label, "receipt source label is present");
  for (const mode of ["admin_proxy", "proxy"]) assert.equal(runInNewContext(`(${label})`, { evidence: { submissionMode: mode } }), "대리 접수");
  assert.equal(runInNewContext(`(${label})`, { evidence: { submissionMode: "self" } }), "본인 접수");
});

test("dedicated and legacy certificate QA payloads explicitly include year, Production modal omits it", () => {
  const modal = source("../components/SubmitModal.jsx");
  const payload = modal.slice(modal.indexOf('type: "tb",'), modal.indexOf('type: "tb",') + 300);
  const spread = payload.match(/\.\.\.\((globalThis.location\?\.hostname === QA_INBODY_HOST \? \{ schoolYear: CURRENT_SCHOOL_YEAR \} : \{\})\)/);
  assert.ok(spread, "legacy QA certificate payload must explicitly include configured year");
  const context = { QA_INBODY_HOST: "fixed-qa", CURRENT_SCHOOL_YEAR: 2026 };
  assert.equal(runInNewContext(`(${spread[1]})`, { ...context, location: { hostname: "fixed-qa" } }).schoolYear, 2026);
  assert.equal(Object.keys(runInNewContext(`(${spread[1]})`, { ...context, location: { hostname: "production" } })).length, 0);
  assert.ok(source("../pages/FirebaseTbSubmitPage.jsx").includes('...(TB_QA ? { schoolYear: CURRENT_SCHOOL_YEAR,'), "dedicated QA certificate payload must explicitly include configured year");
});

test("existing group registration status gate supplies an explicit configured year", () => {
  const modal = source("../components/SubmitModal.jsx");
  assert.match(modal, /import \{ CURRENT_SCHOOL_YEAR \} from "\.\.\/config\/school.js"/);
  assert.match(modal, /getStaffSubmissionTaskStatus\(nextIdentity.staffId, TB_SCREENING_TASK_ID, \{ schoolYear: CURRENT_SCHOOL_YEAR \}\)/);
});

test("annual panels have no automatic save on open or filter changes", () => {
  for (const path of ["../components/HealthScreeningTypePanel.jsx", "../components/HealthScreeningTypeAdminPanel.jsx"]) {
    const text = source(path);
    const effects = [...text.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\}, \[/g)];
    assert.ok(effects.length);
    for (const effect of effects) assert.doesNotMatch(effect[1], /saveHealthScreeningType/);
    assert.match(text, /onSubmit=/);
  }
});

test("fixed QA blocks legacy completion write before Firestore persistence", () => {
  const text = source("./staffSubmissionStatusAdmin.js");
  const writer = text.slice(text.indexOf("export async function updateAdminTbScreeningStatus"));
  assert.ok(writer.indexOf("isHealthScreeningTypeQaHost") < writer.indexOf("await setDoc"));
  assert.match(writer, /return reviewTbScreeningEvidence/);
  assert.match(writer, /if \(!workflow\?\.submissionId\) throw new Error/);
});

test("QA TB readers use explicit year server workflow and exclude Production TB reads", () => {
  const self = source("./staffSubmissionStatus.js");
  const admin = source("./staffSubmissionStatusAdmin.js");
  assert.match(self, /validatedSchoolYear\(schoolYear\)/);
  assert.match(self, /STAFF_STATUS_TASK_IDS.filter\(\(id\) => id !== TB_SCREENING_TASK_ID\)/);
  assert.match(admin, /task.taskId === TB_SCREENING_TASK_ID \? Promise.resolve\(\{ docs: \[\] \}\)/);
  assert.match(admin, /annualData/);
});

test("annual workflow surfaces separate evidence and completion", () => {
  assert.match(source("../components/HealthScreeningTypePanel.jsx"), /확인자료:/);
  assert.match(source("../components/HealthScreeningTypePanel.jsx"), /workflow.completed/);
  assert.match(source("./tbScreeningWorkflowClient.js"), /evidenceComplete === false/);
});

test("certificate and proxy writers do not import or write annual type ledger", () => {
  for (const path of ["../../server/lib/tbScreeningStatus.js", "../../server/lib/adminProxySubmission.js", "../../api/submit.js"]) {
    assert.doesNotMatch(source(path), /healthScreeningType|staff_health_screening_types/);
  }
});
