import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { STAFF_STATUS_LABELS, formatSubmissionDateTime } from "./adminSubmissions.js";
import { db } from "./firebase.js";
import { getActiveSubmissionItems } from "./submissionItems.js";
import { getUsersWithAssignments } from "./userAssignmentsAdmin.js";

export const STATUS_ITEM_IDS = ["cpr", "tb", "recruit"];
export const STATUS_FILTERS = ["all", "missing", "submitted", "reviewing", "completed", "rejected"];

export const STATUS_FILTER_LABELS = {
  all: "전체",
  missing: "미제출",
  submitted: "제출됨",
  reviewing: "확인 중",
  completed: "처리 완료",
  rejected: "보완 필요",
};

const SUBMISSION_LIMIT = 300;
const STATUS_RANK = {
  missing: 0,
  rejected: 1,
  submitted: 2,
  reviewing: 3,
  completed: 4,
};

function getTimestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  return 0;
}

function isActiveStaff(user) {
  return user.assignment?.active === true && Array.isArray(user.assignment.roles) && user.assignment.roles.includes("staff");
}

function normalizeItem(itemId, items) {
  const item = items.find((currentItem) => currentItem.submissionType === itemId || currentItem.id === itemId);
  return {
    id: itemId,
    title: item?.title || itemId,
    description: item?.description || "",
    target: item?.target || "",
    documentType: item?.documentType || "",
    deadlineLabel: item?.deadlineLabel || "",
    guideText: item?.guideText || "",
    buttonLabel: item?.buttonLabel || "",
    order: item?.order ?? 999,
  };
}

function normalizeSubmission(documentSnapshot) {
  const data = documentSnapshot.data();
  return {
    id: documentSnapshot.id,
    ...data,
    submittedAtMillis: getTimestampMillis(data.submittedAt),
    submittedAtLabel: formatSubmissionDateTime(data.submittedAt),
  };
}

function getLatestSubmissionByUid(submissions) {
  const latestByUid = new Map();

  submissions.forEach((submission) => {
    const uid = submission.submitter?.uid || "";
    if (!uid) return;

    const current = latestByUid.get(uid);
    if (!current || submission.submittedAtMillis > current.submittedAtMillis) {
      latestByUid.set(uid, submission);
    }
  });

  return latestByUid;
}

function getRosterStatus(submission) {
  return submission?.status || "missing";
}

function sortRoster(left, right) {
  const leftRank = STATUS_RANK[left.status] ?? 99;
  const rightRank = STATUS_RANK[right.status] ?? 99;
  if (leftRank !== rightRank) return leftRank - rightRank;

  const leftName = left.displayName || left.email || "";
  const rightName = right.displayName || right.email || "";
  return leftName.localeCompare(rightName, "ko");
}

export function buildSubmissionRoster(users, submissions) {
  const latestByUid = getLatestSubmissionByUid(submissions);

  return users
    .filter(isActiveStaff)
    .map((user) => {
      const latestSubmission = latestByUid.get(user.uid) || null;
      const status = getRosterStatus(latestSubmission);
      return {
        uid: user.uid,
        displayName: user.displayName || "이름 미등록",
        email: user.email || "",
        position: user.assignment?.position || "",
        assignment: user.assignment,
        submission: latestSubmission,
        status,
        statusLabel: status === "missing" ? "미제출" : STATUS_FILTER_LABELS[status] || STAFF_STATUS_LABELS[status] || status,
        submittedAtLabel: latestSubmission?.submittedAtLabel || "",
      };
    })
    .sort(sortRoster);
}

export function summarizeRoster(roster) {
  return {
    total: roster.length,
    submitted: roster.filter((item) => item.status !== "missing").length,
    missing: roster.filter((item) => item.status === "missing").length,
    rejected: roster.filter((item) => item.status === "rejected").length,
    reviewing: roster.filter((item) => item.status === "reviewing").length,
    completed: roster.filter((item) => item.status === "completed").length,
  };
}

export function filterSubmissionRoster(roster, statusFilter, searchTerm) {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  return roster.filter((item) => {
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    if (!matchesStatus) return false;
    if (!normalizedSearch) return true;

    return [item.displayName, item.email, item.position]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedSearch));
  });
}

export async function getSubmissionStatusOverview(itemId, schoolYear, semester) {
  const [items, users, submissionSnapshot] = await Promise.all([
    getActiveSubmissionItems(),
    getUsersWithAssignments(schoolYear, semester),
    getDocs(query(collection(db, "staff_submissions"), where("itemId", "==", itemId), limit(SUBMISSION_LIMIT))),
  ]);

  const submissions = submissionSnapshot.docs.map(normalizeSubmission);
  const roster = buildSubmissionRoster(users, submissions);

  return {
    item: normalizeItem(itemId, items),
    roster,
    summary: summarizeRoster(roster),
  };
}
