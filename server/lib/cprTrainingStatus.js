export const CPR_TRAINING_TASK_ID = "cpr-training-2026";

const CPR_TITLE_PATTERN = /(?:심폐소생술|\bCPR\b)/i;

function text(value) {
  return String(value || "").normalize("NFKC").trim();
}

export function isCprTrainingEvent(event) {
  return CPR_TITLE_PATTERN.test(text(event?.["교육명"] || event?.title));
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
    training: {
      completionMethod: "group",
      completionDate: text(event["일자"] || event.date),
      eventId: text(event.eventId),
      evidenceStatus: "completed",
      note: "학교 단체교육 출석 확인",
    },
  };
}

export async function saveCprTrainingStatus({ db, payload }) {
  if (!db || !payload?.staffId || payload.taskId !== CPR_TRAINING_TASK_ID) throw new RangeError("CPR 교육 상태 정보를 확인해 주세요.");
  const now = new Date();
  await db.collection("staff_submission_status").doc(`${payload.staffId}_${CPR_TRAINING_TASK_ID}`).set({
    ...payload,
    syncedAt: now,
    updatedAt: now,
  }, { merge: true });
}

export async function saveCompletedCprGroupTraining({ db, staffId, events }) {
  const cprEvents = (events || []).filter(isCprTrainingEvent);
  if (!cprEvents.length) return false;
  if (cprEvents.length > 1) throw new RangeError("묶음 교육에 CPR 교육이 중복되어 있습니다.");
  await saveCprTrainingStatus({ db, payload: buildCprGroupTrainingStatus({ staffId, event: cprEvents[0] }) });
  return true;
}

export async function reconcileCprTrainingStatus({ db, staffId, source }) {
  const activeGroup = (source?.signatures || []).find((signature) => {
    const event = source.trainings.find((item) => item.eventId === signature.eventId);
    return signature["교직원ID"] === staffId && signature["상태"] === "완료" &&
      !["TRUE", "Y", "1", "예"].includes(text(signature["취소여부"]).toUpperCase()) && isCprTrainingEvent(event);
  });
  if (activeGroup) {
    const event = source.trainings.find((item) => item.eventId === activeGroup.eventId);
    await saveCompletedCprGroupTraining({ db, staffId, events: [event] });
    return "group";
  }
  const snapshot = await db.collection("staff_submissions").where("staffId", "==", staffId).get();
  const individual = snapshot.docs.map((doc) => doc.data()).filter((item) => item.itemId === "cpr")
    .sort((left, right) => Number(right.updatedAt?.toMillis?.() || 0) - Number(left.updatedAt?.toMillis?.() || 0))[0];
  const payload = individual
    ? buildCprExternalSubmissionStatus({ staffId, trainingDate: individual.trainingDate, submissionStatus: individual.status })
    : { staffId, taskId: CPR_TRAINING_TASK_ID, status: "incomplete", sourceType: "training_center", training: {
      completionMethod: "none", completionDate: "", eventId: "", evidenceStatus: "", note: "이수 기록 없음",
    } };
  await saveCprTrainingStatus({ db, payload });
  return individual ? "individual" : "none";
}
