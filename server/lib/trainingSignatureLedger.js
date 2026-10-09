import { createHash, randomUUID } from "node:crypto";
import { getFirebaseAdminDb } from "./firebaseAdmin.js";
import { requireTrainingEnvironment } from "./trainingDeployment.js";
import { activeSignature, sheetRows, signatureKey, SIGNATURE_HEADERS } from "./trainingCenterPhase2.js";

const COLLECTIONS = { qa: "training_signature_ledger_qa", production: "training_signature_ledger_production" };
const MIGRATION_ID = "__migration";

export class TrainingSignatureConflictError extends Error {
  constructor(message = "서명 원장이 다른 요청에서 변경되었습니다.") { super(message); }
}

function normalizedRow(record) {
  return Object.fromEntries(SIGNATURE_HEADERS.map((header) => [header, String(record?.[header] ?? "").normalize("NFKC").trim()]));
}

function identity(record) {
  if (!/^[A-Za-z0-9_-]{3,150}$/.test(record.eventId) || !/^[A-Za-z0-9_-]{2,150}$/.test(record["교직원ID"]) ||
    !/^[A-Za-z0-9_-]{3,150}$/.test(record.signatureId)) throw new RangeError("서명 식별자를 확인해 주세요.");
  return signatureKey(record.eventId, record["교직원ID"]);
}

function ledgerEntry(record, environment, source = {}) {
  const row = normalizedRow(record);
  return { ...row, environment, identityKey: identity(row),
    signedAt: row["서명일시"], signatureFileId: row["서명파일ID"] || null,
    attendanceStatus: row["상태"], active: activeSignature(row),
    cancelledAt: row["취소여부"] === "Y" ? row["정정일시"] || null : null,
    cancelledBy: row["취소여부"] === "Y" ? row["정정자"] || null : null,
    sourceType: source.type || "admin", sourceSheet: source.sheet || null,
    sourceRow: source.row || null, sourceFingerprint: source.type === "sheet-migration" ?
      createHash("sha256").update(JSON.stringify(row)).digest("hex") : null,
    firestoreCreatedAt: source.createdAt || new Date(), firestoreUpdatedAt: new Date() };
}

export function planSignatureMigration(sheetValues, existingEntries) {
  const rows = sheetRows(sheetValues, SIGNATURE_HEADERS).filter((row) => row.signatureId);
  const byId = new Map(existingEntries.map((entry) => [entry.signatureId, entry]));
  const seen = new Set();
  const counts = { create: 0, update: 0, skip: 0, conflict: 0 };
  for (const row of rows) {
    const key = identity(row);
    if (seen.has(row.signatureId)) { counts.conflict += 1; continue; }
    seen.add(row.signatureId);
    const existing = byId.get(row.signatureId);
    if (!existing) { counts.create += 1; continue; }
    if (existing.identityKey !== key || SIGNATURE_HEADERS.some((header) => String(existing[header] ?? "") !== row[header])) counts.conflict += 1;
    else counts.skip += 1;
  }
  const activeKeys = rows.filter(activeSignature).map(identity);
  if (new Set(activeKeys).size !== activeKeys.length) counts.conflict += 1;
  return { counts, rows };
}

export class TrainingSignatureLedger {
  constructor({ database = getFirebaseAdminDb, context = () => process.env } = {}) {
    this.database = database;
    this.context = context;
  }

  get environment() { return requireTrainingEnvironment(this.context()); }
  get collectionName() { return COLLECTIONS[this.environment]; }
  get collection() { return this.database().collection(this.collectionName); }

  assertQaWrite() {
    if (this.environment !== "qa") throw new TrainingSignatureConflictError("Phase 1에서는 QA 서명 원장만 쓸 수 있습니다.");
  }

  pairRef(eventId, staffId) { return this.collection.doc(signatureKey(eventId, staffId)); }

