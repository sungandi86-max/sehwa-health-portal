import { auth } from "./firebase.js";
import { getAuthProvider } from "./firebaseAuth.js";
import { normalizeAccessRequestApplicant } from "./accessRequestApplicant.js";

export const ACCESS_REQUEST_STATUSES = ["all", "pending", "approved", "rejected"];

export const ACCESS_REQUEST_STATUS_LABELS = {
  all: "전체",
  pending: "대기",
  approved: "승인",
  rejected: "거절",
};

const ACCESS_REQUEST_API_PATH = "/api/firebase/access-requests";

async function getIdToken() {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("로그인이 필요합니다.");
  return currentUser.getIdToken();
}

async function requestJson(path, options = {}) {
  const idToken = await getIdToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const result = await response.json().catch(() => null);

  if (!response.ok || result?.ok !== true) {
    throw new Error(result?.message || "권한 신청 정보를 처리하지 못했습니다.");
  }

  return result;
}

export function getAccessRequestId(uid, schoolYear, semester) {
  return `${uid}_${schoolYear}_${semester}`;
}

export async function getCurrentAccessRequest(uid, schoolYear, semester) {
  if (!uid) return null;

  const result = await requestJson(`${ACCESS_REQUEST_API_PATH}?mode=current&schoolYear=${schoolYear}&semester=${semester}`);
  return result.request || null;
}

export async function submitStaffAccessRequest(firebaseUser, schoolYear, semester, applicantInput) {
  if (!firebaseUser?.uid) throw new Error("로그인이 필요합니다.");
  if (getAuthProvider(firebaseUser) !== "google") throw new Error("Google 계정만 이용 권한을 신청할 수 있습니다.");

  const { applicant, message } = normalizeAccessRequestApplicant(applicantInput);
  if (!applicant) throw new Error(message);

  return requestJson(ACCESS_REQUEST_API_PATH, {
    method: "POST",
    body: JSON.stringify({ schoolYear, semester, applicant }),
  });
}

export async function getAccessRequests(status = "pending") {
  const result = await requestJson(`${ACCESS_REQUEST_API_PATH}?status=${status}`);
  return result.requests || [];
}

export async function getPendingAccessRequestCount() {
  const result = await requestJson(`${ACCESS_REQUEST_API_PATH}?mode=count&status=pending`);
  return result.count || 0;
}

export async function approveAccessRequest(accessRequest, reviewer) {
  return requestJson(ACCESS_REQUEST_API_PATH, {
    method: "PATCH",
    body: JSON.stringify({
      requestId: accessRequest.id,
      action: "approve",
      reviewerUid: reviewer.uid,
    }),
  });
}

export async function rejectAccessRequest(accessRequest, reviewer, reviewNote = "") {
  return requestJson(ACCESS_REQUEST_API_PATH, {
    method: "PATCH",
    body: JSON.stringify({
      requestId: accessRequest.id,
      action: "reject",
      reviewNote,
      reviewerUid: reviewer.uid,
    }),
  });
}
