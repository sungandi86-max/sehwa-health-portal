import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleHealthScreeningTypeRequest } from "./healthScreeningTypeApi.js";

function fixture() {
  const records = new Map();
  const operations = [];
  let queue = Promise.resolve();
  const snapshot = (path) => ({ exists: records.has(path), data: () => records.get(path) });
  const collection = (path) => ({
    doc: (id) => ({ path: `${path}/${id}`, get: async () => snapshot(`${path}/${id}`), collection: (name) => collection(`${path}/${id}/${name}`) }),
    where: (field, operator, value) => {
      const query = { orderBy: () => query, limit: () => query, startAfter: () => query, get: async () => {
        operations.push([path, field, operator, value]);
        return { docs: [...records.entries()].filter(([key, item]) => key.startsWith(`${path}/`) && key.split("/").length === 2 && item[field] === value).map(([key, item]) => ({ id: key.split("/").at(-1), data: () => item })) };
      } };
      return query;
    },
    orderBy: () => ({ get: async () => ({ docs: [...records.entries()].filter(([key]) => key.startsWith(`${path}/`)).map(([, item]) => ({ data: () => item })) }) }),
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
    context: { APP_ENV: "qa", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" },
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

test("normal self/admin API ignores forged migration source and metadata", async () => {
  for (const admin of [false, true]) {
    const f = fixture();
    const input = { screeningType: "nhis", expectedRevision: 0, source: "legacy_firestore_backfill", migration: { manifestHash: "forged" }, ...(admin ? { scope: "admin", staffId: "self" } : {}) };
    const result = await f.request("POST", input, admin ? f.admin : {});
    assert.equal(result.code, 200);
    assert.equal(result.payload.item.source, admin ? "admin" : "self");
    assert.equal("migration" in result.payload.item, false);
  }
});

test("migration metadata is private while legitimate updates retain stored provenance audit", async () => {
  const f = fixture();
  const context = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" };
  const path = "staff_health_screening_types/self_2026";
  const migration = { id: "private-migration", sourceCollection: "staff_submission_status", sourceDocumentId: "self_tb-screening-2026", importedAt: "2026-10-15T00:00:00.000Z", manifestHash: "private-hash" };
  f.records.set(path, { staffId: "self", schoolYear: 2026, screeningType: "nhis", screeningTypeConfirmed: true, environment: "production", schemaVersion: 1, revision: 1, source: "legacy_firestore_backfill", selfChoice: null, confirmedBy: null, confirmedAt: null, migration });
  for (const [input, override] of [[{}, {}], [{ includeWorkflow: "true" }, {}], [{ scope: "admin" }, f.admin], [{ scope: "admin", includeWorkflow: "true" }, f.admin]]) {
    const result = await f.request("GET", input, { ...override, context });
    assert.equal(result.code, 200);
    assert.equal(JSON.stringify(result.payload).includes("private-migration"), false);
    assert.equal(JSON.stringify(result.payload).includes("private-hash"), false);
  }
  const saved = await f.request("POST", { screeningType: "individual", expectedRevision: 1 }, { context });
  assert.equal(saved.code, 200);
  assert.equal(saved.payload.item.source, "self");
  assert.equal("migration" in saved.payload.item, false);
  assert.deepEqual(f.records.get(path).migration, migration);
  assert.deepEqual(f.records.get(`${path}/history/2`).migration, migration);
  const history = await f.request("GET", { scope: "admin", staffId: "self", history: "true" }, { ...f.admin, context });
  assert.equal(history.code, 200);
  assert.equal(JSON.stringify(history.payload).includes("private-migration"), false);
});

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
  assert.doesNotMatch(source, /staffDirectory|google|Sheet|\.collection\(["']staff_submission_status["']\)/);
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

test("H: unknown deployments fail closed before authentication or data access", async () => {
  const f = fixture();
  for (const context of [{}, { APP_ENV: "qa", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "qa" }, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "main" }]) {
    assert.equal((await f.request("GET", {}, { context })).code, 503);
    assert.equal((await f.request("POST", { screeningType: "nhis" }, { context })).code, 503);
  }
  assert.equal(f.reads().authReads, 0);
  assert.equal(f.operations.length, 0);
});

const production = { context: { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" } };

test("production and QA isolate document/history writes and reads", async () => {
  const f = fixture();
  assert.equal((await f.request("POST", { screeningType: "nhis", expectedRevision: 0 })).code, 200);
  assert.equal((await f.request("GET", {}, production)).payload.item.screeningTypeConfirmed, false);
  const result = await f.request("POST", { screeningType: "employment", expectedRevision: 0 }, production);
  assert.equal(result.code, 200);
  assert.equal(result.payload.item.environment, "production");
  assert.equal((await f.request("GET")).payload.item.screeningType, "nhis");
  assert.equal((await f.request("GET", {}, production)).payload.item.screeningType, "employment");
  assert.equal(f.records.get("staff_health_screening_types/self_2026/history/1").environment, "production");
  assert.equal(f.records.get("staff_health_screening_types_qa/self_2026/history/1").environment, "qa");
});

test("production authorization preserves 401/403 and blocks synthetic identities before data access", async () => {
  const f = fixture();
  for (const status of [401, 403]) assert.equal((await f.request("GET", {}, { ...production, authAccess: async () => ({ ok: false, status, message: "Denied" }) })).code, status);
  for (const identity of [{ staffId: "QA-INBODY-TEST-001", roles: ["staff"] }, { staffId: "self", roles: ["staff", "qa_synthetic_staff"] }, { staffId: "self", roles: ["staff"], qaOnly: true }]) {
    assert.equal((await f.request("GET", {}, { ...production, authAccess: async () => ({ ok: true, ...identity }) })).code, 403);
  }
  assert.equal(f.operations.length, 0);
});

test("production canonical roster excludes QA identities and list reads once with year query", async () => {
  const f = fixture();
  let directoryReads = 0;
  const options = { ...production, ...f.admin, directory: async () => {
    directoryReads += 1;
    return { directory: [{ staffId: "self", employmentStatus: "재직" }, { staffId: "QA-CPR-TEST-001", employmentStatus: "재직" }] };
  } };
  const result = await f.request("GET", { scope: "admin", schoolYear: 2027 }, options);
  assert.deepEqual(result.payload.items.map((item) => item.staffId), ["self"]);
  assert.equal(directoryReads, 1);
  assert.deepEqual(f.operations.find(Array.isArray), ["staff_health_screening_types", "schoolYear", "==", 2027]);
  assert.equal((await f.request("POST", { scope: "admin", staffId: "QA-CPR-TEST-001", screeningType: "none", expectedRevision: 0 }, options)).code, 403);
});

test("production writes leave completion status unchanged", async () => {
  const f = fixture();
  f.records.set("staff_submission_status/self_health", { status: "completed" });
  assert.equal((await f.request("POST", { screeningType: "other", expectedRevision: 0 }, production)).code, 200);
  assert.deepEqual(f.records.get("staff_submission_status/self_health"), { status: "completed" });
  assert.equal(f.operations.some((op) => typeof op === "string" && op.includes("submission_status")), false);
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
