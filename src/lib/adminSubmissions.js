import { mergeCprProjection } from "../../common/cprProjection.js";
import { clientFirestoreResource } from "./firestoreResources.js";
import { collection, getCountFromServer, getDoc, getDocs, limit, orderBy, startAfter, documentId, runTransaction, query, serverTimestamp, updateDoc, doc, where, writeBatch } from "firebase/firestore";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { db } from "./firebase.js";
import {
  INFECTION_LEGACY_STATUS_OPTIONS,
  INFECTION_CASE_STATUS,
  LEGACY_INFECTION_STATUS,
  getInfectionCaseStatus,
  getInfectionStatusLabels,
  getInfectionLegacyStatus,
  getInfectionStatusUpdate,
  getInfectionSubmissionStatus,
} from "./infectionStatus.js";
import { INDIVIDUAL_HEALTH_CHECKUP_TITLE } from "../data/individualHealthCheckupSubmission.js";
import { normalizeSubmissionEvidenceFiles } from "../../common/submissionEvidenceFiles.js";
export { INFECTION_STATUS_LABELS } from "./infectionStatus.js";

const STUDENT_HEALTH_COLLECTION = "student_health_submissions";
const LIST_LIMIT = 50;

export const STAFF_STATUS_LABELS = {
  submitted: "처리 대기",
  reviewing: "확인 중",
  completed: "처리 완료",
  rejected: "보완 필요",
};

export const STAFF_STATUS_OPTIONS = ["submitted", "reviewing", "completed", "rejected"];
export const INFECTION_STATUS_OPTIONS = INFECTION_LEGACY_STATUS_OPTIONS;

export const STAFF_TYPE_LABELS = {
  cpr: "심폐소생술 이수증",
  tb: INDIVIDUAL_HEALTH_CHECKUP_TITLE,
  recruit: "채용검진 확인 요청",
};

function getTimestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  return 0;
}

export function formatSubmissionDateTime(value) {
  const millis = getTimestampMillis(value);
  if (!millis) return "일시 없음";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(millis))
    .replace(/\. /g, "-")
    .replace(".", "");
}

function normalizeStaffSubmission(documentSnapshot) {
  const data = documentSnapshot.data();
  const submittedAtMillis = getTimestampMillis(data.submittedAt);
  const itemId = data.itemId || "unknown";

  return {
    ...data,
    id: documentSnapshot.id,
    itemId,
    typeLabel: STAFF_TYPE_LABELS[itemId] || "교직원 제출",
    status: data.status || "submitted",
    statusLabel: STAFF_STATUS_LABELS[data.status] || data.status || STAFF_STATUS_LABELS.submitted,
    submittedAtMillis,
    submittedAtLabel: formatSubmissionDateTime(data.submittedAt),
    evidenceFiles: normalizeSubmissionEvidenceFiles(data),
  };
}

function normalizeInfectionReport(documentSnapshot) {
  const data = documentSnapshot.data();
  const submittedAtMillis = getTimestampMillis(data.submittedAt);
  const status = getInfectionLegacyStatus(data);
  const submissionStatus = getInfectionSubmissionStatus(data);
  const caseStatus = getInfectionCaseStatus(data);
  const statusLabels = getInfectionStatusLabels(data);

  return {
    ...data,
    id: documentSnapshot.id,
    status,
    submissionStatus,
    caseStatus,
    statusLabel: statusLabels.statusLabel,
    submissionStatusLabel: statusLabels.submissionStatusLabel,
    caseStatusLabel: statusLabels.caseStatusLabel,
    submittedAtMillis,
    submittedAtLabel: formatSubmissionDateTime(data.submittedAt),
  };
}

function filterByStatus(items, status) {
  return status ? items.filter((item) => item.status === status) : items;
}

export async function getStaffSubmissionPage({ status = "", cursor = null, submissionId = "" } = {}) {
  const ref = collection(db, clientFirestoreResource(db, "submissions"));
  if (submissionId) {
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(submissionId)) throw new Error("접수번호를 확인해 주세요.");
    const snapshot = await getDoc(doc(ref, submissionId));
    return { items: snapshot.exists() ? [normalizeStaffSubmission(snapshot)] : [], nextCursor: null, total: snapshot.exists() ? 1 : 0, direct: true };
  }
  if (status && !STAFF_STATUS_OPTIONS.includes(status)) throw new Error("지원하지 않는 제출 상태입니다.");
  const conditions = status ? [where("status", "==", status)] : [];
  const [snapshot, count] = await Promise.all([
    getDocs(query(ref, ...conditions, orderBy("submittedAt", "desc"), orderBy(documentId(), "desc"), ...(cursor ? [startAfter(cursor)] : []), limit(LIST_LIMIT + 1))),
    getCountFromServer(query(ref, ...conditions)),
  ]);
  const docs = snapshot.docs.slice(0, LIST_LIMIT);
  return { items: docs.map(normalizeStaffSubmission), nextCursor: snapshot.docs.length > LIST_LIMIT ? docs.at(-1) : null, total: count.data().count };
}
export async function getStaffSubmissions(options = {}) { return (await getStaffSubmissionPage(options)).items; }

