import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { db } from "./firebase.js";
import {
  INFECTION_CASE_STATUS,
  INFECTION_CASE_STATUS_OPTIONS,
  INFECTION_SUBMISSION_STATUS,
  getInfectionCaseStatus,
  getInfectionCaseStatusUpdate,
  getInfectionStatusLabels,
  getInfectionSubmissionStatus,
} from "./infectionStatus.js";

const STUDENT_HEALTH_COLLECTION = "student_health_submissions";

const CASE_STATUS_PRIORITY = {
  [INFECTION_CASE_STATUS.returnCheckNeeded]: 0,
  [INFECTION_CASE_STATUS.new]: 1,
  [INFECTION_CASE_STATUS.checking]: 2,
  [INFECTION_CASE_STATUS.managing]: 3,
  [INFECTION_CASE_STATUS.closed]: 4,
};

function getTimestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  return 0;
}

function formatDateTime(value) {
  const millis = getTimestampMillis(value);
  if (!millis) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(millis))
    .replace(". ", ".")
    .replace(".", "");
}

function getKstDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isCurrentTermInfection(data) {
  return (
    data?.type === "infection" &&
    Number(data.schoolYear) === CURRENT_SCHOOL_YEAR &&
    Number(data.semester) === CURRENT_SEMESTER
  );
}

function normalizeInfectionCase(documentSnapshot) {
  const data = documentSnapshot.data();
  const submissionStatus = getInfectionSubmissionStatus(data);
  const caseStatus = getInfectionCaseStatus(data);
  const labels = getInfectionStatusLabels(data);

  return {
    id: documentSnapshot.id,
    ...data,
    submissionStatus,
    caseStatus,
    submissionStatusLabel: labels.submissionStatusLabel,
    caseStatusLabel: labels.caseStatusLabel,
    submittedAtMillis: getTimestampMillis(data.submittedAt),
    submittedAtLabel: formatDateTime(data.submittedAt),
  };
}

function compareInfectionCases(left, right) {
  const priorityDelta = CASE_STATUS_PRIORITY[left.caseStatus] - CASE_STATUS_PRIORITY[right.caseStatus];
  if (priorityDelta !== 0) return priorityDelta;
  return right.submittedAtMillis - left.submittedAtMillis;
}

export function getCaseStatusSummary(cases) {
  return INFECTION_CASE_STATUS_OPTIONS.map((status) => ({
    status,
    label: getInfectionStatusLabels({ report: { caseStatus: status, status: "submitted" } }).caseStatusLabel,
    count: cases.filter((item) => item.caseStatus === status).length,
  }));
}

export function getRecommendedCaseStatus(infectionCase, today = new Date()) {
  if (infectionCase.caseStatus === INFECTION_CASE_STATUS.closed) return "";

  const exclusionEndDate = infectionCase.infection?.exclusionEndDate;
  if (!exclusionEndDate) return "";

  return exclusionEndDate < getKstDateKey(today) ? INFECTION_CASE_STATUS.returnCheckNeeded : "";
}

export async function getInfectionCases({ includeClosed = false } = {}) {
  const snapshot = await getDocs(
    query(
      collection(db, STUDENT_HEALTH_COLLECTION),
      where("type", "==", "infection"),
      where("schoolYear", "==", CURRENT_SCHOOL_YEAR),
      where("semester", "==", CURRENT_SEMESTER)
    )
  );

  return snapshot.docs
    .map(normalizeInfectionCase)
    .filter((item) => isCurrentTermInfection(item))
    .filter((item) => includeClosed || item.caseStatus !== INFECTION_CASE_STATUS.closed)
    .sort(compareInfectionCases);
}

export async function updateInfectionCaseStatus({ caseId, caseStatus, reviewerUid }) {
  await updateDoc(doc(db, STUDENT_HEALTH_COLLECTION, caseId), {
    ...getInfectionCaseStatusUpdate(caseStatus),
    "report.caseUpdatedAt": serverTimestamp(),
    "report.caseUpdatedBy": reviewerUid,
    updatedAt: serverTimestamp(),
  });
}

export async function markInfectionSubmissionReviewed({ caseId, reviewerUid }) {
  await updateDoc(doc(db, STUDENT_HEALTH_COLLECTION, caseId), {
    "report.submissionStatus": INFECTION_SUBMISSION_STATUS.reviewed,
    "report.reviewedAt": serverTimestamp(),
    "report.reviewedBy": reviewerUid,
    updatedAt: serverTimestamp(),
  });
}
