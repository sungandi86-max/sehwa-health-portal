import test from "node:test";
import assert from "node:assert/strict";
import { recordRosterPdfVerification } from "./trainingSignatureLifecycle.js";
import { signatureKey } from "./trainingCenterPhase2.js";

process.env.VERCEL_ENV = "preview";
process.env.VERCEL_GIT_COMMIT_REF = "qa";

function dbFixture(records) {
  const values = new Map(Object.entries(records));
  const ref = (name, id) => ({ get: async () => ({ exists: values.has(`${name}/${id}`), data: () => values.get(`${name}/${id}`) }),
    set: async (data, options) => values.set(`${name}/${id}`, options?.merge ? { ...values.get(`${name}/${id}`), ...data } : data) });
  return { values, collection: (name) => ({ doc: (id) => ref(name, id) }), async runTransaction(callback) {
    const writes = [];
    const result = await callback({ get: (item) => item.get(), set: (...args) => writes.push(args) });
    for (const [item, data, options] of writes) await item.set(data, options);
    return result;
  } };
}

test("PDF verification marks cleanup eligible only after every grouped event is complete", async () => {
  const firstKey = `training_attendance_locks_qa/${signatureKey("EVENT-1", "QA001")}`;
  const secondKey = `training_attendance_locks_qa/${signatureKey("EVENT-2", "QA001")}`;
  const db = dbFixture({ [firstKey]: { state: "completed", requestId: "REQUEST-1", eventIds: ["EVENT-1", "EVENT-2"], uploadedFileId: "FILE-1" },
    [secondKey]: { state: "completed", requestId: "REQUEST-1", eventIds: ["EVENT-1", "EVENT-2"], uploadedFileId: "FILE-1" } });
  const first = await recordRosterPdfVerification({ db, eventId: "EVENT-1", rows: [{ staffId: "QA001", fileId: "FILE-1" }],
    includedFileIds: ["FILE-1"], pdf: Buffer.from("%PDF-test"), actor: "ADMIN", now: 1 });
  assert.deepEqual(first.eligibleFileIds, []);
  assert.equal(db.values.get(firstKey).signatureCleanupState, "awaiting-related-events");
  const second = await recordRosterPdfVerification({ db, eventId: "EVENT-2", rows: [{ staffId: "QA001", fileId: "FILE-1" }],
    includedFileIds: ["FILE-1"], pdf: Buffer.from("%PDF-test"), actor: "ADMIN", now: 2 });
  assert.deepEqual(second.eligibleFileIds, ["FILE-1"]);
  assert.equal(db.values.get(firstKey).signatureCleanupState, "eligible");
  assert.equal(db.values.get(secondKey).signatureCleanupState, "eligible");
});

test("failed PDF or missing embedded signature never records cleanup eligibility", async () => {
  const key = `training_attendance_locks_qa/${signatureKey("EVENT-1", "QA001")}`;
  const db = dbFixture({ [key]: { state: "completed", requestId: "REQUEST-1", eventIds: ["EVENT-1"], uploadedFileId: "FILE-1" } });
  await assert.rejects(recordRosterPdfVerification({ db, eventId: "EVENT-1", rows: [{ staffId: "QA001", fileId: "FILE-1" }],
    includedFileIds: [], pdf: Buffer.from("%PDF-test"), actor: "ADMIN" }), /서명 이미지/);
  await assert.rejects(recordRosterPdfVerification({ db, eventId: "EVENT-1", rows: [{ staffId: "QA001", fileId: "FILE-1" }],
    includedFileIds: ["FILE-1"], pdf: Buffer.from("not-pdf"), actor: "ADMIN" }), /PDF 검증/);
  assert.equal(db.values.get(key).rosterPdfVerifiedAt, undefined);
});
