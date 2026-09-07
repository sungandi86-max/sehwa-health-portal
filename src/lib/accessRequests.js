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

export const ACCESS_REQUEST_TYPES = {
  BASE_ACCESS: "base_access",
  HOMEROOM_ACCESS: "homeroom_access",
};

export const ACCESS_REQUEST_TYPE_LABELS = {
  [ACCESS_REQUEST_TYPES.BASE_ACCESS]: "기본 이용 권한",
  [ACCESS_REQUEST_TYPES.HOMEROOM_ACCESS]: "담임 권한",
};

const ACCESS_REQUEST_API_PATH = "/api/firebase/access-requests";

function normalizeHomeroomRequestInput(input = {}) {
  const isHomeroomRequested = input.isHomeroomRequested === true;
  if (!isHomeroomRequested) {
    return {
      homeroomRequest: {
        isHomeroomRequested: false,
        requestedGrade: null,
        requestedClassNo: null,
      },
      message: "",
    };
  }

  const requestedGrade = Number(input.requestedGrade);
  const requestedClassNo = Number(input.requestedClassNo);
  if (!Number.isInteger(requestedGrade) || requestedGrade < 1 || requestedGrade > 3) {
    return { homeroomRequest: null, message: "학년을 선택해 주세요." };
  }
  if (!Number.isInteger(requestedClassNo) || requestedClassNo < 1 || requestedClassNo > 12) {
    return { homeroomRequest: null, message: "반을 선택해 주세요." };
  }

  return {
    homeroomRequest: {
      isHomeroomRequested: true,
      requestedGrade,
      requestedClassNo,
    },
    message: "",
  };
}

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

export function getAccessRequestType(accessRequest) {
  return accessRequest?.requestType || ACCESS_REQUEST_TYPES.BASE_ACCESS;
}

export async function getCurrentAccessRequest(uid, schoolYear, semester) {
  if (!uid) return null;

  const result = await requestJson(
    `${ACCESS_REQUEST_API_PATH}?mode=current&schoolYear=${schoolYear}&semester=${semester}&requestType=${ACCESS_REQUEST_TYPES.BASE_ACCESS}`
  );
  return result.request || null;
}

export async function getCurrentHomeroomAccessRequest(uid, schoolYear, semester) {
  if (!uid) return null;

  const result = await requestJson(
    `${ACCESS_REQUEST_API_PATH}?mode=current&schoolYear=${schoolYear}&semester=${semester}&requestType=${ACCESS_REQUEST_TYPES.HOMEROOM_ACCESS}`
  );
  return result.request || null;
}

export async function submitStaffAccessRequest({ firebaseUser, schoolYear, semester, applicantInput, homeroomInput = {} }) {
  if (!firebaseUser?.uid) throw new Error("로그인이 필요합니다.");
  if (getAuthProvider(firebaseUser) !== "google") throw new Error("Google 계정만 이용 권한을 신청할 수 있습니다.");

  const { applicant, message } = normalizeAccessRequestApplicant(applicantInput);
  if (!applicant) throw new Error(message);

  const { homeroomRequest, message: homeroomMessage } = normalizeHomeroomRequestInput(homeroomInput);
  if (!homeroomRequest) throw new Error(homeroomMessage);

  return requestJson(ACCESS_REQUEST_API_PATH, {
    method: "POST",
    body: JSON.stringify({
      schoolYear,
      semester,
      requestType: ACCESS_REQUEST_TYPES.BASE_ACCESS,
      applicant,
      ...homeroomRequest,
    }),
  });
}

export async function submitHomeroomAccessRequest(firebaseUser, schoolYear, semester, homeroomInput) {
  if (!firebaseUser?.uid) throw new Error("로그인이 필요합니다.");

  const grade = Number(homeroomInput?.grade);
  const classNo = Number(homeroomInput?.classNo);
  if (!Number.isInteger(grade) || grade < 1 || grade > 3) throw new Error("학년을 선택해 주세요.");
  if (!Number.isInteger(classNo) || classNo < 1 || classNo > 12) throw new Error("반을 선택해 주세요.");

  return requestJson(ACCESS_REQUEST_API_PATH, {
    method: "POST",
    body: JSON.stringify({
      schoolYear,
      semester,
      requestType: ACCESS_REQUEST_TYPES.HOMEROOM_ACCESS,
      homeroom: { grade, classNo },
    }),
  });
}

export async function confirmTeamsHomeroomStatus(firebaseUser, isHomeroomTeacher) {
  if (!firebaseUser?.uid) throw new Error("로그인이 필요합니다.");
  if (getAuthProvider(firebaseUser) !== "microsoft") throw new Error("학교 Teams 계정만 담임 여부를 확인할 수 있습니다.");

  return requestJson(ACCESS_REQUEST_API_PATH, {
    method: "POST",
    body: JSON.stringify({
      action: "confirmHomeroomStatus",
      isHomeroomTeacher: isHomeroomTeacher === true,
    }),
  });
}

export async function getAccessRequests(status = "pending", options = {}) {
  const params = new URLSearchParams({ status });
  if (options.requestType) params.set("requestType", options.requestType);

  const result = await requestJson(`${ACCESS_REQUEST_API_PATH}?${params.toString()}`);
  return result.requests || [];
}

export async function getPendingAccessRequestCount(options = {}) {
  const params = new URLSearchParams({ mode: "count", status: "pending" });
  if (options.requestType) params.set("requestType", options.requestType);

  const result = await requestJson(`${ACCESS_REQUEST_API_PATH}?${params.toString()}`);
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
