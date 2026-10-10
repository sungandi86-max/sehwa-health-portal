import assert from "node:assert/strict";
import test from "node:test";
import submitHandler from "../../api/submit.js";
import adminHandler, { replaceQaInbodySummary } from "../../api/health-room-status.js";
import { InbodyRequestStore } from "./inbodyRequestStore.js";

const qaContext = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" };
const productionContext = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" };
const fields = { name: "[QA] 합성", dept: "[QA] 부서", preferredDate: "2026-10-15", preferredTime: "12:00" };

function database() {
  const collections = new Map();
  return {
    collection(name) {
      if (!collections.has(name)) collections.set(name, new Map());
      const docs = collections.get(name);
      return {
        doc(id) { return {
          async create(data) { if (docs.has(id)) throw new Error("duplicate"); docs.set(id, data); },
          async get() { return { id, exists: docs.has(id), data: () => docs.get(id) }; },
        }; },
        async get() { return { docs: [...docs].map(([id, data]) => ({ id, data: () => data })) }; },
      };
    },
    collections,
  };
}

async function ready(db) {
  await db.collection("inbody_request_readiness_production").doc("state").create({
    environment: "production", status: "ready", schemaVersion: 1, migratedCount: 0,
  });
}

function request(payload) {
  return { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer fixture" },
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(payload)); } };
}

function response() {
  return { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }, end() { return this; } };
}

test("QA Inbody store creates a canonical Firestore request and reads it back", async () => {
  const db = database();
  const store = new InbodyRequestStore({ database: () => db, context: () => qaContext, requestId: () => "QA-INBODY-001" });
  const created = await store.createRequest({ staffId: "QA-INBODY-STAFF-001", fields, now: new Date("2026-10-10T01:00:00.000Z") });
  assert.equal(store.collectionName, "inbody_requests_qa");
  assert.deepEqual([created.name, created.department, created.preferredDate, created.preferredTime],
    [fields.name, fields.dept, fields.preferredDate, fields.preferredTime]);
  assert.equal(created.environment, "qa");
  assert.equal(created.status, "received");
  assert.deepEqual(await store.getRequest(created.requestId), created);
  assert.deepEqual(await store.listRequests(), [created]);
  assert.equal(db.collections.has("inbody_requests_production"), false);
});

