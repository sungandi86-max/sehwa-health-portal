import { createHash, randomUUID } from "node:crypto";
import { getFirebaseAdminDb } from "./firebaseAdmin.js";
import { requireTrainingEnvironment } from "./trainingDeployment.js";

const COLLECTIONS = Object.freeze({ qa: "training_event_groups_qa", production: "training_event_groups_production" });
const ID_PATTERN = /^[A-Za-z0-9_-]{3,120}$/;

export class TrainingEventGroupConflictError extends Error {}

export function trainingEventGroupCollectionName(environment) {
  const name = COLLECTIONS[environment];
  if (!name) throw new Error("교육 묶음 환경을 확인해 주세요.");
  return name;
}

const text = (value) => String(value ?? "").normalize("NFKC").trim();
const uniqueSorted = (values) => [...new Set(values.map(text).filter(Boolean))].sort();

export function groupDigest({ groupId, revision, eventIds }) {
  return createHash("sha256").update(JSON.stringify({ groupId: text(groupId), revision: Number(revision), eventIds: uniqueSorted(eventIds || []) })).digest("hex");
}

function validateEvents(eventIds, events) {
  const ids = uniqueSorted(eventIds || []);
  if (ids.length < 2 || ids.length > 30 || ids.some((id) => !ID_PATTERN.test(id))) {
    throw new RangeError("묶음 교육을 2개 이상 30개 이하로 선택해 주세요.");
  }
  const byId = new Map(events.map((event) => [event.eventId, event]));
  const selected = ids.map((id) => byId.get(id));
  if (selected.some((event) => !event || !event.ownerStaffId || !["사용", "TRUE", "Y", "1"].includes(text(event["사용여부"]).toUpperCase()))) {
    throw new TrainingEventGroupConflictError("사용 중이며 담당자가 지정된 교육만 묶을 수 있습니다.");
  }
  return selected;
}

function approvalsFor(selected, { actorStaffId, previous = [] }) {
  const previousById = new Map(previous.map((item) => [item.eventId, item]));
  return selected.map((event) => {
    const prior = previousById.get(event.eventId);
    const preserved = prior?.ownerStaffId === event.ownerStaffId && prior.approved === true;
    const approved = preserved || event.ownerStaffId === actorStaffId;
    return { eventId: event.eventId, ownerStaffId: event.ownerStaffId, approved,
      approvedByStaffId: approved ? (preserved ? prior.approvedByStaffId : actorStaffId) : null,
      approvedAt: approved ? (preserved ? prior.approvedAt : new Date().toISOString()) : null };
  });
}

function publicGroup(data) {
  const approvals = Array.isArray(data.approvals) ? data.approvals : [];
  return { groupId: data.groupId, name: data.name, eventIds: [...data.eventIds], managerStaffId: data.managerStaffId,
    revision: data.revision, digest: data.digest, status: data.status, ready: approvals.length > 0 && approvals.every((item) => item.approved === true),
    lockedAt: data.lockedAt || null, approvals: approvals.map((item) => ({ ...item })), createdByStaffId: data.createdByStaffId,
    createdAt: data.createdAt, updatedAt: data.updatedAt };
}

function checkedGroup(doc, environment) {
  const data = doc.data();
  if (doc.id !== data.groupId || data.environment !== environment) throw new TrainingEventGroupConflictError();
  return publicGroup(data);
}

export class TrainingEventGroupStore {
  constructor({ database = getFirebaseAdminDb, context = () => process.env } = {}) {
    this.database = database;
    this.context = context;
  }

  get environment() { return requireTrainingEnvironment(this.context()); }
  get collectionName() { return trainingEventGroupCollectionName(this.environment); }
  get collection() { return this.database().collection(this.collectionName); }

