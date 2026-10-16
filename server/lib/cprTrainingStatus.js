import { isDeepStrictEqual } from "node:util";
import { mergeCprProjection, isCprEvent } from "../../common/cprProjection.js";
import { serverFirestoreResource } from "./firestoreResources.js";
export const CPR_TRAINING_TASK_ID = "cpr-training-2026";


function text(value) {
  return String(value || "").normalize("NFKC").trim();
}

export function isCprTrainingEvent(event) {
  return isCprEvent(event);
}

export function buildCprExternalSubmissionStatus({ staffId, trainingDate = "", submissionStatus = "submitted" }) {
  const completed = submissionStatus === "completed";
  return {
    staffId: text(staffId),
    taskId: CPR_TRAINING_TASK_ID,
    status: completed ? "completed" : submissionStatus === "rejected" ? "incomplete" : "pending",
    sourceType: "portal_certificate_review",
    training: {
      completionMethod: "individual",
      completionDate: completed ? text(trainingDate) : "",
      eventId: "",
      evidenceStatus: text(submissionStatus),
      note: completed ? "외부·개별 이수 확인" : "이수증 확인 중",
    },
  };
}

export function buildCprGroupTrainingStatus({ staffId, event }) {
  if (!text(staffId) || !event?.eventId || !isCprTrainingEvent(event)) throw new RangeError("CPR 교육 상태 정보를 확인해 주세요.");
  return {
    staffId: text(staffId),
    taskId: CPR_TRAINING_TASK_ID,
    status: "completed",
    sourceType: "training_center",
    evidenceSubmissionId: "",
    training: {
      completionMethod: "group",
      completionDate: text(event["일자"] || event.date),
      eventId: text(event.eventId),
      evidenceStatus: "completed",
      note: "학교 단체교육 출석 확인",
    },
  };
}

export async function saveCprTrainingStatus({ db, payload, collectionName, context = process.env, replaceGroup = false, expectedProjection, originals = [], verifySource }) {
  if (!db || !payload?.staffId || payload.taskId !== CPR_TRAINING_TASK_ID) throw new RangeError("CPR 교육 상태 정보를 확인해 주세요.");
  const now = new Date();
  const ref = db.collection(serverFirestoreResource(db, "statuses", context, collectionName)).doc(`${payload.staffId}_${CPR_TRAINING_TASK_ID}`);
  await db.runTransaction(async (transaction) => {
    const previous = await transaction.get(ref);
    const current = previous.exists ? previous.data() : {};
    if (expectedProjection !== undefined && !isDeepStrictEqual(current, expectedProjection)) throw new Error("CPR 현황이 변경되었습니다. 다시 계산해 주세요.");
    for (const original of originals) {
      const checked = await transaction.get(original.ref);
      if (!checked.exists || !isDeepStrictEqual(checked.data(), original.data())) throw new Error("CPR 원본이 변경되었습니다. 다시 계산해 주세요.");
    }
    if (verifySource) await verifySource(transaction);
    const next = mergeCprProjection(current, payload, { replaceGroup });
    if (next === current) return;
    transaction.set(ref, { ...next, cprProjectionRevision: (current.cprProjectionRevision || 0) + 1, syncedAt: now, updatedAt: now }, { merge: true });
  });
}

export async function saveCompletedCprGroupTraining({ db, staffId, events, context = process.env, verifySource }) {
  const cprEvents = (events || []).filter(isCprTrainingEvent);
  if (!cprEvents.length) return false;
  if (cprEvents.length > 1) throw new RangeError("묶음 교육에 CPR 교육이 중복되어 있습니다.");
  await saveCprTrainingStatus({ db, context, payload: buildCprGroupTrainingStatus({ staffId, event: cprEvents[0] }), verifySource });
  return true;
}

export async function reconcileCprTrainingStatus({ db, staffId, source, context = process.env, expectedProjection, verifySource }) {
  const activeGroup = (source?.signatures || []).find((signature) => {
    const event = source.trainings.find((item) => item.eventId === signature.eventId);
    return signature["교직원ID"] === staffId && signature["상태"] === "완료" &&
      !["TRUE", "Y", "1", "예"].includes(text(signature["취소여부"]).toUpperCase()) && isCprTrainingEvent(event);
  });
  if (activeGroup) {
    const event = source.trainings.find((item) => item.eventId === activeGroup.eventId);
    await saveCprTrainingStatus({ db, context, payload: buildCprGroupTrainingStatus({ staffId, event }), expectedProjection, verifySource });
    return "group";
  }
  const snapshot = await db.collection(serverFirestoreResource(db, "submissions", context)).where("staffId", "==", staffId).get();
  const candidates = snapshot.docs.map((doc) => ({ ...doc.data(), evidenceSubmissionId: doc.id })).filter((item) => item.itemId === "cpr");
  const individual = candidates.filter((item) => item.status === "completed").sort((a,b) => String(b.trainingDate || "").localeCompare(String(a.trainingDate || "")))[0] || candidates
    .sort((left, right) => Number(right.updatedAt?.toMillis?.() || 0) - Number(left.updatedAt?.toMillis?.() || 0))[0];
  const payload = individual
    ? { ...buildCprExternalSubmissionStatus({ staffId, trainingDate: individual.trainingDate, submissionStatus: individual.status }), evidenceSubmissionId: individual.evidenceSubmissionId }
    : { staffId, taskId: CPR_TRAINING_TASK_ID, status: "incomplete", evidenceSubmissionId: "", sourceType: "training_center", training: {
      completionMethod: "none", completionDate: "", eventId: "", evidenceStatus: "", note: "이수 기록 없음",
    } };
  await saveCprTrainingStatus({ db, context, payload, replaceGroup: true, expectedProjection, originals: snapshot.docs.filter((doc) => doc.ref), verifySource });
  return individual ? "individual" : "none";
}

export async function readCprProjection(db, staffId, context = process.env) {
  const ref = db.collection(serverFirestoreResource(db, "statuses", context)).doc(`${staffId}_${CPR_TRAINING_TASK_ID}`);
  const snapshot = await ref.get();
  return snapshot.exists ? snapshot.data() : {};
}
