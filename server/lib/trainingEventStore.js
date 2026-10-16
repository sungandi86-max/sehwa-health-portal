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
    return docs.map((data) => ({ ...trainingEventToSheetRow(data), ...(data.completionTaskId ? { completionTaskId: data.completionTaskId } : {}), ...(data.ownerStaffId ? { ownerStaffId: data.ownerStaffId } : {}),
      ...(data.targetSnapshot?.schemaVersion === 1 ? { targetSnapshot: data.targetSnapshot } : {}) }));
  }

  async getEvent(eventId) {
    const doc = await this.database().collection(this.collectionName).doc(eventId).get();
    if (!doc.exists) return null;
    if (doc.data().eventId !== doc.id || doc.data().environment !== this.environment) throw new Error("교육 이벤트 원본을 확인해 주세요.");
    return { ...trainingEventToSheetRow(doc.data()), ...(doc.data().completionTaskId ? { completionTaskId: doc.data().completionTaskId } : {}), ...(doc.data().ownerStaffId ? { ownerStaffId: doc.data().ownerStaffId } : {}),
      ...(doc.data().targetSnapshot?.schemaVersion === 1 ? { targetSnapshot: doc.data().targetSnapshot } : {}) };
  }

  async eventExists(eventId) { return Boolean(await this.getEvent(eventId)); }

  async saveEvent(values, existing = null) {
    const ownerStaffId = String(values?.ownerStaffId || "").normalize("NFKC").trim();
    if (ownerStaffId && !/^[A-Za-z0-9_-]{2,120}$/.test(ownerStaffId)) throw new TrainingEventConflictError("교육 소유자 정보를 확인해 주세요.");
    const completionTaskId = values.completionTaskId ?? existing?.completionTaskId ?? "";
    if (!["", "none", "cpr-training-2026"].includes(completionTaskId)) throw new TrainingEventConflictError("교육 연계 업무를 확인해 주세요.");
    const incoming = { ...trainingEventFromSheetRow(values), ownerStaffId, ...(completionTaskId ? { completionTaskId } : {}) };
    if (existing && existing.eventId !== incoming.eventId) throw new TrainingEventConflictError("교육 ID를 변경할 수 없습니다.");
    const ref = this.database().collection(this.collectionName).doc(incoming.eventId);
    await this.database().runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      if (existing ? !current.exists : current.exists) throw new TrainingEventConflictError("교육 이벤트가 다른 요청에서 변경되었습니다.");
      if (current.exists && (current.data().eventId !== ref.id || current.data().environment !== this.environment ||
        (JSON.stringify(trainingEventToSheetRow(current.data())) !== JSON.stringify(trainingEventToSheetRow(trainingEventFromSheetRow(existing))) ||
          (current.data().ownerStaffId || "") !== (existing.ownerStaffId || "") || (current.data().completionTaskId || "") !== (existing.completionTaskId || "")))) {
        throw new TrainingEventConflictError("교육 이벤트가 다른 요청에서 변경되었습니다.");
      }
      const now = new Date();
      const snapshot = !current.exists && values.targetSnapshot?.schemaVersion === 1
        ? { targetSnapshot: values.targetSnapshot, targetStaffIds: values.targetSnapshot.members.map((member) => member.staffId) } : {};
      const data = { ...incoming, ...snapshot, environment: this.environment, sourceType: "admin", sourceSheet: current.exists ? current.data().sourceSheet || null : null,
        sourceRow: current.exists ? current.data().sourceRow || null : null, sourceFingerprint: null,
        migratedAt: current.exists ? current.data().migratedAt || null : null,
        firestoreCreatedAt: current.exists ? current.data().firestoreCreatedAt : now, firestoreUpdatedAt: now };
      if (current.exists) transaction.update(ref, data);
      else transaction.create(ref, data);
    });
  }

  async saveSnapshotTarget(eventId, values, person) {
    const ref = this.database().collection(this.collectionName).doc(eventId);
    await this.database().runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      const data = current.data();
      if (!current.exists || data.eventId !== eventId || data.environment !== this.environment || data.targetSnapshot?.schemaVersion !== 1) {
        throw new TrainingEventConflictError("교육 대상자 snapshot을 확인해 주세요.");
      }
      const previous = data.targetSnapshot.members.find((item) => item.staffId === person.staffId);
      const members = data.targetSnapshot.members.filter((item) => item.staffId !== person.staffId);
      if (values["대상상태"] !== "비대상") members.push({ staffId: person.staffId, name: previous?.name || person.name,
        position: previous?.position || person.position, department: previous?.department || person.department, targetStatus: values["대상상태"],
        required: values["필수여부"] === "Y", excludedReason: values["제외사유"] });
      const updatedAt = new Date();
      transaction.update(ref, { targetSnapshot: { ...data.targetSnapshot, members, updatedAt: updatedAt.toISOString() },
        targetStaffIds: members.filter((item) => item.targetStatus === "대상").map((item) => item.staffId), firestoreUpdatedAt: updatedAt });
    });
  }

  async saveTargetSnapshot(eventId, snapshot, expectedSnapshot) {
    const ref = this.database().collection(this.collectionName).doc(eventId);
    await this.database().runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      const data = current.data();
      if (!current.exists || data.eventId !== eventId || data.environment !== this.environment ||
        JSON.stringify(data.targetSnapshot || null) !== JSON.stringify(expectedSnapshot || null)) {
        throw new TrainingEventConflictError("교육 대상자 명단이 변경되었습니다. 다시 확인해 주세요.");
      }
      transaction.update(ref, { targetSnapshot: snapshot,
        targetStaffIds: snapshot.members.filter((member) => member.targetStatus === "대상").map((member) => member.staffId),
        firestoreUpdatedAt: new Date() });
    });
  }
}

export const trainingEventStore = new TrainingEventStore();
