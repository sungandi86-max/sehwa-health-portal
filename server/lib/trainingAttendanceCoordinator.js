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
  const refs = eventIds.map((eventId) => db.collection(trainingLockCollection()).doc(signatureKey(eventId, staffId)));
  await db.runTransaction(async (transaction) => {
    const snapshots = [];
    for (const ref of refs) snapshots.push(await transaction.get(ref));
    if (snapshots.some((snap) => {
      if (!snap.exists) return false;
      const data = snap.data();
      return data?.state === "completed" || data?.state === "pending";
    })) throw new AttendanceConflictError();
    refs.forEach((ref, index) => {
      const previous = snapshots[index].exists ? snapshots[index].data() : {};
      const orphanAttempts = [...(previous.orphanAttempts || []), ...(previous.state === "failed" && previous.requestId ?
        [{ requestId: previous.requestId, fileIds: previous.orphanFileIds || [] }] : [])];
      if (orphanAttempts.length > 20) throw new AttendanceConflictError();
      transaction.set(ref, {
        eventId: eventIds[index], eventIds, staffId, state: "pending", requestId, leaseUntil: now + LEASE_MS,
        createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), orphanAttempts,
      });
    });
  });
  return { db, requestId, refs };
}

export async function attachAttendanceFile(reservation, fileId, now = Date.now()) {
  await reservation.db.runTransaction(async (transaction) => {
    const snapshots = [];
    for (const ref of reservation.refs) snapshots.push(await transaction.get(ref));
    if (snapshots.some((snap) => !snap.exists || snap.data()?.state !== "pending" || snap.data()?.requestId !== reservation.requestId)) {
      throw new AttendanceConflictError();
    }
    reservation.refs.forEach((ref) => transaction.set(ref, { uploadedFileId: fileId,
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
