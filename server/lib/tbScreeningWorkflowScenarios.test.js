import test from "node:test";
import assert from "node:assert/strict";
import { recordQaTbReceipt } from "./tbScreeningWorkflowStore.js";
import { handleTbScreeningWorkflowRequest } from "./tbScreeningWorkflowApi.js";
import { saveHealthScreeningType } from "./healthScreeningTypeStore.js";
import { verifyCurrentStaffSubmissionIdentity } from "./tbSubmissionGuard.js";
import { getAssignmentId } from "./staffDirectory.js";

const context = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" };
const staffId = "scenario-staff";
function fixture() {
  const records = new Map();
  const collections = [];
  let queue = Promise.resolve();
  const snapshot = (path) => ({ id: path.split("/").at(-1), exists: records.has(path), data: () => records.get(path) });
  function collection(path, filters = [], after = "", count = 100) {
    return {
      doc(id) { const target = `${path}/${id}`; return { path: target, id, get: async () => snapshot(target), collection: (name) => collection(`${target}/${name}`) }; },
      where: (key, operator, value) => collection(path, [...filters, [key, value]], after, count),
      orderBy: () => collection(path, filters, after, count),
      startAfter: (id) => collection(path, filters, id, count),
      limit: (limit) => collection(path, filters, after, limit),
      async get() { return { docs: [...records.keys()].filter((key) => key.startsWith(`${path}/`) && key.split("/").length === path.split("/").length + 1)
        .sort().map(snapshot).filter((item) => item.id > after && filters.every(([key, value]) => item.data()[key] === value)).slice(0, count) }; },
    };
  }
  const db = { collection(name) { collections.push(name); return collection(name); }, runTransaction(callback) {
    const run = queue.then(async () => {
      const writes = [];
      const result = await callback({ get: async (ref) => snapshot(ref.path), set: (ref, value) => writes.push([ref.path, value]),
        create(ref, value) { assert.equal(records.has(ref.path), false); writes.push([ref.path, value]); } });
      writes.forEach(([path, value]) => records.set(path, value)); return result;
    }); queue = run.catch(() => {}); return run;
  } };
  async function request(method, input, roles = ["staff"], token = "synthetic", deployment = context) {
    const actor = roles.includes("health_teacher") ? "scenario-manager" : staffId;
    records.set(`user_assignments_qa/${getAssignmentId(actor)}`, { uid: actor, staffId: actor, active: true, roles });
    const req = { method, query: method === "GET" ? input : {}, body: method === "POST" ? input : undefined,
      headers: token ? { authorization: `Bearer ${token}` } : {} };
    const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
    await handleTbScreeningWorkflowRequest(req, response, { context: deployment,
      authAccess: (request, options) => verifyCurrentStaffSubmissionIdentity(request, { ...options,
        auth: () => ({ verifyIdToken: async () => ({ uid: actor }) }), database: () => db }),
      directory: async () => ({ directory: [{ staffId, employmentStatus: "재직" }] }), verifyEvidenceFile: async () => true });
    return response;
  }
  const receipt = (mode = "self", year = 2026) => recordQaTbReceipt(db, { submissionId: `scenario-${mode}-${year}`, staffId,
    subjectStaffId: staffId, schoolYear: year, environment: "qa", type: "tb", fileId: `file-${mode}-${year}`,
    evidenceRoute: "individual", submittedAt: "2026-10-15", requestFingerprint: `hash-${mode}`, submissionMode: mode }, { context });
  const route = () => saveHealthScreeningType(db, { staffId, schoolYear: 2026, screeningType: "nhis", source: "self",
    confirmedBy: staffId, expectedRevision: 0, confirmedAt: "2026-10-15" });
  return { records, collections, db, request, receipt, route };
}

for (const mode of ["self", "proxy"]) test(`${mode}: route and receipt remain separate until public administrator confirmation`, async () => {
  const f = fixture();
  await f.route();
  const query = { schoolYear: 2026 };
  assert.equal((await f.request("GET", query)).value.item.completed, false);
  await f.receipt(mode);
  const pending = await f.request("GET", query);
  assert.equal(pending.code, 200);
  assert.equal(pending.value.item.status.status, "pending");
  assert.equal(pending.value.item.completed, false);
  assert.equal(pending.value.item.routeMismatch, true);
  assert.equal(pending.value.item.route.screeningType, "nhis");
  const input = { ...query, scope: "admin", staffId, action: "confirm", submissionId: `scenario-${mode}-2026`, expectedRevision: 0 };
  const approvals = await Promise.all([f.request("POST", input, ["health_teacher"]), f.request("POST", input, ["health_teacher"])]);
  assert.deepEqual(approvals.map((item) => item.code), [200, 200]);
  const completed = (await f.request("GET", query)).value.item;
  assert.equal(completed.completed, true);
  assert.equal(completed.status.confirmedBy, "scenario-manager");
  assert.equal(completed.route.screeningType, "nhis");
  assert.equal([...f.records.keys()].filter((key) => key.includes("confirmationHistory")).length, 1);
  assert.equal((await f.request("POST", { ...input, action: "invalidate", expectedRevision: 0 }, ["health_teacher"])).code, 409);
  assert.equal((await f.request("POST", { ...input, action: "invalidate", expectedRevision: 1 }, ["health_teacher"])).code, 200);
  const invalid = (await f.request("GET", query)).value.item;
  assert.equal(invalid.completed, true);
  assert.equal(invalid.status.discrepancy, true);
  assert.equal(f.records.get(`staff_submission_status_qa/${staffId}_tb-screening-2026/confirmationHistory/1`).action, "confirm");
  assert.ok(f.collections.every((name) => name.endsWith("_qa")), f.collections.join(","));
});

test("receipt alone cannot complete and the next year inherits neither route nor evidence", async () => {
  const f = fixture(); await f.receipt();
  assert.equal((await f.request("GET", { schoolYear: 2026 })).value.item.completed, false);
  await f.route();
  const next = (await f.request("GET", { schoolYear: 2027 })).value.item;
  assert.equal(next.completed, false); assert.deepEqual(next.evidence, []);
  assert.equal(next.route.screeningTypeConfirmed, false);
  await f.receipt("self", 2027);
  const configuredFixture = (await f.request("GET", { schoolYear: 2027 })).value.item;
  assert.equal(configuredFixture.taskId, "tb-screening-2027");
  assert.equal(configuredFixture.evidence[0].schoolYear, 2027);
  assert.equal((await f.request("POST", { schoolYear: 2027, scope: "admin", staffId, action: "confirm", submissionId: "scenario-self-2027", expectedRevision: 0 }, ["health_teacher"])).code, 400);
});

test("real authentication helper uses QA assignments; forbidden callers and environment fail closed", async () => {
  const f = fixture();
  assert.equal((await f.request("GET", { schoolYear: 2026 }, ["staff"], "")).code, 401);
  assert.equal((await f.request("GET", { schoolYear: 2026, scope: "admin", staffId }, ["training_admin"])).code, 403);
  assert.equal((await f.request("GET", { schoolYear: 2026, staffId: "foreign" })).code, 403);
  assert.equal((await f.request("GET", {})).code, 400);
  assert.ok(f.collections.every((name) => name.endsWith("_qa")));
  const before = f.collections.length;
  assert.equal((await f.request("GET", { schoolYear: 2026 }, ["staff"], "synthetic", { VERCEL_ENV: "production" })).code, 503);
  assert.equal(f.collections.length, before);
});
