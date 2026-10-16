import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleHealthScreeningTypeRequest } from "./healthScreeningTypeApi.js";

function fixture() {
  const records = new Map();
  const operations = [];
  let queue = Promise.resolve();
  const snapshot = (path) => ({ exists: records.has(path), data: () => records.get(path) });
  const collection = (path, filters = [], cursor = "", cap = 100) => ({
    doc: (id) => ({ path: `${path}/${id}`, get: async () => snapshot(`${path}/${id}`), collection: (name) => collection(`${path}/${id}/${name}`) }),
    where: (field, operator, value) => { operations.push([path, field, operator, value]); return collection(path, [...filters, [field, value]], cursor, cap); },
    limit: (value) => collection(path, filters, cursor, value),
    startAfter: (value) => collection(path, filters, value, cap),
    get: async () => ({ docs: [...records.entries()].filter(([key, item]) => key.startsWith(`${path}/`) && key.split("/").length === 2
      && key.split("/").at(-1) > cursor && filters.every(([field, value]) => item[field] === value)).slice(0, cap)
      .map(([key, item]) => ({ id: key.split("/").at(-1), data: () => item })) }),
    orderBy: () => filters.length ? collection(path, filters, cursor, cap) : ({ get: async () => ({ docs: [...records.entries()].filter(([key]) => key.startsWith(`${path}/`)).map(([, item]) => ({ data: () => item })) }) }),
  });
  const db = { collection: (name) => { operations.push(name); return collection(name); }, runTransaction: (callback) => {
    const result = queue.then(async () => {
      const pending = [];
      const item = await callback({ get: async (ref) => snapshot(ref.path), set: (ref, data) => pending.push([ref.path, data]), create: (ref, data) => { assert.equal(records.has(ref.path), false); pending.push([ref.path, data]); } });
      pending.forEach(([path, data]) => records.set(path, data)); return item;
    });
    queue = result.catch(() => {}); return result;
  } };
  let directoryReads = 0;
  let authReads = 0;
  const options = {
    context: { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" },
    authAccess: async () => { authReads += 1; return { ok: true, db, staffId: "self", roles: ["staff"] }; },
    directory: async () => { directoryReads += 1; return { directory: [{ staffId: "self", name: "Fixture", employmentStatus: "재직" }, { staffId: "other", employmentStatus: "재직" }] }; },
    time: () => "2026-10-14T00:00:00.000Z",
  };
  async function request(method, input = {}, override = {}) {
    const res = { code: 0, payload: null, setHeader() {}, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; }, end() { return this; } };
    await handleHealthScreeningTypeRequest({ method, headers: {}, query: method === "GET" ? input : {}, body: method === "POST" ? input : undefined }, res, { ...options, ...override });
    return res;
  }
  const admin = { authAccess: async () => ({ ok: true, db, staffId: "manager", roles: ["health_teacher"] }) };
  return { records, operations, request, admin, reads: () => ({ directoryReads, authReads }) };
}

test("past annual records remain readable and unchanged by current-year confirmation", async () => {
  const f = fixture();
  const path = "staff_health_screening_types_qa/self_2025";
  const historical = { staffId: "self", schoolYear: 2025, screeningType: "employment", screeningTypeConfirmed: true, environment: "qa", schemaVersion: 1, revision: 1, source: "self" };
  f.records.set(path, historical);
  assert.equal((await f.request("GET", { schoolYear: 2025 })).payload.item.screeningType, "employment");
  assert.equal((await f.request("GET", { schoolYear: 2026 })).payload.item.screeningTypeConfirmed, false);
  assert.equal((await f.request("POST", { schoolYear: 2026, screeningType: "nhis", expectedRevision: 0 })).code, 200);
  assert.deepEqual(f.records.get(path), historical);
  assert.equal((await f.request("GET", { schoolYear: 2025 })).payload.item.screeningType, "employment");
  assert.equal((await f.request("GET", { schoolYear: 2027 })).payload.item.screeningTypeConfirmed, false);
  assert.equal((await f.request("POST", { schoolYear: 2025, screeningType: "none", expectedRevision: 1 })).code, 400);
  assert.deepEqual(f.records.get(path), historical);
});

test("A: staff self identity and administrator role restrictions", async () => {
  const f = fixture();
  assert.equal((await f.request("POST", { staffId: "other", screeningType: "nhis" })).code, 403);
  assert.equal((await f.request("GET", { scope: "admin" })).code, 403);
  assert.equal((await f.request("GET", { scope: "admin" }, { authAccess: async () => ({ ok: true, roles: ["training_admin"], staffId: "self" }) })).code, 403);
});

test("B: strict year validation; new year is unconfirmed without copying", async () => {
  const f = fixture();
  for (const schoolYear of [1999, 2101, 2026.5, "2026x"]) assert.equal((await f.request("GET", { schoolYear })).code, 400);
  assert.equal((await f.request("POST", { schoolYear: 2027, screeningType: "nhis" })).code, 400);
  assert.equal((await f.request("GET", { schoolYear: 2027 })).payload.item.screeningTypeConfirmed, false);
  assert.equal(f.records.size, 0);
});

