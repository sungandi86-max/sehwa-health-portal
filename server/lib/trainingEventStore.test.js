import assert from "node:assert/strict";
import test from "node:test";
import { buildTrainingView, readTrainingSheets, TARGET_HEADERS, TRAINING_HEADERS } from "./trainingCenter.js";
import { TrainingEventConflictError, TrainingEventStore } from "./trainingEventStore.js";
import { applyTrainingEventMigration, planTrainingEventMigration, TrainingEventMigrationConflictError } from "./trainingEventMigration.js";
import { attendanceEligibility, finalSheetModel, parseTrainingSource, resolveEvents, SIGNATURE_HEADERS } from "./trainingCenterPhase2.js";

const context = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa", STAFF_ROSTER_SOURCE_SPREADSHEET_ID: "QA_WORKBOOK" };
const values = { eventId: "QA-EVENT-001", eventGroupId: "QA-GROUP-001", "교육연도": "2026", "사용여부": "미사용",
  "상태": "진행중", "교육명": "[QA] mirror", "담당부서": "QA", "담당자": "", "일자": "2026-10-10",
  "시작시간": "09:00", "종료시간": "10:00", "장소": "QA", "교육내용": "테스트", "이수기준": "전자서명",
  signatureOpenAt: "2026-10-10T09:00:00+09:00", signatureCloseAt: "2026-10-10T10:00:00+09:00", "정렬순서": "0" };
const source = [TRAINING_HEADERS, TRAINING_HEADERS.map((header) => values[header])];

function fakeDatabase() {
  const records = new Map();
  const calls = { creates: 0, updates: 0 };
  const collection = (name) => ({
    firestore: { batch: () => database.batch() },
    async get() { const docs = [...records.entries()].filter(([key]) => key.startsWith(`${name}/`))
      .map(([key, data]) => ({ id: key.slice(name.length + 1), data: () => data })); return { docs, size: docs.length }; },
    doc(id) { const key = `${name}/${id}`; return { id, key, async get() { const data = records.get(key); return { exists: Boolean(data), id, data: () => data }; } }; },
  });
  const create = (ref, data) => { if (records.has(ref.key)) throw new TrainingEventConflictError("이미 존재합니다."); records.set(ref.key, data); calls.creates++; };
  const database = { records, calls, collection, batch() { const pending = []; return { create(ref, data) { pending.push([ref, data]); },
    async commit() { if (pending.some(([ref]) => records.has(ref.key))) throw new TrainingEventConflictError("이미 존재합니다."); pending.forEach(([ref, data]) => create(ref, data)); } }; },
  async runTransaction(callback) { const pending = []; const transaction = { get: (ref) => ref.get(), create: (ref, data) => pending.push(["create", ref, data]),
    update: (ref, data) => pending.push(["update", ref, data]) }; await callback(transaction); for (const [kind, ref, data] of pending) {
      if (kind === "create") create(ref, data); else { records.set(ref.key, data); calls.updates++; }
    } } };
  return database;
}

test("migration creates once, reads back all fields, and reruns as skip", async () => {
  const db = fakeDatabase();
  const plan = planTrainingEventMigration(source, [], "qa");
  assert.deepEqual(plan.counts, { create: 1, update: 0, skip: 0, conflict: 0 });
  assert.equal((await applyTrainingEventMigration(plan, db.collection("training_events_qa"))).applied, 1);
  assert.equal(db.calls.creates, 1);
  const docs = (await db.collection("training_events_qa").get()).docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  assert.deepEqual(planTrainingEventMigration(source, docs, "qa").counts, { create: 0, update: 0, skip: 1, conflict: 0 });
  const store = new TrainingEventStore({ database: () => db, context: () => context });
  assert.deepEqual((await store.listEvents())[0], values);
  assert.equal((await store.getEvent(values.eventId)).eventId, values.eventId);
  assert.equal(await store.eventExists("missing"), false);
});

test("migration refuses changed or unknown-origin documents without overwriting", async () => {
  const db = fakeDatabase();
  db.records.set(`training_events_qa/${values.eventId}`, { eventId: values.eventId, title: "different", sourceType: "other" });
  const docs = (await db.collection("training_events_qa").get()).docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  const plan = planTrainingEventMigration(source, docs, "qa");
  assert.deepEqual(plan.counts, { create: 0, update: 0, skip: 0, conflict: 1 });
  await assert.rejects(applyTrainingEventMigration(plan, db.collection("training_events_qa")), TrainingEventMigrationConflictError);
  assert.equal(db.calls.creates, 0);
  assert.equal(db.records.get(`training_events_qa/${values.eventId}`).title, "different");
});

