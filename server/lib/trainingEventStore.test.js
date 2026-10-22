import assert from "node:assert/strict";
import test from "node:test";
import { buildTrainingView, readTrainingSheets, TARGET_HEADERS, TRAINING_HEADERS } from "./trainingCenter.js";
import { TrainingEventConflictError, TrainingEventStore } from "./trainingEventStore.js";
import { applyTrainingEventMigration, planTrainingEventMigration, TrainingEventMigrationConflictError } from "./trainingEventMigration.js";
import { attendanceEligibility, finalSheetModel, parseTrainingSource, resolveEvents, SIGNATURE_HEADERS } from "./trainingCenterPhase2.js";
import { TrainingCenterStore } from "./trainingCenterStore.js";

const context = { APP_ENV: "qa", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa", QA_STAFF_ROSTER_SOURCE_SPREADSHEET_ID: "QA_WORKBOOK" };
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
    async get() { const docs = [...records.entries()].filter(([key]) => key.startsWith(`${name}/`) && !key.slice(name.length + 1).includes("/"))
      .map(([key, data]) => { const reference = collection(name).doc(key.slice(name.length + 1)); return { id: reference.id, ref: reference, data: () => data }; }); return { docs, size: docs.length }; },
    where(field, operator, value) { return { get: async () => { const snapshot = await collection(name).get(); return { docs: snapshot.docs.filter((doc) =>
      operator === "array-contains" && doc.data()[field]?.includes(value)) }; } }; },
    doc(id) { const key = `${name}/${id}`; return { id, key, collection(child) { return collection(`${key}/${child}`); }, async get() { const data = records.get(key); return { exists: Boolean(data), id, data: () => data }; } }; },
  });
  const create = (ref, data) => { if (records.has(ref.key)) throw new TrainingEventConflictError("이미 존재합니다."); records.set(ref.key, data); calls.creates++; };
  const database = { records, calls, collection, batch() { const pending = []; return { create(ref, data) { pending.push([ref, data]); },
    async commit() { if (pending.some(([ref]) => records.has(ref.key))) throw new TrainingEventConflictError("이미 존재합니다."); pending.forEach(([ref, data]) => create(ref, data)); } }; },
  async runTransaction(callback) { const pending = []; const transaction = { get: (ref) => ref.get(), create: (ref, data) => pending.push(["create", ref, data]),
    update: (ref, data) => pending.push(["update", ref, data]) }; const result = await callback(transaction); for (const [kind, ref, data] of pending) {
      if (kind === "create") create(ref, data); else { records.set(ref.key, { ...records.get(ref.key), ...data }); calls.updates++; }
    } return result; } };
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
  await production.saveEvent({ ...values, targetSnapshot: { schemaVersion: 1, members: [{ staffId: "QA-ONE" }] } });
  assert.equal(db.records.has(`training_events_production/${values.eventId}`), true);
  assert.deepEqual(db.records.get(`training_events_production/${values.eventId}`).targetStaffIds, ["QA-ONE"]);
  assert.deepEqual(db.records.get(`training_events_production/${values.eventId}`).targetSnapshot,
    { schemaVersion: 1, members: [{ staffId: "QA-ONE" }] });
  assert.equal((await qa.listEvents()).length, 1);
});

