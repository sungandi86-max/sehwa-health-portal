import assert from "node:assert/strict";
import test from "node:test";
import { buildTrainingView, readTrainingSheets, TARGET_HEADERS, TRAINING_HEADERS } from "./trainingCenter.js";
import { TrainingEventConflictError, TrainingEventStore } from "./trainingEventStore.js";
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
    async get() { const docs = [...records.entries()].filter(([key]) => key.startsWith(`${name}/`))
      .map(([key, data]) => ({ id: key.slice(name.length + 1), data: () => data })); return { docs, size: docs.length }; },
    doc(id) { const key = `${name}/${id}`; return { id, key, async get() { const data = records.get(key); return { exists: Boolean(data), id, data: () => data }; } }; },
  });
  const create = (ref, data) => { if (records.has(ref.key)) throw new TrainingEventConflictError("이미 존재합니다."); records.set(ref.key, data); calls.creates++; };
  return { records, calls, collection, batch() { const pending = []; return { create(ref, data) { pending.push([ref, data]); },
    async commit() { if (pending.some(([ref]) => records.has(ref.key))) throw new TrainingEventConflictError("이미 존재합니다."); pending.forEach(([ref, data]) => create(ref, data)); } }; },
  async runTransaction(callback) { const pending = []; const transaction = { get: (ref) => ref.get(), create: (ref, data) => pending.push(["create", ref, data]),
    update: (ref, data) => pending.push(["update", ref, data]) }; await callback(transaction); for (const [kind, ref, data] of pending) {
      if (kind === "create") create(ref, data); else { records.set(ref.key, data); calls.updates++; }
    } } };
}

test("QA mirror creates once, reads back all fields, and reruns as skip", async () => {
  const db = fakeDatabase();
  const store = new TrainingEventStore({ database: () => db, context: () => context, readSheet: async () => source });
  assert.deepEqual((await store.mirrorPlan()).counts, { create: 1, update: 0, skip: 0, conflict: 0 });
  assert.equal((await store.applyMirror()).applied, 1);
  assert.equal(db.calls.creates, 1);
  assert.deepEqual((await store.mirrorPlan()).counts, { create: 0, update: 0, skip: 1, conflict: 0 });
  assert.deepEqual((await store.listEvents())[0], values);
  assert.equal((await store.getEvent(values.eventId)).eventId, values.eventId);
  assert.equal(await store.eventExists("missing"), false);
});

test("QA mirror refuses changed or unknown-origin documents without overwriting", async () => {
  const db = fakeDatabase();
  const store = new TrainingEventStore({ database: () => db, context: () => context, readSheet: async () => source });
  db.records.set(`training_events_qa/${values.eventId}`, { eventId: values.eventId, title: "different", sourceType: "other" });
  assert.deepEqual((await store.mirrorPlan()).counts, { create: 0, update: 0, skip: 0, conflict: 1 });
  await assert.rejects(store.applyMirror(), TrainingEventConflictError);
  assert.equal(db.calls.creates, 0);
  assert.equal(db.records.get(`training_events_qa/${values.eventId}`).title, "different");
});

test("QA admin create and update stay in QA collection; production remains Sheet-backed", async () => {
  const db = fakeDatabase();
  const qa = new TrainingEventStore({ database: () => db, context: () => context, readSheet: async () => source });
  await qa.saveQaEvent(values, null);
  assert.equal(db.calls.creates, 1);
  await assert.rejects(qa.saveQaEvent(values, null), TrainingEventConflictError);
  await qa.saveQaEvent({ ...values, "교육명": "[QA] edited" }, values);
  assert.equal((await qa.getEvent(values.eventId))["교육명"], "[QA] edited");
  assert.equal(db.calls.updates, 1);
  const production = new TrainingEventStore({ database: () => { throw new Error("Production Firestore accessed"); },
    context: () => ({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }), readSheet: async () => source });
  assert.deepEqual((await production.listEvents())[0], { rowNumber: 2, ...values });
  await assert.rejects(production.saveQaEvent(values), /QA 이벤트 저장/);
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
