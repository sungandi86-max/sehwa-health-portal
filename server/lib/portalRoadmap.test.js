import assert from "node:assert/strict";
import test from "node:test";
import {
  ROADMAP_HEADERS, RoadmapInputError, planRoadmapMigration, readRoadmap,
  roadmapCollection, roadmapViewFromRecords, saveRoadmapItem, validateRoadmapInput,
} from "./portalRoadmap.js";
import { handlePortalRoadmapResource } from "./portalRoadmapApi.js";

const production = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" };
const qa = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" };

function sheetRow({ category = "감염병", name = "보고", step = "접수", order = "1" } = {}) {
  const row = Array(24).fill("");
  row[0] = "TRUE"; row[1] = category; row[2] = name; row[3] = step;
  row[4] = "지금 할 일"; row[13] = order;
  row[14] = "자료"; row[15] = "external"; row[16] = "https://example.org";
  return row;
}

function memoryDb(records = []) {
  const data = new Map(records.map((record) => [record.id, { ...record }]));
  const snapshot = (id) => ({ id, exists: data.has(id), data: () => data.get(id) });
  return {
    data,
    collection: () => ({
      get: async () => ({ docs: [...data.keys()].map((id) => snapshot(id)) }),
      doc: (id) => ({
        get: async () => snapshot(id),
        create: async (record) => { if (data.has(id)) throw new Error("already exists"); data.set(id, record); },
        set: async (record) => { data.set(id, record); },
        update: async (fields) => { data.set(id, { ...data.get(id), ...fields }); },
      }),
    }),
  };
}

