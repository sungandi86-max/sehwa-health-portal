import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isQaTbSyntheticOptIn, isQaTbSyntheticUser, loadQaTbPageAccess, qaTbSyntheticOverview } from "./qaTbSyntheticAccess.js";

const location = { hostname: "sehwa-health-portal-git-qa-sungandi86-maxs-projects.vercel.app", pathname: "/firebase-submit/tb", search: "?qa-tb-test=1" };
const assignment = { staffId: "QA-TB-CERT-TEST-001", roles: ["qa_tb_certificate_synthetic_staff"], active: false, schoolYear: 2026, semester: 2 };
const access = { authorized: true, schoolYear: 2026, qaTbCertificateSynthetic: true, assignment, identity: { staffId: assignment.staffId, name: "[QA-TB-CERT-TEST]" }, staffType: "교직원" };
const user = { uid: "qa-tb-certificate-test-001", getIdToken: async () => "fixture-token" };
const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function gateHarness(loadAccess, qaOptIn = true) {
  let callback;
  const state = { bootstrap: 0, assignment: null };
  const bootstrap = async () => { state.bootstrap += 1; return { ok: true, assignment: { active: true, staffId: "ordinary" } }; };
  const noop = () => {};
  const dependencies = { qaOptIn, readOnly: false, auth: {}, CURRENT_SCHOOL_YEAR: 2026, CURRENT_SEMESTER: 2,
    onAuthStateChanged: (_auth, handler) => { callback = handler; return noop; },
    setUser: noop, setProfile: noop, setStaffIdentity: noop, setQaAccess: noop, setMessage: noop, setIsLoading: noop,
    setAssignmentResult: (result) => { state.assignment = result?.assignment || null; },
    loadQaTbPageAccess: loadAccess, isQaTbSyntheticUser, getMicrosoftSchoolDomainBlockMessage: () => "",
    ensureUserProfile: bootstrap, ensureTeamStaffAssignment: bootstrap, getUserAssignmentResult: bootstrap,
    getAuthenticatedStaffIdentity: bootstrap, signOutFirebase: noop,
  };
  const effect = source("../components/FirebaseStaffSubmissionAccessGate.jsx").match(/useEffect\(\(\) => \{([\s\S]*?)\r?\n  \}, \[readOnly, qaOptIn\]\);/)[1];
  const cleanup = new Function(...Object.keys(dependencies), effect)(...Object.values(dependencies));
  return { state, invoke: (currentUser) => callback(currentUser), cleanup };
}

test("actual gate callback avoids all Production bootstrap calls for synthetic access and preserves ordinary flow", async () => {
  const fixture = gateHarness(async () => access);
  await fixture.invoke(user);
  assert.equal(fixture.state.bootstrap, 0);
  assert.equal(fixture.state.assignment.active, false);
  const ordinary = gateHarness(async () => { throw new Error("not called"); }, false);
  await ordinary.invoke({ uid: "ordinary" });
  assert.ok(ordinary.state.bootstrap >= 3);
  fixture.cleanup(); ordinary.cleanup();
});

test("stale administrator access response cannot replace the newer synthetic assignment", async () => {
  let resolveOld;
  const fixture = gateHarness(({ user: current }) => current.uid === user.uid ? Promise.resolve(access) : new Promise((resolve) => { resolveOld = resolve; }));
  const oldRequest = fixture.invoke({ uid: "old-admin" });
  await fixture.invoke(user);
  resolveOld({ ...access, qaTbCertificateSynthetic: false, assignment: { ...assignment, active: true, staffId: "old-admin" } });
  await oldRequest;
  assert.equal(fixture.state.assignment.staffId, assignment.staffId);
  fixture.cleanup();
});

test("fixed synthetic actor without opt-in skips public Production item configuration before gate rejection", () => {
  let callback;
  let reads = 0;
  const noop = () => {};
  const dependencies = { auth: {}, isQaTbSyntheticOptIn: () => false, isQaTbSyntheticUser,
    onAuthStateChanged: (_auth, handler) => { callback = handler; return noop; },
    setItem: noop, setLoadState: noop, DEFAULT_ITEM: {}, applyIndividualHealthCheckupDisplay: noop,
    getSubmissionItem: async () => { reads += 1; return null; },
  };
  const page = source("../pages/FirebaseTbSubmitPage.jsx");
  const effect = page.slice(page.indexOf("export default function FirebaseTbSubmitPage")).match(/useEffect\(\(\) => \{([\s\S]*?)\r?\n  \}, \[\]\);/)[1];
  const cleanup = new Function(...Object.keys(dependencies), effect)(...Object.values(dependencies));
  callback(user);
  assert.equal(reads, 0);
  callback({ uid: "ordinary" });
  assert.equal(reads, 1);
  cleanup();
});