test("QA and Production admin create and update use isolated Firestore collections", async () => {
  const db = fakeDatabase();
  const qa = new TrainingEventStore({ database: () => db, context: () => context });
  await qa.saveEvent(values, null);
  assert.equal(db.calls.creates, 1);
  await assert.rejects(qa.saveEvent(values, null), TrainingEventConflictError);
  await qa.saveEvent({ ...values, "교육명": "[QA] edited" }, values);
  assert.equal((await qa.getEvent(values.eventId))["교육명"], "[QA] edited");
  assert.equal(db.calls.updates, 1);
  const production = new TrainingEventStore({ database: () => db,
    context: () => ({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }) });
  assert.deepEqual(await production.listEvents(), []);
  await production.saveEvent(values);
  assert.equal(db.records.has(`training_events_production/${values.eventId}`), true);
  assert.equal((await qa.listEvents()).length, 1);
});

test("production event reads never access the Sheet while targets remain Sheet-backed", async () => {
  const db = fakeDatabase();
  const production = new TrainingEventStore({ database: () => db,
    context: () => ({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }) });
  await production.saveEvent(values);
  const base = await readTrainingSheets({ events: production, workbook: () => "PRODUCTION_WORKBOOK", targets: async () => [TARGET_HEADERS] });
  assert.equal(base.trainings[1][0], values.eventId);
  assert.deepEqual(base.targets, [TARGET_HEADERS]);
});

test("production administrator updates a migrated event transactionally without writing its source Sheet", async () => {
  const db = fakeDatabase();
  const migrated = planTrainingEventMigration(source, [], "production").items[0].incoming;
  db.records.set(`training_events_production/${values.eventId}`, { ...migrated,
    migratedAt: new Date("2026-10-10T00:00:00Z"), firestoreCreatedAt: new Date("2026-10-10T00:00:00Z") });
  const production = new TrainingEventStore({ database: () => db,
    context: () => ({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }) });
  const original = await production.getEvent(values.eventId);
  await production.saveEvent({ ...original, "교육명": "[QA] edited in Production" }, original);
  const saved = db.records.get(`training_events_production/${values.eventId}`);
  assert.equal(saved.title, "[QA] edited in Production");
  assert.equal(saved.sourceSheet, "앱_교직원교육");
  assert.equal(saved.sourceFingerprint, null);
  assert.equal(db.calls.updates, 1);
  await assert.rejects(production.saveEvent({ ...original, "교육명": "stale edit" }, original), TrainingEventConflictError);
  assert.equal(db.calls.updates, 1);
});

test("QA update rejects foreign markers and stale admin snapshots", async () => {
  const db = fakeDatabase();
  const qa = new TrainingEventStore({ database: () => db, context: () => context });
  await qa.saveEvent(values, null);
  const key = `training_events_qa/${values.eventId}`;
  db.records.set(key, { ...db.records.get(key), environment: "production" });
  await assert.rejects(qa.saveEvent({ ...values, "교육명": "changed" }, values), TrainingEventConflictError);
  assert.equal(db.records.get(key).environment, "production");
  db.records.set(key, { ...db.records.get(key), environment: "qa", title: "newer change" });
  await assert.rejects(qa.saveEvent({ ...values, "교육명": "stale change" }, values), TrainingEventConflictError);
  assert.equal(db.records.get(key).title, "newer change");
  assert.equal(db.calls.updates, 0);
});

test("training source uses QA event store while target rows remain Sheet-backed", async () => {
  const calls = [];
  const result = await readTrainingSheets({ events: { listEvents: async () => [values] }, workbook: () => "QA_WORKBOOK", targets: async ({ range }) => {
    calls.push(range); return [TARGET_HEADERS];
  } });
  assert.equal(result.trainings[1][0], values.eventId);
  assert.deepEqual(result.targets, [TARGET_HEADERS]);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /교직원교육대상/);
});

test("synthetic QA event feeds public detail, QR eligibility, attendance and roster metadata", async () => {
  const active = { ...values, "사용여부": "사용", "교육명": "[QA] Firestore fixture" };
  const source = { trainings: [TRAINING_HEADERS, TRAINING_HEADERS.map((header) => active[header])],
    targets: [TARGET_HEADERS], signatures: [SIGNATURE_HEADERS] };
  const detail = buildTrainingView(source, "QA-SYNTHETIC", { eventId: active.eventId });
  assert.equal(detail.title, active["교육명"]);
  assert.deepEqual(detail.materials, []);
  const parsed = parseTrainingSource(source);
  const events = resolveEvents(parsed, { eventId: active.eventId });
  assert.equal(events.length, 1);
  assert.equal(attendanceEligibility(parsed, events, "QA-SYNTHETIC", new Date("2026-10-10T00:30:00Z"))[0].eligible, false);
  const roster = finalSheetModel(parsed, [], active.eventId);
  assert.deepEqual(roster.event, { eventId: active.eventId, title: active["교육명"], date: active["일자"], location: active["장소"] });
});