export async function getInfectionReports({ status = "" } = {}) {
  const snapshot = await getDocs(
    query(
      collection(db, STUDENT_HEALTH_COLLECTION),
      where("type", "==", "infection"),
      where("schoolYear", "==", CURRENT_SCHOOL_YEAR),
      where("semester", "==", CURRENT_SEMESTER),
      limit(LIST_LIMIT)
    )
  );

  const reports = snapshot.docs
    .map(normalizeInfectionReport)
    .filter((report) => {
      return (
        report.type === "infection" &&
        Number(report.schoolYear) === CURRENT_SCHOOL_YEAR &&
        Number(report.semester) === CURRENT_SEMESTER
      );
    });

  return filterByStatus(reports, status).sort((left, right) => right.submittedAtMillis - left.submittedAtMillis);
}

export async function updateStaffSubmissionStatus(submission, status) {
  if (!STAFF_STATUS_OPTIONS.includes(status)) throw new Error("지원하지 않는 제출 상태입니다.");

  const submissionId = typeof submission === "string" ? submission : submission?.id;
  if (!submissionId) throw new Error("제출 기록을 확인할 수 없습니다.");
  const statusTaskId = submission?.itemId === "tb" ? "tb-screening-2026" : submission?.itemId === "cpr" ? "cpr-training-2026" : "";
  if (typeof submission === "string" || !statusTaskId || !submission?.staffId) {
    await updateDoc(doc(db, clientFirestoreResource(db, "submissions"), submissionId), {
      status,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const mappedStatus = status === "completed" ? "completed" : status === "rejected" ? "incomplete" : "pending";
  if (submission.itemId === "cpr") {
    const submissionRef = doc(db, clientFirestoreResource(db, "submissions"), submissionId);
    const statusRef = doc(db, clientFirestoreResource(db, "statuses"), `${submission.staffId}_${statusTaskId}`);
    const completed = await getDocs(query(collection(db, clientFirestoreResource(db, "submissions")), where("staffId", "==", submission.staffId), where("itemId", "==", "cpr"), where("status", "==", "completed"), orderBy("submittedAt", "desc"), orderBy(documentId(), "desc"), limit(2)));
    const otherRef = completed.docs.find((item) => item.id !== submissionId)?.ref;
    await runTransaction(db, async (transaction) => {
      const [original, previous] = await Promise.all([transaction.get(submissionRef), transaction.get(statusRef)]);
      const other = otherRef ? await transaction.get(otherRef) : null;
      if (!original.exists() || original.data().status !== submission.status || original.data().staffId !== submission.staffId || original.data().itemId !== "cpr") throw new Error("접수 자료가 변경되었습니다.");
      const current = previous.exists() ? previous.data() : {};
      let incoming = { staffId: submission.staffId, taskId: statusTaskId, status: mappedStatus,
        evidenceSubmissionId: submissionId, sourceType: "portal_certificate_review",
        training: { completionMethod: "individual", completionDate: status === "completed" ? original.data().trainingDate || "" : "",
          eventId: "", evidenceStatus: status, note: status === "completed" ? "외부·개별 이수 확인" : "이수증 확인 중" } };
      if (status !== "completed" && other?.exists() && other.data().status === "completed" && other.data().staffId === submission.staffId && other.data().itemId === "cpr") {
        incoming = { ...incoming, status: "completed", evidenceSubmissionId: other.id,
          training: { completionMethod: "individual", completionDate: other.data().trainingDate || "", eventId: "", evidenceStatus: "completed", note: "다른 유효한 개별 이수 확인" } };
      }
      const next = mergeCprProjection(current, incoming);
      transaction.update(submissionRef, { status, updatedAt: serverTimestamp() });
      transaction.set(statusRef, { ...next, cprProjectionRevision: (current.cprProjectionRevision || 0) + 1, syncedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    });
    return;
  }
  const batch = writeBatch(db);
  batch.update(doc(db, clientFirestoreResource(db, "submissions"), submissionId), {
    status,
    updatedAt: serverTimestamp(),
  });
  const statusPayload = submission.itemId === "tb" ? {
    staffId: submission.staffId,
    taskId: statusTaskId,
    status: mappedStatus,
    sourceType: "portal_certificate_review",
    screening: { completed: status === "completed", registrationStatus: status },
  } : {
    staffId: submission.staffId,
    taskId: statusTaskId,
    status: mappedStatus,
    sourceType: "portal_certificate_review",
    training: {
      completionMethod: "individual",
      completionDate: status === "completed" ? submission.trainingDate || "" : "",
      eventId: "",
      evidenceStatus: status,
      note: status === "completed" ? "외부·개별 이수 확인" : status === "rejected" ? "이수증 보완 필요" : "이수증 확인 중",
    },
  };
  batch.set(doc(db, clientFirestoreResource(db, "statuses"), `${submission.staffId}_${statusTaskId}`), {
    ...statusPayload,
    syncedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await batch.commit();
}

export async function updateInfectionReportStatus(submissionId, status) {
  const submissionRef = doc(db, STUDENT_HEALTH_COLLECTION, submissionId);
  const snapshot = await getDoc(submissionRef);
  const updatePayload = getInfectionStatusUpdate(status);

  if (snapshot.exists() && status === LEGACY_INFECTION_STATUS.reviewing) {
    const currentCaseStatus = getInfectionCaseStatus(snapshot.data());
    if (
      currentCaseStatus === INFECTION_CASE_STATUS.managing ||
      currentCaseStatus === INFECTION_CASE_STATUS.returnCheckNeeded
    ) {
      updatePayload["report.caseStatus"] = currentCaseStatus;
    }
  }

  await updateDoc(submissionRef, {
    ...updatePayload,
    updatedAt: serverTimestamp(),
  });
}