test("new events keep immutable creator identity and explicit owner transfer writes audit history", async () => {
  const db = fakeDatabase();
  const store = new TrainingEventStore({ database: () => db, context: () => context });
  await store.saveEvent({ ...values, ownerStaffId: "OWNER-A" }, null, { uid: "uid-owner-a", staffId: "OWNER-A" });
  const key = `training_events_qa/${values.eventId}`;
  assert.equal(db.records.get(key).createdByUid, "uid-owner-a");
  assert.equal(db.records.get(key).createdByStaffId, "OWNER-A");
  const groupKey = "training_event_groups_qa/GROUP-TRANSFER";
  db.records.set(groupKey, { groupId: "GROUP-TRANSFER", environment: "qa", eventIds: [values.eventId, "EVENT-B"],
    managerStaffId: "OWNER-A", participantOwnerStaffIds: ["OWNER-A", "OWNER-C"], revision: 2,
    approvals: [{ eventId: values.eventId, ownerStaffId: "OWNER-A", approved: true, approvedByStaffId: "OWNER-A", approvedAt: "2026-10-01T00:00:00.000Z" },
      { eventId: "EVENT-B", ownerStaffId: "OWNER-C", approved: true, approvedByStaffId: "OWNER-C", approvedAt: "2026-10-01T00:00:00.000Z" }],
    status: "ready", lockedAt: null });
  const lockedGroupKey = "training_event_groups_qa/GROUP-LOCKED";
  db.records.set("training_events_qa/EVENT-B", { eventId: "EVENT-B", environment: "qa", ownerStaffId: "OWNER-C" });
  db.records.set(lockedGroupKey, { groupId: "GROUP-LOCKED", environment: "qa", eventIds: [values.eventId, "EVENT-B"],
    managerStaffId: "OWNER-A", participantOwnerStaffIds: ["OWNER-A", "OWNER-C"], revision: 4, digest: "signed-snapshot",
    approvals: [{ eventId: values.eventId, ownerStaffId: "OWNER-A", approved: true, approvedByStaffId: "OWNER-A", approvedAt: "2026-10-01T00:00:00.000Z" },
      { eventId: "EVENT-B", ownerStaffId: "OWNER-C", approved: true, approvedByStaffId: "OWNER-C", approvedAt: "2026-10-01T00:00:00.000Z" }],
    status: "ready", lockedAt: "2026-10-02T00:00:00.000Z" });

  const transferred = await store.transferOwner(values.eventId, { expectedOwnerStaffId: "OWNER-A", newOwnerStaffId: "OWNER-B",
    actorUid: "uid-admin", actorStaffId: "ADMIN", reason: "부서 업무 이관" });
  assert.deepEqual(transferred, { eventId: values.eventId, ownerStaffId: "OWNER-B", ownerRevision: 2 });
  assert.equal(db.records.get(key).ownerStaffId, "OWNER-B");
  assert.equal(db.records.get(key).createdByStaffId, "OWNER-A");
  const history = db.records.get(`${key}/ownershipHistory/2`);
  assert.equal(history.previousOwnerStaffId, "OWNER-A");
  assert.equal(history.ownerStaffId, "OWNER-B");
  assert.equal(history.transferredByStaffId, "ADMIN");
  const group = db.records.get(groupKey);
  assert.equal(group.managerStaffId, "OWNER-B");
  assert.equal(group.revision, 3);
  assert.equal(group.status, "pending_approval");
  assert.deepEqual(group.participantOwnerStaffIds, ["OWNER-B", "OWNER-C"]);
  assert.deepEqual(group.approvals.find((item) => item.eventId === values.eventId), {
    eventId: values.eventId, ownerStaffId: "OWNER-B", approved: false, approvedByStaffId: null, approvedAt: null,
  });
  assert.equal(db.records.get(`${groupKey}/revisions/3`).changeType, "event_owner_transferred");
  const lockedGroup = db.records.get(lockedGroupKey);
  assert.equal(lockedGroup.managerStaffId, "OWNER-B");
  assert.deepEqual(lockedGroup.participantOwnerStaffIds, ["OWNER-B", "OWNER-C"]);
  assert.equal(lockedGroup.revision, 4);
  assert.equal(lockedGroup.digest, "signed-snapshot");
  assert.equal(lockedGroup.approvals[0].ownerStaffId, "OWNER-A");
  assert.equal(db.records.has(`${lockedGroupKey}/revisions/5`), false);
  await assert.rejects(store.transferOwner(values.eventId, { expectedOwnerStaffId: "OWNER-A", newOwnerStaffId: "OWNER-C",
    actorUid: "uid-admin", actorStaffId: "ADMIN", reason: "stale retry" }), TrainingEventConflictError);
});

test("owner transfer and bundle approval cannot race an in-flight attendance attempt", async () => {
  const db = fakeDatabase();
  const store = new TrainingEventStore({ database: () => db, context: () => context });
  await store.saveEvent({ ...values, ownerStaffId: "OWNER-A" }, null, { uid: "uid-owner-a", staffId: "OWNER-A" });
  db.records.set("training_event_groups_qa/GROUP-RACE", { groupId: "GROUP-RACE", environment: "qa", eventIds: [values.eventId, "EVENT-B"],
    managerStaffId: "OWNER-A", participantOwnerStaffIds: ["OWNER-A", "OWNER-C"], revision: 1,
    approvals: [], status: "ready", lockedAt: null, attendanceAttempt: { requestId: "REQUEST-1" } });
  await assert.rejects(store.transferOwner(values.eventId, { expectedOwnerStaffId: "OWNER-A", newOwnerStaffId: "OWNER-B",
    actorUid: "uid-admin", actorStaffId: "ADMIN", reason: "경합" }), TrainingEventConflictError);
  assert.equal(db.records.get(`training_events_qa/${values.eventId}`).ownerStaffId, "OWNER-A");
});

