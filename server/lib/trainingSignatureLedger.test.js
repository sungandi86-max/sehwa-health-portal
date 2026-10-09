import test from "node:test";
import assert from "node:assert/strict";
import { TrainingSignatureLedger, TrainingSignatureConflictError, planSignatureMigration } from "./trainingSignatureLedger.js";
import { SIGNATURE_HEADERS } from "./trainingCenterPhase2.js";
import { TrainingCenterStore } from "./trainingCenterStore.js";

function fakeFirestore() {
  const values = new Map();
  function document(path) {
    return {
      id: path.split("/").at(-1), path,
      collection(name) { return collection(`${path}/${name}`); },
      async get() { return { exists: values.has(path), id: this.id, ref: this, data: () => values.get(path) }; },
    };
  }
  function collection(path) {
    return {
      doc(id) { return document(`${path}/${id}`); },
      async get() {
        const docs = [...values.keys()].filter((key) => key.startsWith(`${path}/`) && key.slice(path.length + 1).split("/").length === 1)
          .map((key) => document(key));
        return { docs: await Promise.all(docs.map((ref) => ref.get())) };
      },
    };
  }
  let chain = Promise.resolve();
  return { values, collection, async runTransaction(callback) {
    const previous = chain;
    let release;
    chain = new Promise((resolve) => { release = resolve; });
    await previous;
    const writes = [];
    try {
      const result = await callback({
        get: (ref) => ref.get(),
        set: (ref, data, options) => writes.push(["set", ref.path, data, options]),
        create: (ref, data) => writes.push(["create", ref.path, data]),
        update: (ref, data) => writes.push(["update", ref.path, data]),
      });
      for (const [action, path, data, options] of writes) {
        if (action === "create" && values.has(path)) throw new Error("already exists");
        if (action === "update" && !values.has(path)) throw new Error("missing");
        values.set(path, action === "set" && !options?.merge ? data : { ...values.get(path), ...data });
      }
      return result;
    } finally { release(); }
  } };
}

function record(id, eventId, staffId, extra = {}) {
  return { signatureId: id, eventId, eventGroupId: "QA-GROUP", "교직원ID": staffId,
    "서명일시": "2026-10-10T09:00:00.000Z", "출석방식": "qr", "서명파일ID": "QA-PRIVATE-FILE",
    "상태": "완료", "취소여부": "N", "취소사유": "", "정정자": "", "정정일시": "",
    createdAt: "2026-10-10T09:00:00.000Z", ...extra };
}

const table = (...rows) => [SIGNATURE_HEADERS, ...rows.map((row) => SIGNATURE_HEADERS.map((header) => row[header] || ""))];
const qa = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" };
const production = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" };

test("QA signature ledger imports Sheet history once and preserves active selection", async () => {
  const db = fakeFirestore();
  const ledger = new TrainingSignatureLedger({ database: () => db, context: () => qa });
  const cancelled = record("SIG-OLD", "QA-EVENT", "QA-STAFF", { "상태": "취소", "취소여부": "Y",
    "취소사유": "QA 정정", "정정자": "QA-ADMIN", "정정일시": "2026-10-10T09:30:00.000Z" });
  const current = record("SIG-NEW", "QA-EVENT", "QA-STAFF", { "서명일시": "2026-10-10T10:00:00.000Z" });
  const source = table(cancelled, current);
  assert.equal(await ledger.isReady(), false);
  assert.deepEqual((await ledger.migrationDryRun(source)).counts, { create: 2, update: 0, skip: 0, conflict: 0 });
  assert.deepEqual(await ledger.importSheetRows(source), { create: 2, update: 0, skip: 0, conflict: 0 });
  assert.deepEqual((await ledger.migrationDryRun(source)).counts, { create: 0, update: 0, skip: 2, conflict: 0 });
  await ledger.markMigrationReady(source);
  assert.equal(await ledger.isReady(), true);
  await ledger.markMigrationReady(source);
  await assert.rejects(ledger.markMigrationReady(table(cancelled)), TrainingSignatureConflictError);
  assert.equal((await ledger.getSignature("QA-EVENT", "QA-STAFF")).signatureId, "SIG-NEW");
  assert.equal(await ledger.getSignatureFile("QA-EVENT", "QA-STAFF"), "QA-PRIVATE-FILE");
  assert.equal((await ledger.listSignatures()).length, 2);
  assert.equal([...db.values.keys()].filter((key) => key.endsWith("/migration")).length, 2);
});

