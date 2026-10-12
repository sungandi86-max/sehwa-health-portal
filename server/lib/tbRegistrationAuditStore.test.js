import assert from "node:assert/strict";
import test from "node:test";
import submitHandler from "../../api/submit.js";
import adminHandler from "../../api/health-room-status.js";
import { dryRunTbRegistrationRows, TbRegistrationAuditStore } from "./tbRegistrationAuditStore.js";

const qa = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" };
const production = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" };
const fields = { name: "[QA] 합성", dept: "[QA] 부서", registrationType: "단체검진 신청" };
const identity = { staffId: "QA-TB-STAFF-001", name: "[QA] 합성", department: "[QA] 부서" };

function database() {
  const collections = new Map();
  const docs = (name) => {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name);
  };
  const ref = (name, id) => ({ name, id });
  const snapshot = (item) => ({ id: item.id, exists: docs(item.name).has(item.id),
    data: () => docs(item.name).get(item.id) });
  return { collections,
    collection(name) { return { doc: (id) => ref(name, id),
      async get() { return { docs: [...docs(name)].map(([id, data]) => ({ id, data: () => data })) }; } }; },
    async runTransaction(work) {
      const writes = [];
      const transaction = {
        get: async (item) => snapshot(item),
        create: (item, value) => writes.push(() => {
          if (docs(item.name).has(item.id)) throw new Error("duplicate");
          docs(item.name).set(item.id, value);
        }),
        set: (item, value) => writes.push(() => docs(item.name).set(item.id,
          { ...(docs(item.name).get(item.id) || {}), ...value })),
      };
      await work(transaction);
      for (const write of writes) write();
    },
  };
}

function request(payload) {
  return { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer fixture" },
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(payload)); } };
}

function response() {
  return { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }, end() { return this; } };
}

test("legacy response rows dry-run separately from current TB status and leave incomplete rows for review", () => {
  const sheetId = 610049291;
  const rows = [
    { rowNumber: 2, values: ["2026-09-11 10:11:50", "[QA] A", "[QA] 부서", "단체검진 신청", ""] },
    { rowNumber: 3, values: ["2026-09-14 8:34:56", "[QA] B", "[QA] 부서", "단체검진 신청", ""] },
    { rowNumber: 4, values: ["", "[QA] C", "", "", ""] },
  ];
  const directory = [{ staffId: "QA-TB-A", name: "[QA] A", department: "[QA] 부서" },
    { staffId: "QA-TB-B", name: "[QA] B", department: "[QA] 부서" }];
  const first = dryRunTbRegistrationRows({ rows, directory, sheetId, environment: "production" });
  assert.deepEqual(first.map((item) => item.action), ["create", "create", "manual-review"]);
  assert.equal(first[1].document.submittedAt, "2026-09-13T23:34:56.000Z");
  assert.equal(first[1].document.sourceRow, 3);
  assert.equal(first[2].staffId, null);
  const second = dryRunTbRegistrationRows({ rows, directory, sheetId, environment: "production",
    existing: first.slice(0, 2).map((item) => item.document) });
  assert.deepEqual(second.map((item) => item.action), ["skip", "skip", "manual-review"]);
  const conflict = dryRunTbRegistrationRows({ rows, directory, sheetId, environment: "production",
    existing: [{ ...first[0].document, sourceFingerprint: "changed" }] });
  assert.equal(conflict[0].action, "conflict");
  assert.equal(conflict[1].action, "create");
  const changedCanonical = dryRunTbRegistrationRows({ rows, directory, sheetId, environment: "production",
    existing: [{ ...first[0].document, selectedType: "다른 유형" }] });
  assert.equal(changedCanonical[0].action, "conflict");
});

test("ambiguous and unmatched directory rows never receive inferred staffId", () => {
  const rows = [{ rowNumber: 2, values: ["2026-09-11 10:11:50", "[QA] A", "[QA] 부서", "단체검진 신청"] }];
  const directory = [{ staffId: "QA-TB-A", name: "[QA] A", department: "[QA] 부서" },
    { staffId: "QA-TB-B", name: "[QA] A", department: "[QA] 부서" }];
  assert.equal(dryRunTbRegistrationRows({ rows, directory, sheetId: 1, environment: "qa" })[0].classification, "ambiguous");
  assert.equal(dryRunTbRegistrationRows({ rows, directory: [], sheetId: 1, environment: "qa" })[0].classification, "unmatched");
});

test("QA creates an audit request and isolated status atomically, never touching the shared status or Sheet", async () => {
  const db = database();
  const store = new TbRegistrationAuditStore({ database: () => db, context: () => qa, requestId: () => "QA-TB-REQUEST-001" });
  const saved = await store.createQaRequest({ staffId: "QA-TB-STAFF-001", identity,
    registrationType: fields.registrationType, now: new Date("2026-10-10T01:00:00.000Z") });
  assert.equal(saved.environment, "qa");
  assert.equal(saved.selectedType, "단체검진 신청");
  assert.equal(saved.sourceSheet, null);
  assert.equal(saved.sourceName, identity.name);
  assert.equal((await store.listQaRequests())[0].requestId, saved.requestId);
  assert.equal(db.collections.get("staff_submission_status_qa").get("QA-TB-STAFF-001_tb-screening-2026").status, "incomplete");
  assert.equal(db.collections.has("staff_submission_status"), false);
  assert.equal(db.collections.has("tb_registration_requests_production"), false);
  await assert.rejects(store.createQaRequest({ staffId: "QA-TB-STAFF-001", identity,
    registrationType: fields.registrationType }), /중복된 QA 접수 ID/);
  assert.equal((await store.listQaRequests()).length, 1);
  await assert.rejects(store.createQaRequest({ staffId: "QA-TB-STAFF-001", identity: { ...identity, name: "Other" },
    registrationType: fields.registrationType }), /신청값/);
});