test("Production requires its readiness marker and arbitrary Preview cannot access either ledger", async () => {
  const db = database();
  const production = new InbodyRequestStore({ database: () => db, context: () => productionContext });
  assert.equal(production.backend, "firestore");
  await assert.rejects(production.createRequest({ staffId: "T001", fields }), /준비되지 않았습니다/);
  await assert.rejects(production.listRequests(), /준비되지 않았습니다/);
  assert.equal(db.collections.has("inbody_requests_production"), false);
  await ready(db);
  assert.deepEqual(await production.listRequests(), []);
  const arbitrary = new InbodyRequestStore({ database: () => db,
    context: () => ({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature" }) });
  assert.throws(() => arbitrary.backend, /승인된 배포 환경/);
  await assert.rejects(arbitrary.createRequest({ staffId: "T001", fields }), /승인된 배포 환경/);
  assert.equal(db.collections.has("inbody_requests_qa"), false);
  assert.equal(db.collections.has("inbody_requests_production"), true);
});

test("Production creates only an environment-matched Firestore request after readiness", async () => {
  const db = database();
  await ready(db);
  const store = new InbodyRequestStore({ database: () => db, context: () => productionContext,
    requestId: () => "PROD-INBODY-001" });
  const saved = await store.createRequest({ staffId: "T001", fields, now: new Date("2026-10-10T01:00:00.000Z") });
  assert.equal(saved.environment, "production");
  assert.deepEqual(await store.listRequests(), [saved]);
  await assert.rejects(store.createRequest({ staffId: "T001", fields }), /duplicate/);
  assert.equal(db.collections.has("inbody_requests_qa"), false);
});

test("Production submit writes through Firestore and never calls Apps Script", async () => {
  const db = database();
  await ready(db);
  const store = new InbodyRequestStore({ database: () => db, context: () => productionContext,
    requestId: () => "PROD-INBODY-API-001" });
  const result = response();
  await submitHandler(request({ type: "inbody", fields, sheetName: "Injected", folderId: "Injected" }), result,
    { inbodyStore: store, destinationUrl: "", proxySecret: "",
      verifyStaff: async () => ({ ok: true, staffId: "T001", roles: ["staff"] }),
      postScript: async () => { throw new Error("Apps Script must not be called"); } });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.requestId, "PROD-INBODY-API-001");
  assert.equal((await store.getRequest(result.body.requestId)).environment, "production");
  assert.equal(db.collections.has("inbody_requests_qa"), false);
});

test("Production rejects an invalid marker and cross-environment request documents", async () => {
  const db = database();
  await db.collection("inbody_request_readiness_production").doc("state").create({
    environment: "qa", status: "ready", schemaVersion: 1, migratedCount: 0,
  });
  const store = new InbodyRequestStore({ database: () => db, context: () => productionContext });
  await assert.rejects(store.listRequests(), /준비되지 않았습니다/);
  assert.equal(db.collections.has("inbody_requests_production"), false);
  const marker = db.collections.get("inbody_request_readiness_production");
  marker.set("state", { environment: "production", status: "ready", schemaVersion: 1, migratedCount: 0 });
  await db.collection("inbody_requests_production").doc("QA-LEAK").create({
    requestId: "QA-LEAK", environment: "qa", submittedAt: "2026-10-10T01:00:00.000Z",
  });
  await assert.rejects(store.listRequests(), /환경·문서 ID/);
});

test("QA submit uses Firestore after staff auth and never calls Apps Script", async () => {
  const db = database();
  const store = new InbodyRequestStore({ database: () => db, context: () => qaContext, requestId: () => "QA-INBODY-002" });
  const result = response();
  await submitHandler(request({ type: "inbody", fields, sheetName: "Injected", folderId: "Injected" }), result,
    { inbodyStore: store, destinationUrl: "", proxySecret: "",
      verifyStaff: async () => ({ ok: true, staffId: "QA-INBODY-STAFF-001", roles: ["staff"] }),
      postScript: async () => { throw new Error("Apps Script must not be called"); } });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, "success");
  const saved = await store.getRequest(result.body.requestId);
  assert.equal(saved.staffId, "QA-INBODY-STAFF-001");
  assert.equal(JSON.stringify(saved).includes("Injected"), false);
});

test("QA submit rejects unauthenticated staff without writing", async () => {
  const db = database();
  const store = new InbodyRequestStore({ database: () => db, context: () => qaContext });
  const result = response();
  await submitHandler(request({ type: "inbody", fields }), result,
    { inbodyStore: store, verifyStaff: async () => ({ ok: false, status: 401, message: "로그인이 필요합니다." }) });
  assert.equal(result.statusCode, 401);
  assert.equal(db.collections.size, 0);
});

test("QA and Production administrators read isolated Firestore ledgers while staff is denied", async () => {
  const db = database();
  const qa = new InbodyRequestStore({ database: () => db, context: () => qaContext, requestId: () => "QA-INBODY-ADMIN-001" });
  await qa.createRequest({ staffId: "QA-INBODY-STAFF-001", fields, now: new Date("2026-10-10T01:00:00.000Z") });
  const payload = { action: "getInbodyRequests" };
  const staff = response();
  await adminHandler(request(payload), staff, { inbodyStore: qa,
    verifyAccess: async () => ({ ok: true, assignment: { active: true, roles: ["staff"] } }) });
  assert.equal(staff.statusCode, 403);
  const admin = response();
  await adminHandler(request(payload), admin, { inbodyStore: qa,
    verifyAccess: async () => ({ ok: true, assignment: { active: true, roles: ["admin"] } }) });
  assert.equal(admin.statusCode, 200);
  assert.equal(admin.body.source, "firestore");
  assert.equal(admin.body.totalCount, 1);
  assert.equal("requests" in admin.body, false);
  const production = response();
  await ready(db);
  await adminHandler(request(payload), production, { inbodyStore: new InbodyRequestStore({ database: () => db, context: () => productionContext }),
    verifyAccess: async () => ({ ok: true, assignment: { active: true, roles: ["admin"] } }) });
  assert.equal(production.statusCode, 200);
  assert.equal(production.body.environment, "production");
  assert.equal(production.body.totalCount, 0);
  assert.equal(production.body.qaSyntheticRequest, null);
});

test("common summary replaces Inbody counts with Firestore counts in both environments", async () => {
  const db = database();
  const qa = new InbodyRequestStore({ database: () => db, context: () => qaContext, requestId: () => "QA-INBODY-SUMMARY-001" });
  await qa.createRequest({ staffId: "QA-INBODY-STAFF-001", fields });
  const sheetSummary = { success: true,
    sections: [{ id: "submitReports", items: [{ id: "cpr", todayCount: 2 }] },
      { id: "eventApplications", items: [{ id: "inbody", totalCount: 0, todayCount: 0, sheetName: "응답_인바디측정신청" }] }],
    alert: { totalToday: 2, items: [{ id: "cpr", todayCount: 2 }, { id: "inbody", todayCount: 0 }] } };
  const replaced = await replaceQaInbodySummary(sheetSummary, qa);
  assert.equal(replaced.sections[0].items[0].todayCount, 2);
  assert.equal(replaced.sections[1].items[0].totalCount, 1);
  assert.equal(replaced.sections[1].items[0].source, "firestore");
  assert.equal(replaced.alert.totalToday, 3);
  await ready(db);
  const production = new InbodyRequestStore({ database: () => db, context: () => productionContext });
  const productionSummary = await replaceQaInbodySummary({ ...sheetSummary,
    sections: [{ id: "eventApplications", items: [] }] }, production);
  assert.equal(productionSummary.sections[0].items[0].totalCount, 0);
  assert.equal(productionSummary.sections[0].items[0].source, "firestore");
  assert.equal(productionSummary.alert.items.at(-1).id, "inbody");
});
