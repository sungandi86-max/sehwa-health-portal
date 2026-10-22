import assert from "node:assert/strict";
import test from "node:test";
import {
  groupDigest,
  TrainingEventGroupConflictError,
  TrainingEventGroupStore,
} from "./trainingEventGroupStore.js";

function fakeDatabase() {
  const records = new Map();
  const ref = (path) => ({
    path,
    async get() {
      const data = records.get(path);
      return { exists: data !== undefined, id: path.split("/").at(-1), data: () => data };
    },
    collection(name) { return collection(`${path}/${name}`); },
  });
  const collection = (path) => ({
    path,
    doc(id) { return ref(`${path}/${id}`); },
    where(field, operator, value) { return { get: async () => {
      const all = await collection(path).get();
      return { docs: all.docs.filter((doc) => operator === "==" ? doc.data()[field] === value
        : operator === "array-contains" ? doc.data()[field]?.includes(value)
          : operator === "array-contains-any" && value.some((item) => doc.data()[field]?.includes(item))) };
    } }; },
    async get() {
      const prefix = `${path}/`;
      const docs = [...records.entries()].filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
        .map(([key, data]) => ({ id: key.slice(prefix.length), data: () => data }));
      return { docs };
    },
  });
  return {
    records,
    collection,
    async runTransaction(callback) {
      const pending = [];
      const tx = {
        get: (target) => target.get(),
        create: (target, data) => pending.push(["create", target.path, data]),
        update: (target, data) => pending.push(["update", target.path, data]),
      };
      const result = await callback(tx);
      for (const [kind, path, data] of pending) {
        if (kind === "create" && records.has(path)) throw new Error("already exists");
        records.set(path, kind === "update" ? { ...records.get(path), ...data } : data);
      }
      return result;
    },
  };
}