test("QA refuses real staff and Production refuses every audit-ledger write", async () => {
  const db = database();
  const qaStore = new TbRegistrationAuditStore({ database: () => db, context: () => qa });
  await assert.rejects(qaStore.createQaRequest({ staffId: "T022", identity,
    registrationType: fields.registrationType }), /QA 합성 교직원/);
  const prodStore = new TbRegistrationAuditStore({ database: () => db, context: () => production });
  await assert.rejects(prodStore.createQaRequest({ staffId: "QA-TB-STAFF-001", identity,
    registrationType: fields.registrationType }), /QA 전용/);
  assert.equal(db.collections.size, 0);
});

test("fixed QA submit routes synthetic registration to Firestore without Apps Script or client destinations", async () => {
  const db = database();
  const store = new TbRegistrationAuditStore({ database: () => db, context: () => qa, requestId: () => "QA-TB-API-001" });
  const result = response();
  await submitHandler(request({ type: "tb_registration", fields: { ...fields, name: "Forged", dept: "Forged" },
    sheetName: "Injected", folderId: "Injected" }), result, {
    tbAuditStore: store, deploymentEnvironment: "qa", vercelEnvironment: "preview", destinationUrl: "", proxySecret: "",
    verifyTb: async () => ({ ok: true, staffId: "QA-TB-STAFF-001", roles: ["staff"], identity }),
    loadSubmissionConfig: async () => ({ registration: { enabled: true, startAt: "2026-01-01", endAt: "2026-12-31" } }),
    now: new Date("2026-10-10T01:00:00.000Z"),
    postScript: async () => { throw new Error("Apps Script must not be called"); },
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.requestId, "QA-TB-API-001");
  assert.equal(JSON.stringify(await store.listQaRequests()).includes("Injected"), false);
  assert.equal((await store.listQaRequests())[0].sourceName, identity.name);
  assert.equal(db.collections.has("staff_submission_status"), false);
});

test("QA registration period, real staff, and arbitrary Preview fail before audit write", async () => {
  const db = database();
  const store = new TbRegistrationAuditStore({ database: () => db, context: () => qa });
  const options = { tbAuditStore: store, deploymentEnvironment: "qa", vercelEnvironment: "preview",
    verifyTb: async () => ({ ok: true, staffId: "T022", roles: ["staff"] }),
    loadSubmissionConfig: async () => ({ registration: { enabled: true, startAt: "2026-01-01", endAt: "2026-12-31" } }),
    now: new Date("2026-10-10T01:00:00.000Z") };
  const real = response();
  await submitHandler(request({ type: "tb_registration", fields }), real, options);
  assert.equal(real.statusCode, 403);
  const closed = response();
  await submitHandler(request({ type: "tb_registration", fields }), closed,
    { ...options, verifyTb: async () => ({ ok: true, staffId: "QA-TB-STAFF-001", roles: ["staff"], identity }),
      loadSubmissionConfig: async () => ({ registration: { enabled: false, startAt: "", endAt: "" } }) });
  assert.equal(closed.statusCode, 409);
  const preview = response();
  await submitHandler(request({ type: "tb_registration", fields }), preview,
    { ...options, deploymentEnvironment: null });
  assert.equal(preview.statusCode, 403);
  assert.equal(db.collections.size, 0);
});

test("QA administrator reads the ledger through the existing API while staff and Production are denied", async () => {
  const db = database();
  const store = new TbRegistrationAuditStore({ database: () => db, context: () => qa, requestId: () => "QA-TB-ADMIN-001" });
  await store.createQaRequest({ staffId: "QA-TB-STAFF-001", identity,
    registrationType: fields.registrationType });
  const payload = request({ action: "getTbRegistrationAudit" });
  const staff = response();
  await adminHandler(payload, staff, { tbAuditStore: store,
    verifyAccess: async () => ({ ok: true, assignment: { active: true, roles: ["staff"] } }) });
  assert.equal(staff.statusCode, 403);
  const admin = response();
  await adminHandler(request({ action: "getTbRegistrationAudit" }), admin, { tbAuditStore: store,
    verifyAccess: async () => ({ ok: true, assignment: { active: true, roles: ["admin"] } }) });
  assert.equal(admin.statusCode, 200);
  assert.equal(admin.body.totalCount, 1);
  assert.equal(admin.body.items[0].staffId, "QA-TB-STAFF-001");
  assert.equal(JSON.stringify(admin.body).includes("sourceDepartment"), false);
  const prod = response();
  await adminHandler(request({ action: "getTbRegistrationAudit" }), prod,
    { tbAuditStore: new TbRegistrationAuditStore({ database: () => db, context: () => production }),
      verifyAccess: async () => ({ ok: true, assignment: { active: true, roles: ["admin"] } }) });
  assert.equal(prod.statusCode, 403);
});
