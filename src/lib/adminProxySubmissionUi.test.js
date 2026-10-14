import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

test("admin proxy UI exposes canonical selection and duplicate confirmation without replacing existing records", () => {
  const dialog = fs.readFileSync(new URL("../components/AdminProxySubmissionDialog.jsx", import.meta.url), "utf8");
  const page = fs.readFileSync(new URL("../pages/FirebaseAdminSubmissionsPage.jsx", import.meta.url), "utf8");
  assert.match(page, /대리등록/);
  assert.match(dialog, /이름, 교직원ID, 부서 검색/);
  assert.match(dialog, /이미 제출 기록이 있습니다/);
  assert.match(dialog, /추가 등록/);
  assert.match(dialog, /accept="application\/pdf,image\/jpeg,image\/png"/);
  assert.match(dialog, /createAdminProxyTbSubmission/);
  assert.doesNotMatch(dialog, /deleteDoc|updateDoc/);
});

test("submission status roster joins proxy records by canonical staffId", () => {
  const source = fs.readFileSync(new URL("./submissionStatus.js", import.meta.url), "utf8");
  assert.match(source, /submission\.subjectStaffId \|\| submission\.staffId/);
  assert.match(source, /user\.assignment\?\.staffId/);
});

function loadFunctions(file, context, names) {
  const source = fs.readFileSync(new URL(file, import.meta.url), "utf8")
    .replace(/^import[\s\S]*?;\s*$/gm, "")
    .replace(/^export \{[^\n]+$/gm, "")
    .replace(/\bexport /g, "");
  return vm.runInNewContext(`${source}\n({ ${names.join(", ")} })`, context);
}

test("administrator list uses only authenticated API without direct Production query", async () => {
  const calls = [];
  const { getStaffSubmissions } = loadFunctions("./adminSubmissions.js", {
    INFECTION_LEGACY_STATUS_OPTIONS: [],
    INDIVIDUAL_HEALTH_CHECKUP_TITLE: "검진",
    auth: { currentUser: { getIdToken: async () => "test-token" } },
    getDocs: () => { throw new Error("Production direct read forbidden"); },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ ok: true, items: [
        { id: "QA-SYNTHETIC", itemId: "tb", status: "submitted", submittedAt: "2026-10-14T01:00:00Z" },
      ] }) };
    },
  }, ["getStaffSubmissions"]);
  const items = await getStaffSubmissions();
  assert.equal(items[0].id, "QA-SYNTHETIC");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /resource=admin-proxy-submissions/);
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-token");
});

test("status overview uses item-specific API and normalizes ISO dates", async () => {
  const calls = [];
  const { getSubmissionStatusOverview } = loadFunctions("./submissionStatus.js", {
    STAFF_STATUS_LABELS: {},
    formatSubmissionDateTime: () => "2026-10-14",
    applyIndividualHealthCheckupDisplay: (value) => value,
    getActiveSubmissionItems: async () => [],
    getUsersWithAssignments: async () => [{ uid: "qa-user", displayName: "QA synthetic", assignment: {
      active: true, roles: ["staff"], staffId: "QA-STAFF",
    } }],
    getDocs: () => { throw new Error("Production direct read forbidden"); },
    getAdminProxySubmissions: async (options) => {
      calls.push(options);
      return [{ id: "qa-record", itemId: "tb", staffId: "QA-STAFF", status: "submitted",
        submittedAt: "2026-10-14T01:00:00Z" }];
    },
  }, ["getSubmissionStatusOverview"]);
  const result = await getSubmissionStatusOverview("tb", 2026, 2);
  assert.equal(calls[0].itemId, "tb");
  assert.equal(result.roster[0].submission.id, "qa-record");
  assert.equal(result.roster[0].submission.submittedAtMillis, Date.parse("2026-10-14T01:00:00Z"));
});

test("QA record cannot use existing Production status writer", async () => {
  const { updateStaffSubmissionStatus } = loadFunctions("./adminSubmissions.js", {
    INFECTION_LEGACY_STATUS_OPTIONS: [], INDIVIDUAL_HEALTH_CHECKUP_TITLE: "검진",
    updateDoc: () => { throw new Error("Production write reached"); },
    writeBatch: () => { throw new Error("Production write reached"); },
  }, ["updateStaffSubmissionStatus"]);
  await assert.rejects(updateStaffSubmissionStatus({ id: "qa-record", sourceEnvironment: "qa" }, "completed"),
    /QA 제출 상태 변경/);
});

test("API failure or malformed response never falls back to Firestore", async () => {
  for (const response of [
    { ok: false, status: 503, json: async () => ({ message: "blocked environment" }) },
    { ok: true, json: async () => ({ ok: true }) },
  ]) {
    const { getStaffSubmissions } = loadFunctions("./adminSubmissions.js", {
      INFECTION_LEGACY_STATUS_OPTIONS: [], INDIVIDUAL_HEALTH_CHECKUP_TITLE: "검진",
      auth: { currentUser: { getIdToken: async () => "test-token" } },
      fetch: async () => response,
      getDocs: () => { throw new Error("Production fallback reached"); },
    }, ["getStaffSubmissions"]);
    await assert.rejects(getStaffSubmissions(), /blocked environment|응답을 확인/);
  }
});

test("missing login fails before API or Firestore call", async () => {
  const { getStaffSubmissions } = loadFunctions("./adminSubmissions.js", {
    INFECTION_LEGACY_STATUS_OPTIONS: [], INDIVIDUAL_HEALTH_CHECKUP_TITLE: "검진",
    auth: { currentUser: null },
    fetch: () => { throw new Error("Unauthenticated request reached"); },
  }, ["getStaffSubmissions"]);
  await assert.rejects(getStaffSubmissions(), { status: 401 });
});
