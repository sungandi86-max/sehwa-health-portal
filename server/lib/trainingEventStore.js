import { getFirebaseAdminDb } from "./firebaseAdmin.js";
import { requireTrainingEnvironment } from "./trainingDeployment.js";
import { trainingEventFromSheetRow, trainingEventToSheetRow } from "./trainingEventSchema.js";

const COLLECTIONS = { qa: "training_events_qa", production: "training_events_production" };

export class TrainingEventConflictError extends Error {}

export class TrainingEventStore {
  constructor({ database = getFirebaseAdminDb, context = () => process.env } = {}) {
    this.database = database;
    this.context = context;
  }

  get environment() { return requireTrainingEnvironment(this.context()); }

  get collectionName() { return COLLECTIONS[this.environment]; }

  async listEvents() {
    const snapshot = await this.database().collection(this.collectionName).get();
    const docs = snapshot.docs.map((doc) => {
      const data = doc.data();
      if (data.eventId !== doc.id || data.environment !== this.environment) throw new Error("교육 이벤트 원본을 확인해 주세요.");
      return data;
    });
    docs.sort((a, b) => (a.sourceRow || Infinity) - (b.sourceRow || Infinity) || a.eventId.localeCompare(b.eventId));
    return docs.map(trainingEventToSheetRow);
  }

  async getEvent(eventId) {
    const doc = await this.database().collection(this.collectionName).doc(eventId).get();
    if (!doc.exists) return null;
    if (doc.data().eventId !== doc.id || doc.data().environment !== this.environment) throw new Error("교육 이벤트 원본을 확인해 주세요.");
    return trainingEventToSheetRow(doc.data());
  }

  async eventExists(eventId) { return Boolean(await this.getEvent(eventId)); }

  async saveEvent(values, existing = null) {
    const incoming = trainingEventFromSheetRow(values);
    if (existing && existing.eventId !== incoming.eventId) throw new TrainingEventConflictError("교육 ID를 변경할 수 없습니다.");
    const ref = this.database().collection(this.collectionName).doc(incoming.eventId);
    await this.database().runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      if (existing ? !current.exists : current.exists) throw new TrainingEventConflictError("교육 이벤트가 다른 요청에서 변경되었습니다.");
      if (current.exists && (current.data().eventId !== ref.id || current.data().environment !== this.environment ||
        JSON.stringify(trainingEventToSheetRow(current.data())) !== JSON.stringify(trainingEventToSheetRow(trainingEventFromSheetRow(existing))))) {
        throw new TrainingEventConflictError("교육 이벤트가 다른 요청에서 변경되었습니다.");
      }
      const now = new Date();
      const data = { ...incoming, environment: this.environment, sourceType: "admin", sourceSheet: current.exists ? current.data().sourceSheet || null : null,
        sourceRow: current.exists ? current.data().sourceRow || null : null, sourceFingerprint: null,
        migratedAt: current.exists ? current.data().migratedAt || null : null,
        firestoreCreatedAt: current.exists ? current.data().firestoreCreatedAt : now, firestoreUpdatedAt: now };
      if (current.exists) transaction.update(ref, data);
      else transaction.create(ref, data);
    });
  }
}

export const trainingEventStore = new TrainingEventStore();
