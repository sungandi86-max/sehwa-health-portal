import test from "node:test";
import assert from "node:assert/strict";
import { handleAdminProxySubmissionsResource, attachAnnualScreeningTypes } from "./adminProxySubmissionApi.js";

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("proxy admin read rejects non-admins", async () => {
  const res = response();
  await handleAdminProxySubmissionsResource({ method: "GET" }, res, {
    verifyAdmin: async () => ({ ok: false, status: 403, message: "관리자 권한이 없습니다." }),
  });
  assert.equal(res.statusCode, 403);
});

function database(records = []) {
  const calls = [];
  const db = { collection(name) {
    calls.push(["collection", name]);
    let selected = records;
    const query = {
      where(field, operator, value) {
        calls.push(["where", field, operator, value]);
        selected = selected.filter((item) => item[field] === value);
        return query;
      },
      orderBy(...args) { calls.push(["orderBy", ...args]); return query; },
      limit(value) { calls.push(["limit", value]); return query; },
      async get() { return { docs: selected.map((item, index) => ({
        id: `qa-${index}`, data: () => item,
      })) }; },
    };
    return query;
  } };
  return { db, calls };
}

async function read({ environment = "qa", query = {}, records = [] } = {}) {
  const { db, calls } = database(records);
  const res = response();
  await handleAdminProxySubmissionsResource({ method: "GET", query }, res, {
    environment: () => environment,
    verifyAdmin: async () => ({ ok: true, db }),
  });
  return { res, calls };
}

test("administrator submission read retains unauthenticated 401", async () => {
  const res = response();
  await handleAdminProxySubmissionsResource({ method: "GET" }, res, {
    verifyAdmin: async () => ({ ok: false, status: 401, message: "로그인이 필요합니다." }),
  });
  assert.equal(res.statusCode, 401);
});

test("QA list reads only QA collection and includes self and proxy submissions", async () => {
  const { res, calls } = await read({ records: [
    { itemId: "tb", submissionMode: "admin_proxy", submittedAt: new Date("2026-10-14T01:02:03Z") },
    { itemId: "cpr", submittedAt: new Date("2026-10-14T02:02:03Z") },
  ] });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.items.length, 2);
  assert.deepEqual(calls, [["collection", "staff_submissions_qa"],
    ["orderBy", "submittedAt", "desc"], ["limit", 50]]);
  assert.equal(res.body.items[0].submittedAt, "2026-10-14T02:02:03.000Z");
  assert.equal(res.body.items[0].sourceEnvironment, "qa");
});

test("Production configuration selects original collection without QA merge", async () => {
  const { res, calls } = await read({ environment: "production" });
  assert.equal(res.statusCode, 200);
  assert.equal(calls[0][1], "staff_submissions");
});

test("unknown deployment fails closed before collection access", async () => {
  const { res, calls } = await read({ environment: null });
  assert.equal(res.statusCode, 503);
  assert.deepEqual(calls, []);
});

test("item-specific overview query stays in QA with bounded records and no new composite index", async () => {
  const { res, calls } = await read({ query: { itemId: "tb" }, records: [
    { itemId: "tb" }, { itemId: "cpr" },
  ] });
  assert.equal(res.body.items.length, 1);
  assert.deepEqual(calls, [["collection", "staff_submissions_qa"],
    ["where", "itemId", "==", "tb"], ["limit", 300]]);
});

test("client-supplied environment or collection cannot redirect QA read", async () => {
  const { res, calls } = await read({ query: { environment: "production", collection: "staff_submissions" } });
  assert.equal(res.statusCode, 200);
  assert.equal(calls[0][1], "staff_submissions_qa");
});

test("invalid or repeated item filter cannot access collection", async () => {
  for (const itemId of ["unexpected", ["tb", "cpr"]]) {
    const { res, calls } = await read({ query: { itemId } });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(calls, []);
  }
});

test("read-only resource rejects mutation methods", async () => {
  const res = response();
  await handleAdminProxySubmissionsResource({ method: "POST" }, res);
  assert.equal(res.statusCode, 405);
});

test("QA annual enrichment batches only distinct listed identities without changing completion", async () => {
  const refs = []; let reads = 0;
  const db = {
    collection(name) { assert.equal(name, "staff_health_screening_types_qa"); return { doc(id) { refs.push(id); return id; } }; },
    async getAll(...ids) { reads++; assert.deepEqual(ids, ["QA-A_2026", "QA-B_2026"]); return [
      { exists: true, data: () => ({ staffId: "QA-A", schoolYear: 2026, environment: "qa", schemaVersion: 1, revision: 1, screeningTypeConfirmed: true, screeningType: "nhis" }) },
      { exists: false },
    ]; },
  };
  const result = await attachAnnualScreeningTypes(db, [{ staffId: "QA-A", status: "pending" }, { staffId: "QA-A" }, { staffId: "QA-B" }], 2026);
  assert.equal(reads, 1); assert.equal(refs.length, 2);
  assert.equal(result[0].status, "pending"); assert.equal(result[0].annualHealthScreeningType.screeningType, "nhis");
  assert.equal(result[2].annualHealthScreeningType.screeningTypeConfirmed, false);
});

test("Production does not access annual QA types", async () => {
  const { db } = database([{ staffId: "QA-A" }]); const res = response();
  await handleAdminProxySubmissionsResource({ method: "GET", query: {} }, res, {
    environment: () => "production", verifyAdmin: async () => ({ ok: true, db }),
    annualTypes: async () => { throw new Error("must not read QA annual collection"); },
  });
  assert.equal(res.statusCode, 200); assert.equal(res.body.items[0].annualHealthScreeningType, undefined);
});
