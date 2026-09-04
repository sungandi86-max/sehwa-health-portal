import {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { db } from "./firebase.js";
import {
  INFECTION_CASE_STATUS,
  INFECTION_SUBMISSION_STATUS,
  getInfectionCaseStatus,
  getInfectionSubmissionStatus,
} from "./infectionStatus.js";

const STAFF_SUBMISSIONS = "staff_submissions";
const STUDENT_HEALTH_SUBMISSIONS = "student_health_submissions";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_LIMIT = 5;

const STAFF_SUBMISSION_LABELS = {
  cpr: "심폐소생술 이수증",
  tb: "결핵검진 확인증",
  recruit: "채용검진 확인 요청",
};

const STATUS_LABELS = {
  submitted: "접수됨",
  reviewing: "확인 중",
  completed: "처리 완료",
  rejected: "반려",
};

export function getKstTodayRange(now = new Date()) {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const startUtcMs =
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - KST_OFFSET_MS;

  return {
    startAt: Timestamp.fromMillis(startUtcMs),
    endAt: Timestamp.fromMillis(startUtcMs + DAY_MS),
  };
}

function getTimestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  return 0;
}

export function formatKstDateTime(value) {
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

async function countServerQuery(targetQuery) {
  const snapshot = await getCountFromServer(targetQuery);
  return snapshot.data().count;
}

function countMatchingDocs(snapshot, predicate) {
  return snapshot.docs.reduce((count, documentSnapshot) => {
    return predicate(documentSnapshot.data()) ? count + 1 : count;
  }, 0);
}

function isCurrentTermInfection(data) {
  return (
    data?.type === "infection" &&
    Number(data.schoolYear) === CURRENT_SCHOOL_YEAR &&
    Number(data.semester) === CURRENT_SEMESTER
  );
}

function normalizeStaffSubmission(documentSnapshot) {
  const data = documentSnapshot.data();
  const typeLabel = STAFF_SUBMISSION_LABELS[data.itemId] || "교직원 제출";
  const submittedAtMillis = getTimestampMillis(data.submittedAt);

  return {
    id: documentSnapshot.id,
    source: "staff",
    typeLabel,
    title: typeLabel,
    detail: `${data.submitter?.displayName || data.submitter?.email || "제출자"} · ${typeLabel}`,
    status: data.status || "submitted",
    statusLabel: STATUS_LABELS[data.status] || data.status || "접수됨",
    submittedAt: data.submittedAt || null,
    submittedAtMillis,
    submittedAtLabel: formatKstDateTime(data.submittedAt),
  };
}

function normalizeInfectionSubmission(documentSnapshot) {
  const data = documentSnapshot.data();
  const submittedAtMillis = getTimestampMillis(data.submittedAt);

  return {
    id: documentSnapshot.id,
    source: "student-health",
    typeLabel: "감염병 발생 보고",
    title: "감염병 발생 보고",
    detail: "감염병 발생 보고 · 전용 사례관리 화면에서 확인",
    status: data.report?.status || "submitted",
    statusLabel: STATUS_LABELS[data.report?.status] || data.report?.status || "접수됨",
    submittedAt: data.submittedAt || null,
    submittedAtMillis,
    submittedAtLabel: formatKstDateTime(data.submittedAt),
  };
}

export function getInfectionDashboardCounts(documents = []) {
  return documents.reduce(
    (counts, documentData) => {
      if (!isCurrentTermInfection(documentData)) return counts;

      const submissionStatus = getInfectionSubmissionStatus(documentData);
      const caseStatus = getInfectionCaseStatus(documentData);

      if (
        submissionStatus === INFECTION_SUBMISSION_STATUS.submitted &&
        caseStatus === INFECTION_CASE_STATUS.new
      ) {
        counts.newReports += 1;
      } else if (
        submissionStatus === INFECTION_SUBMISSION_STATUS.reviewed &&
        (caseStatus === INFECTION_CASE_STATUS.checking ||
          caseStatus === INFECTION_CASE_STATUS.managing)
      ) {
        counts.activeCases += 1;
      }

      if (caseStatus === INFECTION_CASE_STATUS.returnCheckNeeded) {
        counts.returnCheckNeeded += 1;
      }

      return counts;
    },
    {
      newReports: 0,
      activeCases: 0,
      returnCheckNeeded: 0,
    }
  );
}

export async function getRecentSubmissions() {
  const staffRecentQuery = query(
    collection(db, STAFF_SUBMISSIONS),
    orderBy("submittedAt", "desc"),
    limit(RECENT_LIMIT)
  );
  const studentRecentQuery = query(
    collection(db, STUDENT_HEALTH_SUBMISSIONS),
    orderBy("submittedAt", "desc"),
    limit(RECENT_LIMIT)
  );

  const [staffSnapshot, studentSnapshot] = await Promise.all([
    getDocs(staffRecentQuery),
    getDocs(studentRecentQuery),
  ]);

  const staffItems = staffSnapshot.docs.map(normalizeStaffSubmission);
  const infectionItems = studentSnapshot.docs
    .filter((documentSnapshot) => isCurrentTermInfection(documentSnapshot.data()))
    .map(normalizeInfectionSubmission);

  return [...staffItems, ...infectionItems]
    .sort((left, right) => right.submittedAtMillis - left.submittedAtMillis)
    .slice(0, RECENT_LIMIT);
}

export async function getDashboardSummary(now = new Date()) {
  const { startAt, endAt } = getKstTodayRange(now);
  const sevenDaysAgo = Timestamp.fromMillis(now.getTime() - 7 * DAY_MS);

  const staffTodayQuery = query(
    collection(db, STAFF_SUBMISSIONS),
    where("submittedAt", ">=", startAt),
    where("submittedAt", "<", endAt)
  );
  const infectionTodayQuery = query(
    collection(db, STUDENT_HEALTH_SUBMISSIONS),
    where("submittedAt", ">=", startAt),
    where("submittedAt", "<", endAt)
  );
  const pendingStaffQuery = query(collection(db, STAFF_SUBMISSIONS), where("status", "==", "submitted"));
  const currentTermInfectionQuery = query(
    collection(db, STUDENT_HEALTH_SUBMISSIONS),
    where("type", "==", "infection"),
    where("schoolYear", "==", CURRENT_SCHOOL_YEAR),
    where("semester", "==", CURRENT_SEMESTER)
  );
  const recentStaffQuery = query(
    collection(db, STAFF_SUBMISSIONS),
    where("submittedAt", ">=", sevenDaysAgo)
  );
  const recentInfectionQuery = query(
    collection(db, STUDENT_HEALTH_SUBMISSIONS),
    where("submittedAt", ">=", sevenDaysAgo)
  );

  const [
    staffTodayCount,
    infectionTodaySnapshot,
    pendingStaffCount,
    currentTermInfectionSnapshot,
    recentStaffCount,
    recentInfectionSnapshot,
    recentSubmissions,
  ] = await Promise.all([
    countServerQuery(staffTodayQuery),
    getDocs(infectionTodayQuery),
    countServerQuery(pendingStaffQuery),
    getDocs(currentTermInfectionQuery),
    countServerQuery(recentStaffQuery),
    getDocs(recentInfectionQuery),
    getRecentSubmissions(),
  ]);

  const infectionTodayCount = countMatchingDocs(infectionTodaySnapshot, isCurrentTermInfection);
  const infectionWorkflowCounts = getInfectionDashboardCounts(
    currentTermInfectionSnapshot.docs.map((documentSnapshot) => documentSnapshot.data())
  );
  const pendingInfectionCount =
    infectionWorkflowCounts.newReports +
    infectionWorkflowCounts.activeCases +
    infectionWorkflowCounts.returnCheckNeeded;
  const recentInfectionCount = countMatchingDocs(recentInfectionSnapshot, isCurrentTermInfection);
  const todayCount = staffTodayCount + infectionTodayCount;
  const recentSevenDayCount = recentStaffCount + recentInfectionCount;

  return {
    cards: [
      {
        label: "오늘 신규 제출",
        value: `${todayCount}건`,
        note: "KST 오늘 기준",
      },
      {
        label: "처리 대기 제출",
        value: `${pendingStaffCount}건`,
        note: "교직원 제출 접수됨 상태",
      },
      {
        label: "감염병 관리",
        value: `${pendingInfectionCount}건`,
        note: pendingInfectionCount
          ? "신규·관리·복귀 확인 필요"
          : "현재 확인이 필요한 감염병 사례가 없습니다.",
        href: "/firebase-admin/infections",
        metrics: [
          { label: "신규 보고", value: infectionWorkflowCounts.newReports },
          { label: "관리 중", value: infectionWorkflowCounts.activeCases },
          { label: "복귀 확인", value: infectionWorkflowCounts.returnCheckNeeded, priority: true },
        ],
      },
      {
        label: "최근 7일 제출",
        value: `${recentSevenDayCount}건`,
        note: "교직원 제출 + 감염병 보고",
      },
    ],
    counts: {
      todayCount,
      pendingStaffCount,
      pendingInfectionCount,
      infectionWorkflowCounts,
      recentSevenDayCount,
    },
    recentSubmissions,
  };
}
