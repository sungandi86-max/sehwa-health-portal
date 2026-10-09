import { getFirebaseAdminDb } from "./firebaseAdmin.js";
import { readGoogleSheetValues } from "./staffDirectory.js";
import { requireTrainingEnvironment, trainingCenterSpreadsheetId } from "./trainingDeployment.js";
import { TRAINING_HEADERS, trainingEventFromSheetRow, trainingEventToSheetRow } from "./trainingEventSchema.js";

const SHEET_NAME = "앱_교직원교육";
const COLLECTIONS = { qa: "training_events_qa", production: "training_events_production" };

export class TrainingEventConflictError extends Error {}

function sheetRows(values) {
  const headers = (values?.[0] || []).map((cell) => String(cell ?? "").normalize("NFKC").trim());
  if (TRAINING_HEADERS.some((header) => headers.filter((value) => value === header).length !== 1)) {
    throw new Error("교육 이벤트 원본 헤더가 올바르지 않습니다.");
  }
  return values.slice(1).map((cells, index) => ({ rowNumber: index + 2,
    ...Object.fromEntries(TRAINING_HEADERS.map((header) => [header, String(cells[headers.indexOf(header)] ?? "").normalize("NFKC").trim()])) }))
    .filter((row) => row.eventId);
}

export class TrainingEventStore {
  constructor({ database = getFirebaseAdminDb, readSheet = readGoogleSheetValues, context = () => process.env } = {}) {
    this.database = database;
    this.readSheet = readSheet;
    this.context = context;
  }

  get environment() { return requireTrainingEnvironment(this.context()); }

  get collectionName() { return COLLECTIONS[this.environment]; }

  async sheetEvents() {
    const spreadsheetId = trainingCenterSpreadsheetId(this.context());
    return sheetRows(await this.readSheet({ spreadsheetId, range: `'${SHEET_NAME}'!A1:Z2000` }));
  }

  async listEvents() {
    if (this.environment === "production") return this.sheetEvents();
    const snapshot = await this.database().collection(this.collectionName).get();
    const docs = snapshot.docs.map((doc) => {
      const data = doc.data();
      if (data.eventId !== doc.id || data.environment !== "qa") throw new Error("QA 교육 이벤트 원본을 확인해 주세요.");
      return data;
    });
    docs.sort((a, b) => (a.sourceRow || Infinity) - (b.sourceRow || Infinity) || a.eventId.localeCompare(b.eventId));
    return docs.map(trainingEventToSheetRow);
  }

  async getEvent(eventId) {
    if (this.environment === "production") return (await this.sheetEvents()).find((row) => row.eventId === eventId) || null;
    const doc = await this.database().collection(this.collectionName).doc(eventId).get();
    if (!doc.exists) return null;
    if (doc.data().eventId !== doc.id || doc.data().environment !== "qa") throw new Error("QA 교육 이벤트 원본을 확인해 주세요.");
    return trainingEventToSheetRow(doc.data());
  }

  async eventExists(eventId) { return Boolean(await this.getEvent(eventId)); }

  async saveQaEvent(values, existing) {
    if (this.environment !== "qa") throw new Error("QA 이벤트 저장은 승인된 QA에서만 가능합니다.");
    const incoming = trainingEventFromSheetRow(values);
    const ref = this.database().collection(this.collectionName).doc(incoming.eventId);
    await this.database().runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      if (existing ? !current.exists : current.exists) throw new TrainingEventConflictError("교육 이벤트가 다른 요청에서 변경되었습니다.");
      const now = new Date();
      const data = { ...incoming, environment: "qa", sourceType: "admin", sourceSheet: current.exists ? current.data().sourceSheet || null : null,
        sourceRow: current.exists ? current.data().sourceRow || null : null, sourceFingerprint: null,
        migratedAt: current.exists ? current.data().migratedAt || null : null,
        firestoreCreatedAt: current.exists ? current.data().firestoreCreatedAt : now, firestoreUpdatedAt: now };
      if (current.exists) transaction.update(ref, data);
      else transaction.create(ref, data);
    });
  }

  async mirrorPlan() {
    if (this.environment !== "qa") throw new Error("QA 이벤트 mirror는 승인된 QA에서만 가능합니다.");
    const rows = await this.sheetEvents();
    const ids = rows.map((row) => row.eventId);
    if (new Set(ids).size !== ids.length) throw new Error("원본 교육 ID가 중복되었습니다.");
    const snapshot = await this.database().collection(this.collectionName).get();
    const existing = new Map(snapshot.docs.map((doc) => [doc.id, doc.data()]));
    const foreign = snapshot.docs.filter((doc) => doc.data().eventId !== doc.id || doc.data().environment !== "qa")
      .map((doc) => ({ eventId: doc.id, action: "conflict" }));
    const items = rows.map((row) => {
      const incoming = trainingEventFromSheetRow(row);
      const current = existing.get(incoming.eventId);
      const action = !current ? "create" : current.environment === "qa" && current.sourceType === "sheet-mirror" &&
        current.sourceSheet === SHEET_NAME && current.sourceRow === incoming.sourceRow &&
        current.sourceFingerprint === incoming.sourceFingerprint &&
        JSON.stringify(trainingEventToSheetRow(current)) === JSON.stringify(trainingEventToSheetRow(incoming)) ? "skip" : "conflict";
      return { eventId: incoming.eventId, action, incoming };
    }).concat(foreign.filter(({ eventId }) => !ids.includes(eventId)));
    const counts = Object.fromEntries(["create", "update", "skip", "conflict"].map((key) => [key, items.filter((item) => item.action === key).length]));
    return { items, counts, sourceCount: rows.length, existingCount: snapshot.size };
  }

  async applyMirror() {
    const plan = await this.mirrorPlan();
    if (plan.counts.conflict || plan.counts.update) throw new TrainingEventConflictError("교육 이벤트 mirror 충돌을 먼저 해결해야 합니다.");
    const creates = plan.items.filter((item) => item.action === "create");
    if (creates.length > 500) throw new Error("교육 이벤트 mirror 한도를 초과했습니다.");
    if (creates.length) {
      const batch = this.database().batch();
      const now = new Date();
      for (const item of creates) batch.create(this.database().collection(this.collectionName).doc(item.eventId), {
        ...item.incoming, environment: "qa", migratedAt: now, firestoreCreatedAt: now, firestoreUpdatedAt: now,
      });
      await batch.commit();
    }
    return { ...plan.counts, applied: creates.length };
  }
}

export const trainingEventStore = new TrainingEventStore();
export { SHEET_NAME as TRAINING_EVENT_SHEET };