test("training center store forwards only the authenticated creator identity to event persistence", async () => {
  const calls = [];
  const store = new TrainingCenterStore({
    events: { saveEvent: async (...args) => { calls.push(args); return { ok: true }; } },
  });
  const actor = { uid: "verified-uid", staffId: "OWNER-A" };
  await store.saveEvent({ ...values, createdByUid: "forged", createdByStaffId: "FORGED" }, null, actor);
  assert.deepEqual(calls, [[{ ...values, createdByUid: "forged", createdByStaffId: "FORGED" }, null, actor]]);
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

test("Production new-event snapshot stays fixed on edit while legacy targets remain Sheet-backed", async () => {
  const db = fakeDatabase();
  const production = new TrainingEventStore({ database: () => db,
    context: () => ({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }) });
  const snapshot = { schemaVersion: 1, confirmedAt: "2026-10-13T00:00:00.000Z", selection: { preset: "all" },
    members: [{ staffId: "STAFF-ONE", name: "테스트 교직원", department: "교무부", position: "교사", targetStatus: "대상", required: true }] };
  await production.saveEvent({ ...values, targetSnapshot: snapshot, ownerStaffId: "STAFF-OWNER" });
  const sheetTargets = [TARGET_HEADERS, ["LEGACY-EVENT", "LEGACY-STAFF", "대상", "Y", "N", ""]];
  const before = await readTrainingSheets({ events: production, workbook: () => "PRODUCTION_WORKBOOK", targets: async () => sheetTargets });
  assert.equal(before.targets.length, 3);
  assert.deepEqual(before.targets[2].slice(0, 2), [values.eventId, "STAFF-ONE"]);
  const parsed = parseTrainingSource({ ...before, signatures: [SIGNATURE_HEADERS] });
  assert.equal(finalSheetModel(parsed, [], values.eventId).counts.target, 1);
  assert.equal(finalSheetModel(parsed, [], values.eventId).rows[0].name, "테스트 교직원");
  await production.saveEvent({ ...values, "교육명": "수정된 교육", ownerStaffId: "STAFF-OWNER" },
    { ...values, ownerStaffId: "STAFF-OWNER" });
  assert.deepEqual(db.records.get(`training_events_production/${values.eventId}`).targetSnapshot, snapshot);
  assert.deepEqual(db.records.get(`training_events_production/${values.eventId}`).targetStaffIds, ["STAFF-ONE"]);
  await production.saveSnapshotTarget(values.eventId, { "대상상태": "제외", "필수여부": "N", "제외사유": "대상 정정" },
    { staffId: "STAFF-ONE", name: "변경된 이름", department: "행정실", position: "주무관" });
  assert.deepEqual(db.records.get(`training_events_production/${values.eventId}`).targetStaffIds, []);
  assert.equal(db.records.get(`training_events_production/${values.eventId}`).targetSnapshot.members[0].name, "테스트 교직원");
  assert.deepEqual(sheetTargets, [TARGET_HEADERS, ["LEGACY-EVENT", "LEGACY-STAFF", "대상", "Y", "N", ""]]);
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

test("QA event snapshot is atomic with creation and stays fixed when the staff source changes", async () => {
  const db = fakeDatabase();
  const qa = new TrainingEventStore({ database: () => db, context: () => context });
  const snapshot = { schemaVersion: 1, confirmedAt: "2026-10-13T00:00:00.000Z", selection: { preset: "manual" },
    members: [{ staffId: "QA-ONE", name: "QA 교원", department: "교무부", position: "교사", targetStatus: "대상", required: true }] };
  await qa.saveEvent({ ...values, targetSnapshot: snapshot, ownerStaffId: "QA-OWNER" });
  const saved = db.records.get(`training_events_qa/${values.eventId}`);
  assert.deepEqual(saved.targetStaffIds, ["QA-ONE"]);
  assert.deepEqual(saved.targetSnapshot, snapshot);
  const base = await readTrainingSheets({ events: qa, workbook: () => "QA_WORKBOOK", targets: async () => [TARGET_HEADERS] });
  const parsed = parseTrainingSource({ ...base, signatures: [SIGNATURE_HEADERS] });
  assert.equal(parsed.targets.length, 1);
  assert.equal(finalSheetModel(parsed, [], values.eventId).counts.target, 1);
  assert.equal(finalSheetModel(parsed, [], values.eventId).rows[0].name, "QA 교원");
  const changedDirectory = [{ staffId: "QA-ONE", name: "변경된 교직원명", department: "연구부", position: "주무관", employmentStatus: "휴직" }];
  const reread = parseTrainingSource({ ...(await readTrainingSheets({ events: qa, workbook: () => "QA_WORKBOOK", targets: async () => [TARGET_HEADERS] })),
    signatures: [SIGNATURE_HEADERS] });
  const fixedRoster = finalSheetModel(reread, changedDirectory, values.eventId);
  assert.equal(fixedRoster.counts.target, 1);
  assert.equal(fixedRoster.rows[0].name, "QA 교원");
  assert.equal(fixedRoster.rows[0].department, "교무부");
  await qa.saveEvent({ ...values, "교육명": "QA 제목 수정", ownerStaffId: "QA-OWNER" }, { ...values, ownerStaffId: "QA-OWNER" });
  assert.deepEqual(db.records.get(`training_events_qa/${values.eventId}`).targetStaffIds, ["QA-ONE"]);
  assert.deepEqual((await qa.getEvent(values.eventId)).targetSnapshot, snapshot);
  await qa.saveSnapshotTarget(values.eventId, { "대상상태": "제외", "필수여부": "N", "제외사유": "QA 제외" },
    { staffId: "QA-ONE", name: "QA 교원", department: "교무부", position: "교사" });
  assert.deepEqual(db.records.get(`training_events_qa/${values.eventId}`).targetStaffIds, []);
  assert.equal(db.records.get(`training_events_production/${values.eventId}`), undefined);
});

test("explicit QA target edit replaces legacy Sheet roster without changing its rows", async () => {
  const db = fakeDatabase();
  const qa = new TrainingEventStore({ database: () => db, context: () => context });
  await qa.saveEvent(values);
  const sheetTargets = [TARGET_HEADERS, [values.eventId, "QA-OLD", "대상", "N", "N", ""]];
  const before = await readTrainingSheets({ events: qa, workbook: () => "QA_WORKBOOK", targets: async () => sheetTargets });
  assert.deepEqual(before.targets, sheetTargets);
  assert.equal(db.calls.updates, 0);
  const snapshot = { schemaVersion: 1, confirmedAt: "2026-10-14T00:00:00.000Z",
    selection: { preset: "manual" }, members: [{ staffId: "QA-NEW", name: "새 대상", department: "교무부",
      position: "교사", targetStatus: "대상", required: true }] };
  await qa.saveTargetSnapshot(values.eventId, snapshot, null);
  assert.deepEqual(db.records.get(`training_events_qa/${values.eventId}`).targetStaffIds, ["QA-NEW"]);
  await assert.rejects(qa.saveTargetSnapshot(values.eventId, snapshot, null), TrainingEventConflictError);
  const after = await readTrainingSheets({ events: qa, workbook: () => "QA_WORKBOOK", targets: async () => sheetTargets });
  assert.deepEqual(after.targets.slice(1).map((row) => row[1]), ["QA-NEW"]);
  assert.deepEqual(sheetTargets[1], [values.eventId, "QA-OLD", "대상", "N", "N", ""]);
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

test("explicit CPR completion binding round-trips without changing legacy Sheet schema", async () => {
  const db = fakeDatabase();
  const store = new TrainingEventStore({ database: () => db, context: () => context });
  await store.saveEvent({ ...values, completionTaskId: "cpr-training-2026" });
  const loaded = await store.getEvent(values.eventId);
  assert.equal(loaded.completionTaskId, "cpr-training-2026");
  await store.saveEvent({ ...loaded, "교육명": "Renamed education" }, loaded);
  assert.equal((await store.listEvents())[0].completionTaskId, "cpr-training-2026");
  await assert.rejects(store.saveEvent({ ...loaded, completionTaskId: "arbitrary" }, loaded));
});