test("QA ledger atomically shares a group file, blocks duplicates, records cancellation and re-sign", async () => {
  const db = fakeFirestore();
  const ledger = new TrainingSignatureLedger({ database: () => db, context: () => qa });
  const group = [record("SIG-A", "QA-A", "QA-SYNTHETIC"), record("SIG-B", "QA-B", "QA-SYNTHETIC")];
  await ledger.appendSignatures(group);
  assert.equal((await ledger.listSignatures()).length, 2);
  assert.equal(new Set((await ledger.listSignatures()).map((row) => row.signatureFileId)).size, 1);
  await assert.rejects(ledger.appendSignatures([record("SIG-C", "QA-A", "QA-SYNTHETIC")]), TrainingSignatureConflictError);
  const cancelled = { ...group[0], "상태": "취소", "취소여부": "Y", "취소사유": "QA 검증",
    "정정자": "QA-ADMIN", "정정일시": "2026-10-10T10:00:00.000Z" };
  await ledger.cancelSignature(group[0], cancelled);
  assert.equal(await ledger.getAttendanceStatus("QA-A", "QA-SYNTHETIC"), false);
  assert.equal(await ledger.getAttendanceStatus("QA-B", "QA-SYNTHETIC"), true);
  await ledger.appendSignatures([record("SIG-D", "QA-A", "QA-SYNTHETIC", { "출석방식": "correction", "서명파일ID": "" })]);
  assert.equal((await ledger.getSignature("QA-A", "QA-SYNTHETIC")).signatureId, "SIG-D");
  assert.equal((await ledger.listSignatures("QA-A")).length, 2);
  assert.equal([...db.values.keys()].filter((key) => key.includes("/history/")).length, 4);
});

test("migration rejects duplicate active identity and different existing rows", () => {
  const a = record("SIG-A", "QA-A", "QA-SYNTHETIC");
  const b = record("SIG-B", "QA-A", "QA-SYNTHETIC");
  assert.equal(planSignatureMigration(table(a, b), []).counts.conflict, 1);
  assert.equal(planSignatureMigration(table(a), [{ ...a, identityKey: "wrong" }]).counts.conflict, 1);
});

test("empty QA source cannot mark a ledger ready", async () => {
  const db = fakeFirestore();
  const ledger = new TrainingSignatureLedger({ database: () => db, context: () => qa });
  await assert.rejects(ledger.markMigrationReady(table()), TrainingSignatureConflictError);
  assert.equal(await ledger.isReady(), false);
  assert.equal(db.values.size, 0);
});

test("Phase 1 refuses all Production ledger writes", async () => {
  const db = fakeFirestore();
  const ledger = new TrainingSignatureLedger({ database: () => db, context: () => production });
  await assert.rejects(ledger.appendSignatures([record("SIG-A", "P-A", "QA-SYNTHETIC")]), TrainingSignatureConflictError);
  await assert.rejects(ledger.importSheetRows(table()), TrainingSignatureConflictError);
  assert.equal(db.values.size, 0);
});

test("training store routes QA writes to ledger while Production cancellation stays Sheet-backed", async () => {
  const calls = [];
  const ledger = { appendSignatures: async () => calls.push("qa-append"),
    cancelSignature: async () => calls.push("qa-cancel") };
  const qaStore = new TrainingCenterStore({ ledger, environment: () => "qa" });
  await qaStore.appendSignatures([record("SIG-A", "QA-A", "QA-SYNTHETIC")]);
  await qaStore.cancelSignature(record("SIG-A", "QA-A", "QA-SYNTHETIC"), record("SIG-A", "QA-A", "QA-SYNTHETIC"));
  const productionStore = new TrainingCenterStore({ ledger, environment: () => "production" });
  productionStore.saveRow = async (name) => calls.push(name);
  await productionStore.cancelSignature({ rowNumber: 2 }, {});
  assert.deepEqual(calls, ["qa-append", "qa-cancel", "교직원교육전자서명"]);
});
