import test from "node:test";
import assert from "node:assert/strict";
import { handleAdminProxySubmissionsResource, attachAnnualScreeningTypes } from "./adminProxySubmissionApi.js";
import { verifyCurrentStaffSubmissionIdentity } from "./tbSubmissionGuard.js";

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
    qaIdentity: async () => ({ ok: false, status: 403, message: "관리자 권한이 없습니다." }),
    environment: () => "qa",
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
    qaIdentity: async () => ({ ok: true, db, roles: ["health_teacher"] }),
  });
  return { res, calls };
}

test("administrator submission read retains unauthenticated 401", async () => {
  const res = response();
  await handleAdminProxySubmissionsResource({ method: "GET" }, res, {
    qaIdentity: async () => ({ ok: false, status: 401, message: "로그인이 필요합니다." }),
    environment: () => "qa",
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

test("unknown deployment denies before authentication and assignment database access", async () => {
  const res = response();
  let authReads = 0;
  await handleAdminProxySubmissionsResource({ method: "GET", query: { itemId: "tb", schoolYear: 2026 } }, res, {
    environment: () => null,
    verifyAdmin: async () => { authReads++; return { ok: true, db: { collection() { throw new Error("must not access database"); } } }; },
    qaIdentity: async () => { authReads++; throw new Error("must not authenticate"); },
  });
  assert.equal(res.statusCode, 503);
  assert.equal(authReads, 0);
});

test("new QA TB overview requires explicit year before any read", async () => {
  const { res, calls } = await read({ query: { itemId: "tb" } });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(calls, []);
});

test("QA TB overview is year bounded and uses joined workflow without another evidence scan", async () => {
  const { db, calls } = database([{ itemId: "tb", environment: "qa", schoolYear: 2026, staffId: "QA-A" },
    { itemId: "tb", environment: "qa", schoolYear: 2025 }]);
  const res = response();
  await handleAdminProxySubmissionsResource({ method: "GET", query: { itemId: "tb", schoolYear: 2026 } }, res, {
    environment: () => "qa", qaIdentity: async () => ({ ok: true, roles: ["health_teacher"], db }),
    workflows: async (database, items, year, complete) => {
      assert.equal(database, db); assert.equal(year, 2026); assert.equal(complete, true);
      return items.map((item) => ({ ...item, workflow: { completed: false, status: { revision: 0 } } }));
    },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.items.length, 1);
  assert.equal(res.body.items[0].workflow.status.revision, 0);
  assert.deepEqual(calls.filter((item) => item[0] === "where"), [["where", "schoolYear", "==", 2026]]);
  assert.deepEqual(calls.filter((item) => item[0] === "limit"), [["limit", 100]]);
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

for (const query of [{ itemId: "tb", schoolYear: 2026 }, {}]) {
  test(`QA-only administrator reads ${query.itemId ? "year-scoped TB" : "legacy overview"} using only QA assignments`, async () => {
    const { db: submissionDb } = database([{ itemId: "tb", type: "tb", environment: "qa", schoolYear: 2026 },
      { itemId: "cpr", submittedAt: "2025-10-01" }]);
    const assignmentReads = [];
    const db = { collection(name) {
      if (name.startsWith("user_assignments")) {
        assignmentReads.push(name);
        return { doc: () => ({ get: async () => ({ exists: name === "user_assignments_qa",
          data: () => ({ uid: "qa-manager", active: true, staffId: "QA-MANAGER", roles: ["health_teacher"] }) }) }) };
      }
      return submissionDb.collection(name);
    } };
    const res = response();
    await handleAdminProxySubmissionsResource({ method: "GET", query, headers: { authorization: "Bearer synthetic-token" } }, res, {
      context: { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" },
      qaIdentity: (req, options) => verifyCurrentStaffSubmissionIdentity(req, { ...options,
        auth: () => ({ verifyIdToken: async () => ({ uid: "qa-manager" }) }), database: () => db }),
      verifyAdmin: async () => {
        await db.collection("user_assignments").doc("qa-manager").get();
        return { ok: false, status: 403, message: "No Production assignment" };
      },
      workflows: async (database, items) => items,
    });
    assert.equal(res.statusCode, 200, "QA-only administrator must be accepted without a Production assignment");
    assert.deepEqual(assignmentReads, ["user_assignments_qa"]);
    if (!query.itemId) assert.equal(res.body.items.some((item) => item.itemId === "cpr" && item.schoolYear === undefined), true);
  });
}

test("legacy QA overview retains administrator role gate before submission reads", async () => {
  for (const role of ["staff", "training_admin"]) {
    const res = response();
    await handleAdminProxySubmissionsResource({ method: "GET", query: {} }, res, {
      environment: () => "qa", qaIdentity: async () => ({ ok: true, roles: [role], db: {
        collection() { throw new Error("must not read submissions for non-administrators"); },
      } }), verifyAdmin: async () => { throw new Error("must not use Production administrator auth"); },
    });
    assert.equal(res.statusCode, 403);
  }
});
