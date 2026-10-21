import { getFirebaseAdminDb } from "./firebaseAdmin.js";
import { requireTrainingEnvironment } from "./trainingDeployment.js";
import { trainingEventFromSheetRow, trainingEventToSheetRow } from "./trainingEventSchema.js";
import { groupDigest, trainingEventGroupCollectionName } from "./trainingEventGroupStore.js";

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
    return docs.map((data) => ({ ...trainingEventToSheetRow(data), ...(data.registrationMode ? { registrationMode: data.registrationMode } : {}), ...(data.completionTaskId ? { completionTaskId: data.completionTaskId } : {}), ...(data.ownerStaffId ? { ownerStaffId: data.ownerStaffId } : {}),
      ...(data.createdByStaffId ? { createdByStaffId: data.createdByStaffId } : {}),
      ...(data.targetSnapshot?.schemaVersion === 1 ? { targetSnapshot: data.targetSnapshot } : {}) }));
  }

  async getEvent(eventId) {
    const doc = await this.database().collection(this.collectionName).doc(eventId).get();
    if (!doc.exists) return null;
    if (doc.data().eventId !== doc.id || doc.data().environment !== this.environment) throw new Error("교육 이벤트 원본을 확인해 주세요.");
    return { ...trainingEventToSheetRow(doc.data()), ...(doc.data().registrationMode ? { registrationMode: doc.data().registrationMode } : {}), ...(doc.data().completionTaskId ? { completionTaskId: doc.data().completionTaskId } : {}), ...(doc.data().ownerStaffId ? { ownerStaffId: doc.data().ownerStaffId } : {}),
      ...(doc.data().createdByStaffId ? { createdByStaffId: doc.data().createdByStaffId } : {}),
      ...(doc.data().targetSnapshot?.schemaVersion === 1 ? { targetSnapshot: doc.data().targetSnapshot } : {}) };
  }

  async eventExists(eventId) { return Boolean(await this.getEvent(eventId)); }

  async saveEvent(values, existing = null, actor = null) {
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
      if (!current.exists && actor && (!actor.uid || actor.staffId !== ownerStaffId)) throw new TrainingEventConflictError("교육 생성자 정보를 확인해 주세요.");
      const data = { ...incoming, ...snapshot, environment: this.environment, sourceType: "admin", sourceSheet: current.exists ? current.data().sourceSheet || null : null,
        sourceRow: current.exists ? current.data().sourceRow || null : null, sourceFingerprint: null,
        migratedAt: current.exists ? current.data().migratedAt || null : null,
        createdByUid: current.exists ? current.data().createdByUid || null : actor?.uid || null,
        createdByStaffId: current.exists ? current.data().createdByStaffId || null : actor?.staffId || null,
        ownerRevision: current.exists ? current.data().ownerRevision || 1 : 1,
        firestoreCreatedAt: current.exists ? current.data().firestoreCreatedAt : now, firestoreUpdatedAt: now };
      if (current.exists) transaction.update(ref, data);
      else transaction.create(ref, data);
    });
  }

  async transferOwner(eventId, { expectedOwnerStaffId = "", newOwnerStaffId, actorUid, actorStaffId, reason }) {
    const nextOwner = String(newOwnerStaffId || "").normalize("NFKC").trim();
    const note = String(reason || "").normalize("NFKC").trim();
    if (!/^[A-Za-z0-9_-]{2,120}$/.test(nextOwner) || !actorUid || !actorStaffId || !note || note.length > 200) {
      throw new TrainingEventConflictError("담당자 이관 정보를 확인해 주세요.");
    }
    const eventRef = this.database().collection(this.collectionName).doc(eventId);
    const groupQuery = this.database().collection(trainingEventGroupCollectionName(this.environment)).where("eventIds", "array-contains", eventId);
    return this.database().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(eventRef);
      const groupSnapshot = await transaction.get(groupQuery);
      const data = snapshot.exists ? snapshot.data() : null;
      if (!data || data.environment !== this.environment || data.eventId !== eventId) throw new TrainingEventConflictError("교육을 찾을 수 없습니다.");
      if ((data.ownerStaffId || "") !== expectedOwnerStaffId || data.ownerStaffId === nextOwner) throw new TrainingEventConflictError("교육 담당자 정보가 변경되었습니다.");
      const revision = (data.ownerRevision || 1) + 1;
      const transferredAt = new Date().toISOString();
      const groups = groupSnapshot.docs.map((doc) => ({ ref: doc.ref, data: doc.data() }));
      if (groups.some((group) => group.data.environment !== this.environment || group.data.attendanceAttempt)) {
        throw new TrainingEventConflictError("출석 처리 중인 묶음의 담당자는 이관할 수 없습니다.");
      }
      const lockedEventIds = [...new Set(groups.filter((group) => group.data.lockedAt)
        .flatMap((group) => group.data.eventIds).filter((id) => id !== eventId))];
      const lockedEventOwners = new Map();
      for (const lockedEventId of lockedEventIds) {
        const lockedEvent = await transaction.get(this.database().collection(this.collectionName).doc(lockedEventId));
        const lockedData = lockedEvent.exists ? lockedEvent.data() : null;
        if (!lockedData || lockedData.environment !== this.environment || lockedData.eventId !== lockedEventId || !lockedData.ownerStaffId) {
          throw new TrainingEventConflictError("묶음 교육 담당자 정보를 확인할 수 없습니다.");
        }
        lockedEventOwners.set(lockedEventId, lockedData.ownerStaffId);
      }
      transaction.update(eventRef, { ownerStaffId: nextOwner, ownerRevision: revision, ownerTransferredAt: transferredAt,
        ownerTransferredByUid: actorUid, ownerTransferredByStaffId: actorStaffId, firestoreUpdatedAt: new Date(transferredAt) });
      transaction.create(eventRef.collection("ownershipHistory").doc(String(revision)), { eventId, revision,
        previousOwnerStaffId: data.ownerStaffId || null, ownerStaffId: nextOwner, reason: note,
        transferredByUid: actorUid, transferredByStaffId: actorStaffId, transferredAt, environment: this.environment });
      for (const group of groups) {
        if (group.data.lockedAt) {
          const participantOwnerStaffIds = group.data.eventIds.map((groupEventId) =>
            groupEventId === eventId ? nextOwner : lockedEventOwners.get(groupEventId));
          const oldOwnerStillParticipates = participantOwnerStaffIds.includes(data.ownerStaffId);
          transaction.update(group.ref, {
            participantOwnerStaffIds: [...new Set(participantOwnerStaffIds)].sort(),
            managerStaffId: group.data.managerStaffId === data.ownerStaffId && !oldOwnerStillParticipates ? nextOwner : group.data.managerStaffId,
            updatedByStaffId: actorStaffId,
            updatedAt: transferredAt,
          });
          continue;
        }
        const groupRevision = group.data.revision + 1;
        const approvals = group.data.approvals.map((approval) => approval.eventId === eventId
          ? { ...approval, ownerStaffId: nextOwner, approved: false, approvedByStaffId: null, approvedAt: null } : approval);
        const next = { ...group.data, revision: groupRevision, approvals,
          participantOwnerStaffIds: [...new Set(approvals.map((approval) => approval.ownerStaffId))].sort(),
          managerStaffId: group.data.managerStaffId === data.ownerStaffId ? nextOwner : group.data.managerStaffId,
          status: "pending_approval", updatedByStaffId: actorStaffId, updatedAt: transferredAt };
        next.digest = groupDigest(next);
        transaction.update(group.ref, next);
        transaction.create(group.ref.collection("revisions").doc(String(groupRevision)), { ...next,
          changeType: "event_owner_transferred", transferredEventId: eventId });
      }
      return { eventId, ownerStaffId: nextOwner, ownerRevision: revision };
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
