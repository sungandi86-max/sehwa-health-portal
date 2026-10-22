import { clientFirestoreResource } from "./firestoreResources.js";
import { collection, doc, getDoc, getCountFromServer, getDocs, limit, orderBy, startAfter, documentId, query, where } from "firebase/firestore";
import { STAFF_STATUS_LABELS, formatSubmissionDateTime } from "./adminSubmissions.js";
import { applyIndividualHealthCheckupDisplay } from "../data/individualHealthCheckupSubmission.js";
import { db } from "./firebase.js";
import { getActiveSubmissionItems } from "./submissionItems.js";

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

export const ROSTER_PAGE_SIZE = 25;
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
  const normalizedItem = {
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

  return itemId === "tb" ? applyIndividualHealthCheckupDisplay(normalizedItem) : normalizedItem;
}

function normalizeSubmission(documentSnapshot) {
  const data = documentSnapshot.data();
  return {
    ...data,
    id: documentSnapshot.id,
    submittedAtMillis: getTimestampMillis(data.submittedAt),
    submittedAtLabel: formatSubmissionDateTime(data.submittedAt),
  };
}

export function compareSubmissionRecency(a, b) {
  const parts = (item) => item.submittedAt && Number.isInteger(item.submittedAt.seconds)
    ? [item.submittedAt.seconds, item.submittedAt.nanoseconds || 0]
    : [Math.floor((item.submittedAtMillis || 0) / 1000), ((item.submittedAtMillis || 0) % 1000) * 1e6];
  const [as, an] = parts(a), [bs, bn] = parts(b);
  return bs - as || bn - an || (String(a.id) === String(b.id) ? 0 : String(a.id) < String(b.id) ? 1 : -1);
}

function getLatestSubmissionByUid(submissions) {
  const latestByUid = new Map();

  submissions.forEach((submission) => {
    const uid = submission.submitter?.uid || "";
    if (!uid) return;

    const current = latestByUid.get(uid);
    if (!current || compareSubmissionRecency(submission, current) < 0) {
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
      const staffMatches = user.assignment?.staffId ? submissions.filter((item) => item.staffId === user.assignment.staffId) : [];
      const latestSubmission = [latestByUid.get(user.uid), ...staffMatches].filter(Boolean)
        .sort(compareSubmissionRecency)[0] || null;
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

export async function getSubmissionStatusOverview(itemId, schoolYear, semester, { page = 0, cursor = null } = {}) {
  if (!STATUS_ITEM_IDS.includes(itemId) || !Number.isInteger(page) || page < 0) throw new Error("조회 범위를 확인해 주세요.");
  const ref = collection(db, clientFirestoreResource(db, "submissions"));
  const assignmentRef = collection(db, clientFirestoreResource(db, "assignments"));
  const conditions = [where("schoolYear", "==", schoolYear), where("semester", "==", semester), where("active", "==", true), where("roles", "array-contains", "staff")];
  const [items, assignmentSnapshot, targetCount, count] = await Promise.all([
    getActiveSubmissionItems(),
    getDocs(query(assignmentRef, ...conditions, orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(ROSTER_PAGE_SIZE + 1))),
    getCountFromServer(query(assignmentRef, ...conditions)), getCountFromServer(query(ref, where("itemId", "==", itemId))),
  ]);
  const assignmentDocs = assignmentSnapshot.docs.slice(0, ROSTER_PAGE_SIZE);
  const selected = await Promise.all(assignmentDocs.map(async (snapshot) => {
    const assignment = snapshot.data();
    if (!assignment.uid || assignment.schoolYear !== schoolYear || assignment.semester !== semester || snapshot.id !== `${assignment.uid}_${schoolYear}_${semester}`) throw new Error("대상자 권한 자료의 일치를 확인해 주세요.");
    const user = await getDoc(doc(db, "users", assignment.uid));
    const profile = user.exists() ? user.data() : {};
    const displayName = String(profile.displayNameOverride || profile.displayName || profile.email?.split("@")[0] || "").trim();
    return { ...profile, displayName, uid: assignment.uid, assignment };
  }));
  const submissions = [];
  // Bounded concurrency; at most two one-document reads per displayed person.
  for (let offset = 0; offset < selected.length; offset += 5) {
    const results = await Promise.all(selected.slice(offset, offset + 5).map(async (user) => {
      const identities = [["submitter.uid", user.uid], ...(user.assignment?.staffId ? [["staffId", user.assignment.staffId]] : [])];
      const snapshots = await Promise.all(identities.map(([field, value]) => getDocs(query(ref,
        where("itemId", "==", itemId), where(field, "==", value), orderBy("submittedAt", "desc"), orderBy(documentId(), "desc"), limit(1)))));
      return snapshots.flatMap((snapshot) => snapshot.docs.map(normalizeSubmission));
    }));
    submissions.push(...results.flat());
  }
  const roster = buildSubmissionRoster(selected, submissions);
  return { item: normalizeItem(itemId, items), roster, summary: summarizeRoster(roster),
    totalTargets: targetCount.data().count, receiptCount: count.data().count, page, hasNext: assignmentSnapshot.docs.length > ROSTER_PAGE_SIZE, nextCursor: assignmentDocs.at(-1) || null };
}