function response() {
  return { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("migration preserves guide fields, detects duplicates, and proves parity", () => {
  const values = [ROADMAP_HEADERS, sheetRow(), sheetRow({ name: "예방", order: "2" })];
  const settings = { enabled: "TRUE", adminOnly: "TRUE" };
  const plan = planRoadmapMigration(values, settings, [], "fixture_roadmap");
  assert.equal(plan.sourceRows, 2);
  assert.equal(plan.conflicts.length, 0);
  assert.deepEqual(plan.records[1].tools, [{ name: "자료", type: "external", url: "https://example.org" }]);
  assert.equal(planRoadmapMigration(values, settings, plan.records, "fixture_roadmap").alreadyMigrated, true);
  assert.equal(roadmapViewFromRecords(plan.records).items.length, 2);
  assert.equal(roadmapViewFromRecords([{ ...plan.records[0], enabled: false }, ...plan.records.slice(1)]).items.length, 0);
  const duplicate = planRoadmapMigration([ROADMAP_HEADERS, sheetRow(), sheetRow({ order: "2" })], settings, [], "fixture_roadmap");
  assert.equal(duplicate.conflicts[0].code, "duplicate_step");
});

test("roadmap collection is separated and unknown deployments fail closed", () => {
  assert.equal(roadmapCollection(qa), "portal_roadmap_qa");
  assert.equal(roadmapCollection(production), "portal_roadmap_production");
  assert.throws(() => roadmapCollection({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "other" }), RoadmapInputError);
});

test("admin create, update, deactivate and restore keep recoverable records", async () => {
  const db = memoryDb([{ id: "_config", kind: "config", enabled: true, adminOnly: true }]);
  const input = { category: "감염병", taskName: "보고", step: "접수", todo: "확인", sortOrder: 1,
    status: "not_started", visible: true, tools: [] };
  const { id } = await saveRoadmapItem(db, { action: "add", input, actorUid: "test", context: qa });
  assert.equal((await readRoadmap(db, { context: qa })).items.length, 1);
  await assert.rejects(saveRoadmapItem(db, { action: "add", input, actorUid: "test", context: qa }), RoadmapInputError);
  await saveRoadmapItem(db, { action: "update", id, input: { ...input, status: "done" }, actorUid: "test", context: qa });
  assert.equal(db.data.get(id).status, "done");
  await saveRoadmapItem(db, { action: "deactivate", id, actorUid: "test", context: qa });
  assert.equal((await readRoadmap(db, { context: qa })).items.length, 0);
  await saveRoadmapItem(db, { action: "restore", id, actorUid: "test", context: qa });
  assert.equal((await readRoadmap(db, { context: qa })).items.length, 1);
  assert.equal(db.data.size, 2);
});

test("invalid calendar dates and unsafe links are rejected", () => {
  const input = { category: "감염병", taskName: "보고", step: "접수", todo: "확인", sortOrder: 1,
    status: "not_started", visible: true, tools: [] };
  assert.throws(() => validateRoadmapInput({ ...input, dueDate: "2026-02-30" }), RoadmapInputError);
  assert.throws(() => validateRoadmapInput({ ...input, relatedSheetUrl: "javascript:alert(1)" }), RoadmapInputError);
});

test("API requires login, limits writes to admins, and never writes for staff GET", async () => {
  const original = { ...process.env };
  Object.assign(process.env, qa);
  const db = memoryDb([{ id: "_config", kind: "config", enabled: true, adminOnly: true }]);
  const auth = { verifyIdToken: async () => ({ uid: "test" }) };
  try {
    const noAuth = response();
    await handlePortalRoadmapResource({ method: "GET", headers: {} }, noAuth, { auth, db });
    assert.equal(noAuth.statusCode, 401);
    db.collection = (base => (name) => name === "user_assignments"
      ? { doc: () => ({ get: async () => ({ exists: true, data: () => ({ active: true, roles: ["staff"] }) }) }) }
      : base(name))(db.collection);
    const req = { method: "GET", headers: { authorization: "Bearer test" } };
    const staff = response();
    await handlePortalRoadmapResource(req, staff, { auth, db });
    assert.equal(staff.statusCode, 403);
    assert.equal(staff.body.roadmap, undefined);
    db.data.get("_config").adminOnly = false;
    const readable = response();
    await handlePortalRoadmapResource(req, readable, { auth, db });
    assert.equal(readable.statusCode, 200);
    assert.equal(readable.body.canEdit, false);
    const denied = response();
    await handlePortalRoadmapResource({ ...req, method: "POST", body: { action: "deactivate", id: "step_one" } }, denied, { auth, db });
    assert.equal(denied.statusCode, 403);
    assert.equal(db.data.size, 1);
  } finally {
    process.env.VERCEL_ENV = original.VERCEL_ENV;
    process.env.VERCEL_GIT_COMMIT_REF = original.VERCEL_GIT_COMMIT_REF;
  }
});

test("administrator POST writes only the selected deployment collection", async () => {
  const beforeEnv = process.env.VERCEL_ENV;
  const beforeRef = process.env.VERCEL_GIT_COMMIT_REF;
  Object.assign(process.env, qa);
  const db = memoryDb([{ id: "_config", kind: "config", enabled: true, adminOnly: true }]);
  const base = db.collection;
  const names = [];
  db.collection = (name) => {
    names.push(name);
    if (name === "user_assignments") return { doc: () => ({ get: async () => ({ exists: true, data: () => ({ active: true, roles: ["admin"] }) }) }) };
    return base(name);
  };
  const input = { category: "QA", taskName: "점검", step: "준비", todo: "확인", sortOrder: 2,
    status: "in_progress", visible: true, tools: [] };
  try {
    const res = response();
    await handlePortalRoadmapResource({ method: "POST", headers: { authorization: "Bearer test" },
      body: { action: "add", item: input } }, res, { auth: { verifyIdToken: async () => ({ uid: "test" }) }, db });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.headers["Cache-Control"], "private, no-store");
    assert.equal(db.data.size, 2);
    assert.equal(names.includes("portal_roadmap_production"), false);
    assert.equal(names.includes("portal_roadmap_qa"), true);
    const configResponse = response();
    await handlePortalRoadmapResource({ method: "POST", headers: { authorization: "Bearer test" },
      body: { action: "update-config", item: { adminOnly: false } } }, configResponse,
    { auth: { verifyIdToken: async () => ({ uid: "test" }) }, db });
    assert.equal(configResponse.statusCode, 200);
    assert.equal(db.data.get("_config").adminOnly, false);
  } finally {
    if (beforeEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = beforeEnv;
    if (beforeRef === undefined) delete process.env.VERCEL_GIT_COMMIT_REF;
    else process.env.VERCEL_GIT_COMMIT_REF = beforeRef;
  }
});