  async listGroups() {
    const snapshot = await this.collection.get();
    return snapshot.docs.map((doc) => checkedGroup(doc, this.environment))
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)) || left.groupId.localeCompare(right.groupId));
  }

  async listGroupsForActor(actorStaffId, ownedEventIds = []) {
    const staffId = text(actorStaffId);
    if (!ID_PATTERN.test(staffId)) throw new RangeError("교육 담당자 정보를 확인해 주세요.");
    const eventIds = uniqueSorted(ownedEventIds || []);
    const eventQueries = [];
    for (let index = 0; index < eventIds.length; index += 30) {
      eventQueries.push(this.collection.where("eventIds", "array-contains-any", eventIds.slice(index, index + 30)).get());
    }
    const [managed, ...participating] = await Promise.all([
      this.collection.where("managerStaffId", "==", staffId).get(), ...eventQueries,
    ]);
    const docs = new Map([...managed.docs, ...participating.flatMap((snapshot) => snapshot.docs)].map((doc) => [doc.id, doc]));
    return [...docs.values()].map((doc) => checkedGroup(doc, this.environment))
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)) || left.groupId.localeCompare(right.groupId));
  }

  async getGroup(groupId) {
    const snapshot = await this.collection.doc(groupId).get();
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    if (snapshot.id !== data.groupId || data.environment !== this.environment) throw new TrainingEventGroupConflictError();
    return publicGroup(data);
  }

  async createGroup({ groupId = `TG-${randomUUID()}`, name, eventIds, managerStaffId, actorUid, actorStaffId, events }) {
    const normalizedId = text(groupId);
    const normalizedName = text(name);
    const manager = text(managerStaffId);
    if (!ID_PATTERN.test(normalizedId) || !normalizedName || normalizedName.length > 120 || !ID_PATTERN.test(manager) || !text(actorUid) || !ID_PATTERN.test(actorStaffId)) {
      throw new RangeError("묶음 교육 정보를 확인해 주세요.");
    }
    const selected = validateEvents(eventIds, events);
    if (!selected.some((event) => event.ownerStaffId === manager)) throw new RangeError("묶음 관리자는 참여 교육 담당자 중에서 선택해 주세요.");
    const revision = 1;
    const now = new Date().toISOString();
    const approvals = approvalsFor(selected, { actorStaffId });
    const data = { groupId: normalizedId, name: normalizedName, eventIds: selected.map((event) => event.eventId).sort(), managerStaffId: manager,
      participantOwnerStaffIds: uniqueSorted(selected.map((event) => event.ownerStaffId)),
      revision, digest: groupDigest({ groupId: normalizedId, revision, eventIds }), approvals,
      status: approvals.every((item) => item.approved) ? "ready" : "pending_approval", lockedAt: null,
      environment: this.environment, createdByUid: text(actorUid), createdByStaffId: text(actorStaffId), createdAt: now,
      updatedByStaffId: text(actorStaffId), updatedAt: now };
    const groupRef = this.collection.doc(normalizedId);
    await this.database().runTransaction(async (transaction) => {
      if ((await transaction.get(groupRef)).exists) throw new TrainingEventGroupConflictError("이미 존재하는 묶음입니다.");
      transaction.create(groupRef, data);
      transaction.create(groupRef.collection("revisions").doc(String(revision)), { ...data, changeType: "created" });
    });
    return publicGroup(data);
  }

  async updateGroup(groupId, { name, eventIds, managerStaffId, expectedRevision, actorUid, actorStaffId, events }) {
    const groupRef = this.collection.doc(groupId);
    return this.database().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(groupRef);
      if (!snapshot.exists) throw new TrainingEventGroupConflictError("묶음을 찾을 수 없습니다.");
      const current = snapshot.data();
      if (current.environment !== this.environment || current.revision !== expectedRevision || current.lockedAt || current.attendanceAttempt) {
        throw new TrainingEventGroupConflictError(current.lockedAt || current.attendanceAttempt ? "서명이 시작된 묶음은 구성을 변경할 수 없습니다." : "묶음 정보가 변경되었습니다.");
      }
      const selected = validateEvents(eventIds, events);
      if (!selected.some((event) => event.ownerStaffId === text(managerStaffId))) throw new RangeError("묶음 관리자는 참여 교육 담당자 중에서 선택해 주세요.");
      const revision = current.revision + 1;
      const now = new Date().toISOString();
      const next = { ...current, name: text(name), eventIds: selected.map((event) => event.eventId).sort(), managerStaffId: text(managerStaffId), revision,
        participantOwnerStaffIds: uniqueSorted(selected.map((event) => event.ownerStaffId)),
        approvals: approvalsFor(selected, { actorStaffId, previous: current.approvals }),
        updatedByStaffId: text(actorStaffId), updatedAt: now };
      if (!next.name || next.name.length > 120 || !ID_PATTERN.test(next.managerStaffId) || !text(actorUid)) throw new RangeError("묶음 교육 정보를 확인해 주세요.");
      next.digest = groupDigest(next);
      next.status = next.approvals.every((item) => item.approved) ? "ready" : "pending_approval";
      transaction.update(groupRef, next);
      transaction.create(groupRef.collection("revisions").doc(String(revision)), { ...next, changeType: "updated" });
      return publicGroup(next);
    });
  }

  async approveEvent(groupId, eventId, { actorStaffId, events }) {
    const groupRef = this.collection.doc(groupId);
    return this.database().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(groupRef);
      if (!snapshot.exists) throw new TrainingEventGroupConflictError("묶음을 찾을 수 없습니다.");
      const current = snapshot.data();
      if (current.environment !== this.environment || current.lockedAt) throw new TrainingEventGroupConflictError("현재 묶음은 변경할 수 없습니다.");
      const selected = validateEvents(current.eventIds, events);
      const event = selected.find((item) => item.eventId === eventId);
      if (!event || event.ownerStaffId !== actorStaffId) throw new TrainingEventGroupConflictError("본인 교육의 묶음 참여만 승인할 수 있습니다.");
      const currentApproval = current.approvals.find((item) => item.eventId === eventId);
      if (currentApproval?.approved === true && currentApproval.ownerStaffId === actorStaffId) return publicGroup(current);
      const now = new Date().toISOString();
      const revision = current.revision + 1;
      const approvals = current.approvals.map((item) => item.eventId === eventId
        ? { ...item, ownerStaffId: event.ownerStaffId, approved: true, approvedByStaffId: actorStaffId, approvedAt: now } : item);
      const next = { ...current, approvals, revision, updatedByStaffId: actorStaffId, updatedAt: now,
        status: approvals.every((item) => item.approved) ? "ready" : "pending_approval" };
      next.digest = groupDigest(next);
      transaction.update(groupRef, next);
      transaction.create(groupRef.collection("revisions").doc(String(revision)), { ...next, changeType: "event_approved", approvedEventId: eventId });
      return publicGroup(next);
    });
  }

  async beginAttendance(groupId, { revision, digest, requestId, actorStaffId }) {
    const groupRef = this.collection.doc(groupId);
    return this.database().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(groupRef);
      const current = snapshot.exists ? snapshot.data() : null;
      if (!current || current.environment !== this.environment || current.revision !== revision || current.digest !== digest ||
        current.status !== "ready" || !current.approvals.every((item) => item.approved === true)) {
        throw new TrainingEventGroupConflictError("묶음 구성이 변경되었습니다. 새 QR을 사용해 주세요.");
      }
      if (current.lockedAt) return publicGroup(current);
      if (!ID_PATTERN.test(text(requestId))) throw new TrainingEventGroupConflictError("출석 요청 정보를 확인해 주세요.");
      if (current.attendanceAttempt) {
        if (current.attendanceAttempt.requestId !== text(requestId)) throw new TrainingEventGroupConflictError("다른 출석 요청을 처리 중입니다.");
        return publicGroup(current);
      }
      const next = { ...current, attendanceAttempt: { requestId: text(requestId), actorStaffId: text(actorStaffId), startedAt: new Date().toISOString() } };
      transaction.update(groupRef, { attendanceAttempt: next.attendanceAttempt });
      return publicGroup(next);
    });
  }

  async completeAttendance(groupId, { requestId }) {
    const groupRef = this.collection.doc(groupId);
    return this.database().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(groupRef);
      const current = snapshot.exists ? snapshot.data() : null;
      if (!current || current.environment !== this.environment) throw new TrainingEventGroupConflictError("묶음을 찾을 수 없습니다.");
      if (current.lockedAt) return publicGroup(current);
      if (current.attendanceAttempt?.requestId !== text(requestId)) throw new TrainingEventGroupConflictError("출석 요청 상태가 변경되었습니다.");
      const next = { ...current, lockedAt: new Date().toISOString(), lockedByAttendanceStaffId: current.attendanceAttempt.actorStaffId, attendanceAttempt: null };
      transaction.update(groupRef, { lockedAt: next.lockedAt, lockedByAttendanceStaffId: next.lockedByAttendanceStaffId, attendanceAttempt: null });
      return publicGroup(next);
    });
  }

  async releaseAttendance(groupId, { requestId }) {
    const groupRef = this.collection.doc(groupId);
    return this.database().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(groupRef);
      const current = snapshot.exists ? snapshot.data() : null;
      if (!current || current.environment !== this.environment || current.lockedAt || current.attendanceAttempt?.requestId !== text(requestId)) return false;
      transaction.update(groupRef, { attendanceAttempt: null });
      return true;
    });
  }
}

export const trainingEventGroupStore = new TrainingEventGroupStore();