  async listSignatures(eventId = "") {
    const pairs = await this.collection.get();
    const entries = [];
    for (const pair of pairs.docs) {
      if (pair.id === MIGRATION_ID) continue;
      const data = pair.data();
      if (data.environment !== this.environment || pair.id !== signatureKey(data.eventId, data.staffId)) throw new TrainingSignatureConflictError();
      if (eventId && data.eventId !== eventId) continue;
      const history = await pair.ref.collection("signatures").get();
      for (const doc of history.docs) {
        const entry = doc.data();
        if (entry.environment !== this.environment || entry.identityKey !== pair.id || entry.signatureId !== doc.id) throw new TrainingSignatureConflictError();
        entries.push(entry);
      }
    }
    return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.signatureId.localeCompare(b.signatureId));
  }

  async isReady() {
    if (this.environment !== "qa") return false;
    const marker = await this.collection.doc(MIGRATION_ID).get();
    if (!marker.exists || marker.data().environment !== "qa" || marker.data().status !== "ready" ||
      !Number.isInteger(marker.data().sourceCount) || marker.data().sourceCount < 1 || !Array.isArray(marker.data().sourceSignatures) ||
      marker.data().sourceSignatures.length !== marker.data().sourceCount) return false;
    const imported = new Map((await this.listSignatures()).filter((entry) => entry.sourceType === "sheet-migration")
      .map((entry) => [entry.signatureId, entry.sourceFingerprint]));
    return marker.data().sourceSignatures.every(({ signatureId, fingerprint }) => imported.get(signatureId) === fingerprint);
  }

  async getSignature(eventId, staffId) {
    const pair = await this.pairRef(eventId, staffId).get();
    if (!pair.exists) return null;
    const data = pair.data();
    if (data.environment !== this.environment || data.eventId !== eventId || data.staffId !== staffId) throw new TrainingSignatureConflictError();
    if (!data.activeSignatureId) return null;
    const entry = await pair.ref.collection("signatures").doc(data.activeSignatureId).get();
    if (!entry.exists || !activeSignature(entry.data())) throw new TrainingSignatureConflictError();
    return entry.data();
  }

  async getAttendanceStatus(eventId, staffId) { return Boolean(await this.getSignature(eventId, staffId)); }
  async getSignatureFile(eventId, staffId) { return (await this.getSignature(eventId, staffId))?.signatureFileId || null; }

  async appendSignatures(records) {
    this.assertQaWrite();
    const rows = records.map(normalizedRow);
    if (!rows.length || new Set(rows.map(identity)).size !== rows.length || new Set(rows.map((row) => row.signatureId)).size !== rows.length ||
      rows.some((row) => !activeSignature(row))) throw new TrainingSignatureConflictError();
    const db = this.database();
    const refs = rows.map((row) => this.pairRef(row.eventId, row["교직원ID"]));
    await db.runTransaction(async (transaction) => {
      const snapshots = [];
      const entryRefs = rows.map((row, index) => refs[index].collection("signatures").doc(row.signatureId));
      const entries = [];
      for (const ref of refs) snapshots.push(await transaction.get(ref));
      for (const ref of entryRefs) entries.push(await transaction.get(ref));
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const ref = refs[index];
        const snapshot = snapshots[index];
        const pair = snapshot.exists ? snapshot.data() : null;
        if (pair && (pair.environment !== "qa" || pair.eventId !== row.eventId || pair.staffId !== row["교직원ID"] || pair.activeSignatureId)) throw new TrainingSignatureConflictError();
        const entryRef = entryRefs[index];
        if (entries[index].exists) throw new TrainingSignatureConflictError();
        transaction.set(ref, { eventId: row.eventId, staffId: row["교직원ID"], environment: "qa",
          activeSignatureId: row.signatureId, createdAt: pair?.createdAt || new Date(), updatedAt: new Date() }, { merge: true });
        transaction.create(entryRef, ledgerEntry(row, "qa"));
        transaction.create(entryRef.collection("history").doc(`create-${randomUUID()}`),
          { action: "created", at: row.createdAt || row["서명일시"], actor: row["정정자"] || null, row });
      }
    });
  }

  async cancelSignature(record, corrected) {
    this.assertQaWrite();
    const before = normalizedRow(record);
    const after = normalizedRow(corrected);
    if (identity(before) !== identity(after) || before.signatureId !== after.signatureId || !activeSignature(before) || activeSignature(after) || after["취소여부"] !== "Y") throw new TrainingSignatureConflictError();
    const pairRef = this.pairRef(before.eventId, before["교직원ID"]);
    const entryRef = pairRef.collection("signatures").doc(before.signatureId);
    await this.database().runTransaction(async (transaction) => {
      const pair = await transaction.get(pairRef);
      const entry = await transaction.get(entryRef);
      if (!pair.exists || pair.data().environment !== "qa" || pair.data().activeSignatureId !== before.signatureId ||
        !entry.exists || SIGNATURE_HEADERS.some((header) => entry.data()[header] !== before[header])) throw new TrainingSignatureConflictError();
      transaction.update(entryRef, { ...after, active: false, attendanceStatus: after["상태"],
        cancelledAt: after["정정일시"] || null, cancelledBy: after["정정자"] || null, firestoreUpdatedAt: new Date() });
      transaction.update(pairRef, { activeSignatureId: null, updatedAt: new Date() });
      transaction.create(entryRef.collection("history").doc(`cancel-${randomUUID()}`),
        { action: "cancelled", at: after["정정일시"], actor: after["정정자"], reason: after["취소사유"], before, after });
    });
  }

  async migrationDryRun(sheetValues) { return planSignatureMigration(sheetValues, await this.listSignatures()); }

  async markMigrationReady(sheetValues) {
    this.assertQaWrite();
    const plan = await this.migrationDryRun(sheetValues);
    if (!plan.rows.length || plan.counts.create || plan.counts.update || plan.counts.conflict || plan.counts.skip !== plan.rows.length) throw new TrainingSignatureConflictError();
    const fingerprint = createHash("sha256").update(JSON.stringify(plan.rows.map(normalizedRow))).digest("hex");
    const sourceSignatures = plan.rows.map((row) => ({ signatureId: row.signatureId,
      fingerprint: createHash("sha256").update(JSON.stringify(normalizedRow(row))).digest("hex") }));
    const ref = this.collection.doc(MIGRATION_ID);
    await this.database().runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      if (current.exists) {
        if (current.data().environment !== "qa" || current.data().status !== "ready" ||
          current.data().sourceCount !== plan.rows.length || current.data().sourceFingerprint !== fingerprint) throw new TrainingSignatureConflictError();
        return;
      }
      transaction.create(ref, { environment: "qa", status: "ready", sourceSheet: "교직원교육전자서명",
        sourceCount: plan.rows.length, sourceFingerprint: fingerprint, sourceSignatures, markedAt: new Date() });
    });
  }

  async importSheetRows(sheetValues) {
    this.assertQaWrite();
    const plan = await this.migrationDryRun(sheetValues);
    if (plan.counts.conflict || plan.counts.update) throw new TrainingSignatureConflictError();
    const existingIds = new Set((await this.listSignatures()).map((entry) => entry.signatureId));
    const rows = plan.rows.filter((row) => !existingIds.has(row.signatureId));
    if (!rows.length) return plan.counts;
    const groups = new Map();
    for (const row of rows) {
      const key = identity(row);
      if (!groups.has(key)) groups.set(key, { ref: this.pairRef(row.eventId, row["교직원ID"]), rows: [] });
      groups.get(key).rows.push(row);
    }
    const entryRefs = rows.map((row) => groups.get(identity(row)).ref.collection("signatures").doc(row.signatureId));
    await this.database().runTransaction(async (transaction) => {
      const pairs = new Map();
      const entries = [];
      for (const [key, group] of groups) pairs.set(key, await transaction.get(group.ref));
      for (const ref of entryRefs) entries.push(await transaction.get(ref));
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const pair = pairs.get(identity(row));
        if (entries[index].exists || pair.exists && (pair.data().environment !== "qa" || pair.data().eventId !== row.eventId ||
          pair.data().staffId !== row["교직원ID"] || activeSignature(row) && pair.data().activeSignatureId)) throw new TrainingSignatureConflictError();
      }
      for (const group of groups.values()) {
        const pair = pairs.get(identity(group.rows[0]));
        const active = group.rows.find(activeSignature);
        transaction.set(group.ref, { eventId: group.rows[0].eventId, staffId: group.rows[0]["교직원ID"], environment: "qa",
          activeSignatureId: active?.signatureId || (pair.exists ? pair.data().activeSignatureId || null : null),
          createdAt: pair.exists ? pair.data().createdAt : new Date(), updatedAt: new Date() }, { merge: true });
      }
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const entryRef = entryRefs[index];
        transaction.create(entryRef, ledgerEntry(row, "qa", { type: "sheet-migration", sheet: "교직원교육전자서명", row: row.rowNumber }));
        transaction.create(entryRef.collection("history").doc("migration"), { action: "imported", at: new Date(), sourceRow: row.rowNumber });
      }
    });
    return plan.counts;
  }
}

export const trainingSignatureLedger = new TrainingSignatureLedger();