test("actual Header listener never queries Production assignments for fixed fixture with or without opt-in", async () => {
  const effect = source("../components/Header.jsx").match(/useEffect\(\(\) => \{([\s\S]*?)\r?\n  \}, \[isPublicUpload, qaOptIn\]\);/)[1];
  for (const qaOptIn of [true, false]) {
    let callback;
    let reads = 0;
    const noop = () => {};
    const dependencies = { qaOptIn, isPublicUpload: false, auth: {}, CURRENT_SCHOOL_YEAR: 2026, CURRENT_SEMESTER: 2,
      onAuthStateChanged: (_auth, handler) => { callback = handler; return noop; }, setCurrentUser: noop, setAssignment: noop,
      isQaTbSyntheticUser, loadQaTbPageAccess: async () => access,
      getUserAssignmentResult: async () => { reads += 1; return { assignment: { active: true } }; },
    };
    const cleanup = new Function(...Object.keys(dependencies), effect)(...Object.values(dependencies));
    await callback(user);
    assert.equal(reads, 0);
    if (!qaOptIn) { await callback({ uid: "ordinary" }); assert.equal(reads, 1); }
    cleanup();
  }
});

test("synthetic opt-in is fixed QA hostname, explicit query and existing TB pages only", () => {
  assert.equal(isQaTbSyntheticOptIn(location), true);
  assert.equal(isQaTbSyntheticOptIn({ ...location, pathname: "/my-submission-status" }), true);
  for (const change of [{ hostname: "production.example" }, { search: "" }, { pathname: "/firebase-submit/cpr" }]) assert.equal(isQaTbSyntheticOptIn({ ...location, ...change }), false);
});

test("server-verified synthetic permission preserves inactive assignment and explicit staffType", async () => {
  const calls = [];
  const result = await loadQaTbPageAccess({ user, schoolYear: 2026, location, fetchImpl: async (url, options) => {
    calls.push([url, options]); return { ok: true, json: async () => ({ ok: true, access }) };
  } });
  assert.equal(result.assignment.active, false);
  assert.equal(result.qaSyntheticAccess, true);
  assert.equal(result.staffType, "교직원");
  assert.match(calls[0][0], /resource=tb-screening-workflow/);
  assert.match(calls[0][0], /accessOnly=true/);
  assert.match(calls[0][0], /schoolYear=2026/);
  assert.equal(calls[0][1].method, "GET");
});

test("wrong fixture, active assignment, missing opt-in and server denial cannot enable synthetic access", async () => {
  for (const changed of [{ ...access, assignment: { ...assignment, active: true } }, { ...access, identity: { staffId: "foreign" } }, { ...access, staffType: "" }]) {
    await assert.rejects(loadQaTbPageAccess({ user, schoolYear: 2026, location, fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, access: changed }) }) }));
  }
  await assert.rejects(loadQaTbPageAccess({ user, schoolYear: 2026, location: { ...location, search: "" }, fetchImpl: async () => { throw new Error("must not fetch"); } }));
  await assert.rejects(loadQaTbPageAccess({ user, schoolYear: 2026, location, fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ ok: false }) }) }));
});

test("synthetic overview uses only supplied bounded QA projection and actual completion", () => {
  const workflow = { staffId: assignment.staffId, schoolYear: 2026, completed: false, status: { status: "pending", screening: { completed: false } } };
  const result = qaTbSyntheticOverview(workflow, assignment.staffId, 2026);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].taskId, "tb-screening-2026");
  assert.equal(result.summary.completed, 0);
  assert.equal(result.summary.pending, 1);
  assert.throws(() => qaTbSyntheticOverview({ ...workflow, schoolYear: 2027 }, assignment.staffId, 2026));
});

test("synthetic gate and overview return before Production profile, assignments and task/status reads", () => {
  const gate = source("../components/FirebaseStaffSubmissionAccessGate.jsx");
  assert.ok(gate.indexOf("await loadQaTbPageAccess") < gate.indexOf("await ensureUserProfile"));
  const reader = source("./staffSubmissionStatus.js");
  const overview = reader.slice(reader.indexOf("export async function getMyStaffSubmissionStatus"));
  assert.ok(overview.indexOf("return qaTbSyntheticOverview") < overview.indexOf("Promise.all"));
  const header = source("../components/Header.jsx");
  assert.ok(header.indexOf("isQaTbSyntheticUser(firebaseUser)") < header.indexOf("await getUserAssignmentResult"));
});