test("C: self choice preserved by administrator override with immutable history", async () => {
  const f = fixture();
  assert.equal((await f.request("POST", { screeningType: "nhis", expectedRevision: 0 })).code, 200);
  const result = await f.request("POST", { scope: "admin", staffId: "self", screeningType: "employment", expectedRevision: 1 }, f.admin);
  assert.equal(result.payload.item.selfChoice.screeningType, "nhis");
  assert.equal(result.payload.item.source, "admin");
  assert.equal(result.payload.item.confirmedBy, "manager");
  const history = await f.request("GET", { scope: "admin", staffId: "self", history: "true" }, f.admin);
  assert.deepEqual(history.payload.history.map((item) => item.screeningType), ["nhis", "employment"]);
});

test("group route supports self and administrator writes with immutable history", async () => {
  const f = fixture();
  const self = await f.request("POST", { screeningType: "group", expectedRevision: 0 });
  assert.equal(self.code, 200);
  assert.equal(self.payload.item.screeningType, "group");
  const admin = await f.request("POST", { scope: "admin", staffId: "self", screeningType: "group", expectedRevision: 1 }, f.admin);
  assert.equal(admin.code, 200);
  const history = await f.request("GET", { scope: "admin", staffId: "self", history: "true" }, f.admin);
  assert.deepEqual(history.payload.history.map((item) => item.screeningType), ["group", "group"]);
});

test("D: concurrent revisions permit one update and reject stale revision", async () => {
  const f = fixture();
  const input = { scope: "admin", staffId: "self", screeningType: "none", expectedRevision: 0 };
  const results = await Promise.all([f.request("POST", input, f.admin), f.request("POST", input, f.admin)]);
  assert.deepEqual(results.map((result) => result.code).sort(), [200, 409]);
  assert.equal(f.records.size, 2);
});

test("E: completion status collection never accessed or changed", async () => {
  const f = fixture();
  f.records.set("staff_submission_status/self_health", { status: "completed" });
  await f.request("POST", { screeningType: "other", expectedRevision: 0 });
  assert.deepEqual(f.records.get("staff_submission_status/self_health"), { status: "completed" });
  assert.equal(f.operations.some((op) => typeof op === "string" && op.includes("submission_status")), false);
});

test("F: store has no Sheet dependency; administrator list queries year and directory once", async () => {
  const source = readFileSync(new URL("./healthScreeningTypeStore.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /staffDirectory|google|Sheet|submission_status/);
  const f = fixture();
  const result = await f.request("GET", { scope: "admin", schoolYear: 2027 }, f.admin);
  assert.equal(result.payload.items.length, 2);
  assert.equal(f.reads().directoryReads, 1);
  assert.deepEqual(f.operations.find(Array.isArray), ["staff_health_screening_types_qa", "schoolYear", "==", 2027]);
});

test("G: caller cannot spoof deployment environment", async () => {
  const f = fixture();
  assert.equal((await f.request("POST", { screeningType: "nhis", environment: "qa" })).code, 400);
  assert.equal(f.records.size, 0);
});

test("caller cannot forge migration provenance through the normal API", async () => {
  const f = fixture();
  const result = await f.request("POST", { screeningType: "nhis", expectedRevision: 0,
    source: "legacy_firestore_backfill", migration: { manifestHash: "forged" } });
  assert.equal(result.code, 200);
  assert.equal(result.payload.item.source, "self");
  assert.equal("migration" in result.payload.item, false);
});

test("H: production and unknown deployments fail closed before authentication or data access", async () => {
  const f = fixture();
  for (const context of [{ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }, {}, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "main" }]) {
    assert.equal((await f.request("GET", {}, { context })).code, 503);
    assert.equal((await f.request("POST", { screeningType: "nhis" }, { context })).code, 503);
  }
  assert.equal(f.reads().authReads, 0);
  assert.equal(f.operations.length, 0);
});

test("self writes require revision and cannot overwrite an administrator change from stale state", async () => {
  const f = fixture();
  assert.equal((await f.request("POST", { screeningType: "nhis" })).code, 400);
  assert.equal(f.records.size, 0);
  assert.equal((await f.request("POST", { screeningType: "nhis", expectedRevision: 0 })).code, 200);
  assert.equal((await f.request("POST", { scope: "admin", staffId: "self", screeningType: "employment", expectedRevision: 1 }, f.admin)).code, 200);
  assert.equal((await f.request("POST", { screeningType: "none", expectedRevision: 1 })).code, 409);
  assert.equal((await f.request("GET")).payload.item.screeningType, "employment");
  assert.equal(f.records.size, 3);
});

test("explicit annual GET joins pending evidence and exact-year approved completion", async () => {
  const f = fixture();
  f.records.set("staff_submissions_qa/receipt", { submissionId: "receipt", staffId: "self", subjectStaffId: "self",
    schoolYear: 2026, environment: "qa", type: "tb", fileId: "file", evidenceRoute: "individual", reviewState: "pending" });
  f.records.set("staff_submission_status_qa/self_tb-screening-2026", { staffId: "self", schoolYear: 2026,
    environment: "qa", taskId: "tb-screening-2026", status: "pending", screening: { completed: false } });
  const pending = await f.request("GET", { schoolYear: 2026 });
  assert.equal(pending.payload.item.workflow.completed, false);
  assert.equal(pending.payload.item.workflow.evidence.length, 1);
  const future = await f.request("GET", { schoolYear: 2027 });
  assert.equal(future.payload.item.workflow.evidence.length, 0);
  assert.equal(future.payload.item.workflow.status, null);
  const admin = await f.request("GET", { scope: "admin", schoolYear: 2026 }, f.admin);
  assert.equal(admin.payload.items.find((item) => item.staffId === "self").workflow.evidence.length, 1);
  assert.equal(admin.payload.datasets.completeness.evidence, true);
});
