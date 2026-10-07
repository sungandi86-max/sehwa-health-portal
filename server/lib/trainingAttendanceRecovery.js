import { activeSignature, sheetRows, signatureKey, SIGNATURE_HEADERS } from "./trainingCenterPhase2.js";
import { signatureStorageYear } from "./trainingSignatureStorage.js";
import { trainingLockCollection } from "./trainingDeployment.js";

const MIN_STALE_MS = 15 * 60 * 1000;
const MIN_REVIEW_MS = 30 * 60 * 1000;

export class RecoveryConflictError extends Error {
  constructor() {
    super("복구 중 잠금이 변경되었습니다. 다시 점검해 주세요.");
  }
}

function lockRef(db, eventId, staffId) {
  return db.collection(trainingLockCollection()).doc(signatureKey(eventId, staffId));
}

function matchingPending(data, requestId, eventIds, staffId) {
  return data?.state === "pending" && data?.requestId === requestId && data?.staffId === staffId &&
    JSON.stringify(data?.eventIds) === JSON.stringify(eventIds);
}

function isStale(data, now) {
  const created = Date.parse(data?.createdAt);
  const updated = Date.parse(data?.updatedAt);
  return Number.isFinite(created) && Number.isFinite(updated) && now - created >= MIN_STALE_MS &&
    now - updated >= MIN_STALE_MS && Number(data?.leaseUntil) <= now;
}

export async function listAttendanceRecoveryCandidates({ db, now = Date.now() }) {
  const snapshot = await db.collection(trainingLockCollection()).where("state", "==", "pending").limit(501).get();
  const seen = new Set();
  const items = [];
  for (const doc of snapshot.docs.slice(0, 500)) {
    const data = doc.data();
    const key = JSON.stringify([data.requestId, data.staffId]);
    if (!isStale(data, now) || !data.eventId || !data.staffId || seen.has(key)) continue;
    seen.add(key);
    items.push({ eventId: data.eventId, staffId: data.staffId, eventCount: data.eventIds?.length || 1,
      updatedAt: data.updatedAt });
  }
  return { items, truncated: snapshot.docs.length > 500 };
}

async function findOrphanFiles(store, data) {
  const requestIds = [...new Set([data.requestId, ...(data.orphanAttempts || []).map((attempt) => attempt.requestId)].filter(Boolean))];
  const createdAt = Date.parse(data.createdAt);
  const year = Number.isFinite(createdAt) ? signatureStorageYear(createdAt) : "";
  const filesByRequest = await Promise.all(requestIds.map(async (requestId) => ({ requestId,
    files: year ? await store.listSignatureFilesByRequest(requestId, { year }) : [] })));
  return filesByRequest.flatMap(({ requestId, files }) => files.map((file) => ({ fileId: file.id, private: file.private !== false, requestId })));
}

export async function inspectAttendanceRecovery({ db, store, eventId, staffId, now = Date.now() }) {
  if (!eventId || !staffId) throw new RangeError("복구 대상 교육과 교직원ID가 필요합니다.");
  const anchor = await lockRef(db, eventId, staffId).get();
  if (!anchor.exists) return { status: "not-pending", recoverable: false, eventIds: [] };
  const data = anchor.data();
  if (data.state !== "pending") {
    if (!(data.state === "failed" && data.requestId || data.orphanAttempts?.length)) return { status: "not-pending", recoverable: false, eventIds: [] };
    const orphanFiles = await findOrphanFiles(store, data);
    return { status: "orphan-candidate", recoverable: false, eventIds: data.eventIds || [], orphanFiles };
  }
  const eventIds = data.eventIds;
  if (!Array.isArray(eventIds) || !eventIds.includes(eventId) || eventIds.length < 1 || new Set(eventIds).size !== eventIds.length ||
    typeof data.requestId !== "string" || !isStale(data, now)) {
    return { status: "not-stale", recoverable: false, eventIds: Array.isArray(eventIds) ? eventIds : [] };
  }
  const refs = eventIds.map((id) => lockRef(db, id, staffId));
  const snapshots = await Promise.all(refs.map((ref) => ref.get()));
  if (snapshots.some((snapshot) => !snapshot.exists || !matchingPending(snapshot.data(), data.requestId, eventIds, staffId) || !isStale(snapshot.data(), now))) {
    return { status: "manual-review-required", recoverable: false, eventIds };
  }
  const source = await store.readSource();
  const signatures = sheetRows(source.signatures, SIGNATURE_HEADERS).filter((row) => row["교직원ID"] === staffId && activeSignature(row));
  const matches = eventIds.map((id) => signatures.filter((row) => row.eventId === id));
  const orphanFiles = await findOrphanFiles(store, data);
  const currentOrphanFileIds = orphanFiles.filter((file) => file.requestId === data.requestId).map((file) => file.fileId);
  const counts = matches.map((rows) => rows.length);
  const status = orphanFiles.some((file) => !file.private) ? "manual-review-required" :
    counts.every((count) => count === 0) ? snapshots.some((snapshot) => snapshot.data().appendStartedAt) ? "manual-review-required" : "retryable" :
    counts.every((count) => count === 1) ? "completed" : "manual-review-required";
  const canReviewedRetry = status === "manual-review-required" && counts.every((count) => count === 0) &&
    orphanFiles.every((file) => file.private) && snapshots.every((snapshot) => snapshot.data().appendStartedAt &&
      now - Date.parse(snapshot.data().updatedAt) >= MIN_REVIEW_MS);
  return { status, recoverable: status !== "manual-review-required", eventIds, requestId: data.requestId,
    refs, signatureIdsByEvent: matches.map((rows) => rows.map((row) => row.signatureId)), orphanFiles, currentOrphanFileIds, canReviewedRetry,
    lockUpdatedAt: snapshots.map((snapshot) => snapshot.data().updatedAt),
    lockAppendStartedAt: snapshots.map((snapshot) => snapshot.data().appendStartedAt || "") };
}

export async function applyAttendanceRecovery({ db, store, eventId, staffId, actor, now = Date.now(), confirmedNoInflight = false, reason = "" }) {
  const plan = await inspectAttendanceRecovery({ db, store, eventId, staffId, now });
  const reviewedRetry = plan.canReviewedRetry && confirmedNoInflight && typeof reason === "string" && reason.trim().length >= 3 && reason.trim().length <= 200;
  if (!plan.recoverable && !reviewedRetry) return plan;
  await db.runTransaction(async (transaction) => {
    const snapshots = [];
    for (const ref of plan.refs) snapshots.push(await transaction.get(ref));
    if (snapshots.some((snapshot, index) => !snapshot.exists ||
      !matchingPending(snapshot.data(), plan.requestId, plan.eventIds, staffId) ||
      snapshot.data().updatedAt !== plan.lockUpdatedAt[index] ||
      (snapshot.data().appendStartedAt || "") !== plan.lockAppendStartedAt[index] || !isStale(snapshot.data(), now))) {
      throw new RecoveryConflictError();
    }
    plan.refs.forEach((ref, index) => transaction.set(ref, {
      state: plan.status === "completed" ? "completed" : "failed", leaseUntil: 0,
      signatureIds: plan.status === "completed" ? plan.signatureIdsByEvent[index] : [],
      orphanFileIds: plan.status === "completed" ? [] : plan.currentOrphanFileIds,
      recoveredBy: actor, recoveredAt: new Date(now).toISOString(), recoveredReason: reviewedRetry ? reason.trim() : "",
      updatedAt: new Date(now).toISOString(),
    }, { merge: true }));
  });
  return reviewedRetry ? { ...plan, status: "retryable", recoverable: true, reviewedRelease: true } : plan;
}
