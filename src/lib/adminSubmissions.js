import { collection, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { db } from "./firebase.js";

const STAFF_COLLECTION = "staff_submissions";
const STUDENT_HEALTH_COLLECTION = "student_health_submissions";
const LIST_LIMIT = 50;

export const STAFF_STATUS_LABELS = {
  submitted: "처리 대기",
  reviewing: "확인 중",
  completed: "처리 완료",
  rejected: "보완 필요",
};

export const INFECTION_STATUS_LABELS = {
  submitted: "처리 대기",
  reviewing: "확인 중",
  completed: "처리 완료",
};

export const STAFF_STATUS_OPTIONS = ["submitted", "reviewing", "completed", "rejected"];
export const INFECTION_STATUS_OPTIONS = ["submitted", "reviewing", "completed"];

export const STAFF_TYPE_LABELS = {
  cpr: "심폐소생술 이수증",
  tb: "결핵검진 확인증",
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
    id: documentSnapshot.id,
    ...data,
    itemId,
    typeLabel: STAFF_TYPE_LABELS[itemId] || "교직원 제출",
    status: data.status || "submitted",
    statusLabel: STAFF_STATUS_LABELS[data.status] || data.status || STAFF_STATUS_LABELS.submitted,
    submittedAtMillis,
    submittedAtLabel: formatSubmissionDateTime(data.submittedAt),
  };
}

function normalizeInfectionReport(documentSnapshot) {
  const data = documentSnapshot.data();
  const submittedAtMillis = getTimestampMillis(data.submittedAt);
  const status = data.report?.status || "submitted";

  return {
    id: documentSnapshot.id,
    ...data,
    status,
    statusLabel: INFECTION_STATUS_LABELS[status] || status,
    submittedAtMillis,
    submittedAtLabel: formatSubmissionDateTime(data.submittedAt),
  };
}

function filterByStatus(items, status) {
  return status ? items.filter((item) => item.status === status) : items;
}

export async function getStaffSubmissions({ status = "" } = {}) {
  const snapshot = await getDocs(
    query(collection(db, STAFF_COLLECTION), orderBy("submittedAt", "desc"), limit(LIST_LIMIT))
  );

  return filterByStatus(snapshot.docs.map(normalizeStaffSubmission), status);
}

export async function getInfectionReports({ status = "" } = {}) {
  const snapshot = await getDocs(
    query(collection(db, STUDENT_HEALTH_COLLECTION), orderBy("submittedAt", "desc"), limit(LIST_LIMIT))
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

  return filterByStatus(reports, status);
}

export async function updateStaffSubmissionStatus(submissionId, status) {
  if (!STAFF_STATUS_OPTIONS.includes(status)) throw new Error("지원하지 않는 제출 상태입니다.");

  await updateDoc(doc(db, STAFF_COLLECTION, submissionId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function updateInfectionReportStatus(submissionId, status) {
  if (!INFECTION_STATUS_OPTIONS.includes(status)) throw new Error("지원하지 않는 감염병 보고 상태입니다.");

  await updateDoc(doc(db, STUDENT_HEALTH_COLLECTION, submissionId), {
    "report.status": status,
    updatedAt: serverTimestamp(),
  });
}
