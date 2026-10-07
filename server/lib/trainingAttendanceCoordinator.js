import { randomUUID } from "node:crypto";
import { signatureKey } from "./trainingCenterPhase2.js";
import { trainingLockCollection } from "./trainingDeployment.js";

const LEASE_MS = 15 * 60 * 1000;

export class AttendanceConflictError extends Error {
  constructor() {
    super("이미 출석 처리 중이거나 완료된 교육이 있습니다.");
    this.code = "attendance-conflict";
  }
}

export async function reserveAttendance(db, eventIds, staffId, now = Date.now()) {
  const requestId = randomUUID();
  const createdAt = new Date(now).toISOString();
  const refs = eventIds.map((eventId) => db.collection(trainingLockCollection()).doc(signatureKey(eventId, staffId)));
  let originalRequestId = requestId;
  let originalCreatedAt = createdAt;
  let priorRequestIds = [];
  let legacyYearLookup = false;
  await db.runTransaction(async (transaction) => {
    originalRequestId = requestId;
    originalCreatedAt = createdAt;
    priorRequestIds = [];
    legacyYearLookup = false;
    const snapshots = [];
    for (const ref of refs) snapshots.push(await transaction.get(ref));
    if (snapshots.some((snap) => {
      if (!snap.exists) return false;
      const data = snap.data();
      return data?.state === "completed" || data?.state === "pending";
    })) throw new AttendanceConflictError();
    const previous = snapshots.map((snapshot) => snapshot.exists ? snapshot.data() : {});
    const failed = previous.filter((data) => data.state === "failed");
    if (failed.length) {
      if (failed.length !== eventIds.length || failed.some((data) => data.staffId !== staffId ||
        JSON.stringify(data.eventIds) !== JSON.stringify(eventIds))) throw new AttendanceConflictError();
      const originals = failed.map((data) => data.originalRequestId || data.orphanAttempts?.[0]?.requestId || data.requestId);
      const created = failed.map((data) => data.originalCreatedAt || data.createdAt);
      if (new Set(originals).size !== 1 || !originals[0] || new Set(created).size !== 1 ||
        !Number.isFinite(Date.parse(created[0]))) throw new AttendanceConflictError();
      originalRequestId = originals[0];
      originalCreatedAt = created[0];
      legacyYearLookup = failed.some((data) => data.legacyYearLookup || !data.originalCreatedAt && data.orphanAttempts?.length);
      priorRequestIds = [...new Set([originalRequestId, ...failed.flatMap((data) => [
        ...(data.orphanAttempts || []).map((attempt) => attempt.requestId), data.requestId,
      ])].filter(Boolean))];
    }
    refs.forEach((ref, index) => {
      const prior = previous[index];
      const orphanAttempts = [...(prior.state === "failed" ? prior.orphanAttempts || [] : []), ...(prior.state === "failed" && prior.requestId ?
        [{ requestId: prior.requestId, fileIds: prior.orphanFileIds || [] }] : [])];
      const historicalOrphanAttempts = [...(prior.historicalOrphanAttempts || []),
        ...(prior.state === "failed" ? [] : prior.orphanAttempts || [])];
      if (orphanAttempts.length + historicalOrphanAttempts.length > 20) throw new AttendanceConflictError();
      transaction.set(ref, {
        eventId: eventIds[index], eventIds, staffId, state: "pending", requestId, originalRequestId, originalCreatedAt,
        legacyYearLookup,
        leaseUntil: now + LEASE_MS, createdAt, updatedAt: createdAt, orphanAttempts, historicalOrphanAttempts,
      });
    });
  });
  return { db, requestId, originalRequestId, originalCreatedAt, priorRequestIds, legacyYearLookup, refs };
}

export async function attachAttendanceFile(reservation, fileId, now = Date.now(), storageRequestId = reservation.requestId) {
  await reservation.db.runTransaction(async (transaction) => {
    const snapshots = [];
    for (const ref of reservation.refs) snapshots.push(await transaction.get(ref));
    if (snapshots.some((snap) => !snap.exists || snap.data()?.state !== "pending" || snap.data()?.requestId !== reservation.requestId)) {
      throw new AttendanceConflictError();
    }
    reservation.refs.forEach((ref) => transaction.set(ref, { uploadedFileId: fileId, storageRequestId,
      leaseUntil: now + LEASE_MS, updatedAt: new Date(now).toISOString() }, { merge: true }));
  });
}

export async function markAttendanceAppendStarted(reservation, now = Date.now()) {
  await reservation.db.runTransaction(async (transaction) => {
    const snapshots = [];
    for (const ref of reservation.refs) snapshots.push(await transaction.get(ref));
    if (snapshots.some((snap) => !snap.exists || snap.data()?.state !== "pending" || snap.data()?.requestId !== reservation.requestId)) {
      throw new AttendanceConflictError();
    }
    reservation.refs.forEach((ref) => transaction.set(ref, { appendStartedAt: new Date(now).toISOString(),
      leaseUntil: now + LEASE_MS, updatedAt: new Date(now).toISOString() }, { merge: true }));
  });
}

export async function finishAttendance(reservation, state, extra = {}) {
  await reservation.db.runTransaction(async (transaction) => {
    const snapshots = [];
    for (const ref of reservation.refs) snapshots.push(await transaction.get(ref));
    if (snapshots.some((snap) => !snap.exists || snap.data()?.requestId !== reservation.requestId || snap.data()?.state !== "pending")) {
      throw new AttendanceConflictError();
    }
    reservation.refs.forEach((ref) => transaction.set(ref, { state, requestId: reservation.requestId, leaseUntil: 0,
      updatedAt: new Date().toISOString(), ...extra }, { merge: true }));
  });
}

export async function cancelAttendanceLock(db, eventId, staffId, actor) {
  const ref = db.collection(trainingLockCollection()).doc(signatureKey(eventId, staffId));
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists && snapshot.data()?.state === "pending") throw new AttendanceConflictError();
    transaction.set(ref, { state: "cancelled", leaseUntil: 0,
      correctedBy: actor, updatedAt: new Date().toISOString() }, { merge: true });
  });
}

export async function assertCompletedAttendanceLock(db, eventId, staffId) {
  const ref = db.collection(trainingLockCollection()).doc(signatureKey(eventId, staffId));
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.data()?.state !== "completed") throw new AttendanceConflictError();
  });
}