const qaContext = () => ({ APP_ENV: "qa", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" });
const events = [
  { eventId: "EVENT-A", ownerStaffId: "OWNER-A", 교육명: "연구부 교육", 사용여부: "사용" },
  { eventId: "EVENT-B", ownerStaffId: "OWNER-B", 교육명: "정보부 교육", 사용여부: "사용" },
  { eventId: "EVENT-C", ownerStaffId: "OWNER-C", 교육명: "학생안전부 교육", 사용여부: "사용" },
];

test("group digest is stable for the same revision and ordered event scope", () => {
  const first = groupDigest({ groupId: "GROUP-1", revision: 2, eventIds: ["EVENT-C", "EVENT-A", "EVENT-B"] });
  const second = groupDigest({ groupId: "GROUP-1", revision: 2, eventIds: ["EVENT-A", "EVENT-B", "EVENT-C"] });
  assert.equal(first, second);
  assert.notEqual(first, groupDigest({ groupId: "GROUP-1", revision: 3, eventIds: ["EVENT-A", "EVENT-B", "EVENT-C"] }));
});

test("different owners approve their own events before the manager can issue a bundle QR", async () => {
  const db = fakeDatabase();
  const store = new TrainingEventGroupStore({ database: () => db, context: qaContext });
  const created = await store.createGroup({ groupId: "GROUP-1", name: "공통 안전교육", eventIds: events.map((event) => event.eventId),
    managerStaffId: "OWNER-A", actorUid: "uid-a", actorStaffId: "OWNER-A", events });
  assert.equal(created.revision, 1);
  assert.deepEqual(created.approvals.map(({ eventId, approved }) => [eventId, approved]),
    [["EVENT-A", true], ["EVENT-B", false], ["EVENT-C", false]]);
  assert.equal(created.ready, false);

  await assert.rejects(store.approveEvent("GROUP-1", "EVENT-B", { actorStaffId: "OWNER-A", events }), TrainingEventGroupConflictError);
  await store.approveEvent("GROUP-1", "EVENT-B", { actorStaffId: "OWNER-B", events });
  const ready = await store.approveEvent("GROUP-1", "EVENT-C", { actorStaffId: "OWNER-C", events });
  assert.equal(ready.ready, true);
  assert.equal(ready.revision, 3);
  assert.equal(db.records.has("training_event_groups_qa/GROUP-1/revisions/1"), true);
  assert.equal(db.records.has("training_event_groups_qa/GROUP-1/revisions/3"), true);
  assert.deepEqual((await store.listGroupsForActor("OWNER-B", ["EVENT-B"])).map((group) => group.groupId), ["GROUP-1"]);
  assert.deepEqual((await store.listGroupsForActor("UNRELATED")).map((group) => group.groupId), []);
});

test("repeated approval by the same current owner is idempotent", async () => {
  const db = fakeDatabase();
  const store = new TrainingEventGroupStore({ database: () => db, context: qaContext });
  await store.createGroup({ groupId: "GROUP-RETRY", name: "재시도", eventIds: ["EVENT-A", "EVENT-B"], managerStaffId: "OWNER-A",
    actorUid: "uid-a", actorStaffId: "OWNER-A", events });
  const approved = await store.approveEvent("GROUP-RETRY", "EVENT-B", { actorStaffId: "OWNER-B", events });
  const retried = await store.approveEvent("GROUP-RETRY", "EVENT-B", { actorStaffId: "OWNER-B", events });
  assert.equal(retried.revision, approved.revision);
  assert.equal(retried.digest, approved.digest);
  assert.equal(db.records.has(`training_event_groups_qa/GROUP-RETRY/revisions/${approved.revision + 1}`), false);
});

test("group mutation resets changed approvals and signed scope is immutable", async () => {
  const db = fakeDatabase();
  const store = new TrainingEventGroupStore({ database: () => db, context: qaContext });
  await store.createGroup({ groupId: "GROUP-LOCK", name: "묶음", eventIds: ["EVENT-A", "EVENT-B"], managerStaffId: "OWNER-A",
    actorUid: "owner-a-uid", actorStaffId: "OWNER-A", events });
  const changed = await store.updateGroup("GROUP-LOCK", { name: "묶음 수정", eventIds: ["EVENT-A", "EVENT-C"], managerStaffId: "OWNER-A",
    expectedRevision: 1, actorUid: "admin-uid", actorStaffId: "ADMIN", events });
  assert.equal(changed.revision, 2);
  assert.deepEqual(changed.approvals.map(({ eventId, approved }) => [eventId, approved]), [["EVENT-A", true], ["EVENT-C", false]]);

  await store.approveEvent("GROUP-LOCK", "EVENT-A", { actorStaffId: "OWNER-A", events });
  const approved = await store.approveEvent("GROUP-LOCK", "EVENT-C", { actorStaffId: "OWNER-C", events });
  await store.beginAttendance("GROUP-LOCK", { revision: approved.revision, digest: approved.digest, requestId: "REQUEST-1", actorStaffId: "SIGNER" });
  await store.completeAttendance("GROUP-LOCK", { requestId: "REQUEST-1" });
  await assert.rejects(store.updateGroup("GROUP-LOCK", { name: "금지", eventIds: ["EVENT-A"], managerStaffId: "OWNER-A",
    expectedRevision: approved.revision, actorUid: "admin-uid", actorStaffId: "ADMIN", events }),
  TrainingEventGroupConflictError);
});

test("attendance attempt releases only a confirmed no-write failure and commits a successful ledger", async () => {
  const db = fakeDatabase();
  const store = new TrainingEventGroupStore({ database: () => db, context: qaContext });
  const created = await store.createGroup({ groupId: "GROUP-ATTEMPT", name: "출석 잠금", eventIds: ["EVENT-A", "EVENT-B"], managerStaffId: "OWNER-A",
    actorUid: "uid-a", actorStaffId: "OWNER-A", events });
  const ready = await store.approveEvent(created.groupId, "EVENT-B", { actorStaffId: "OWNER-B", events });
  await store.beginAttendance(created.groupId, { revision: ready.revision, digest: ready.digest, requestId: "REQUEST-FAIL", actorStaffId: "SIGNER" });
  await assert.rejects(store.updateGroup(created.groupId, { name: "blocked", eventIds: ready.eventIds, managerStaffId: ready.managerStaffId,
    expectedRevision: ready.revision, actorUid: "uid-a", actorStaffId: "OWNER-A", events }), TrainingEventGroupConflictError);
  assert.equal(await store.releaseAttendance(created.groupId, { requestId: "OTHER" }), false);
  assert.equal(await store.releaseAttendance(created.groupId, { requestId: "REQUEST-FAIL" }), true);
  const changed = await store.updateGroup(created.groupId, { name: "retry allowed", eventIds: ready.eventIds, managerStaffId: ready.managerStaffId,
    expectedRevision: ready.revision, actorUid: "uid-a", actorStaffId: "OWNER-A", events });
  await store.beginAttendance(created.groupId, { revision: changed.revision, digest: changed.digest, requestId: "REQUEST-SUCCESS", actorStaffId: "SIGNER" });
  await store.completeAttendance(created.groupId, { requestId: "REQUEST-SUCCESS" });
  assert.equal(await store.releaseAttendance(created.groupId, { requestId: "REQUEST-SUCCESS" }), false);
});

test("group store is environment isolated", async () => {
  const db = fakeDatabase();
  const qa = new TrainingEventGroupStore({ database: () => db, context: qaContext });
  await qa.createGroup({ groupId: "GROUP-ISO", name: "QA 묶음", eventIds: ["EVENT-A", "EVENT-B"], managerStaffId: "OWNER-A",
    actorUid: "uid-a", actorStaffId: "OWNER-A", events });
  const production = new TrainingEventGroupStore({ database: () => db,
    context: () => ({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }) });
  assert.deepEqual(await production.listGroups(), []);
  assert.equal((await qa.listGroups()).length, 1);
});
