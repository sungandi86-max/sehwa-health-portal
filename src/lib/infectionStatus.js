export const LEGACY_INFECTION_STATUS = {
  submitted: "submitted",
  reviewing: "reviewing",
  completed: "completed",
};

export const INFECTION_SUBMISSION_STATUS = {
  submitted: "submitted",
  reviewed: "reviewed",
};

export const INFECTION_CASE_STATUS = {
  new: "new",
  checking: "checking",
  managing: "managing",
  returnCheckNeeded: "return_check_needed",
  closed: "closed",
};

export const INFECTION_LEGACY_STATUS_OPTIONS = [
  LEGACY_INFECTION_STATUS.submitted,
  LEGACY_INFECTION_STATUS.reviewing,
  LEGACY_INFECTION_STATUS.completed,
];

export const INFECTION_CASE_STATUS_OPTIONS = [
  INFECTION_CASE_STATUS.new,
  INFECTION_CASE_STATUS.checking,
  INFECTION_CASE_STATUS.managing,
  INFECTION_CASE_STATUS.returnCheckNeeded,
  INFECTION_CASE_STATUS.closed,
];

export const INFECTION_STATUS_LABELS = {
  [LEGACY_INFECTION_STATUS.submitted]: "처리 대기",
  [LEGACY_INFECTION_STATUS.reviewing]: "확인 중",
  [LEGACY_INFECTION_STATUS.completed]: "처리 완료",
};

export const INFECTION_SUBMISSION_STATUS_LABELS = {
  [INFECTION_SUBMISSION_STATUS.submitted]: "접수",
  [INFECTION_SUBMISSION_STATUS.reviewed]: "확인완료",
};

export const INFECTION_CASE_STATUS_LABELS = {
  [INFECTION_CASE_STATUS.new]: "신규",
  [INFECTION_CASE_STATUS.checking]: "확인 중",
  [INFECTION_CASE_STATUS.managing]: "관리 중",
  [INFECTION_CASE_STATUS.returnCheckNeeded]: "복귀 확인 필요",
  [INFECTION_CASE_STATUS.closed]: "종결",
};

const LEGACY_STATUS_COMPATIBILITY = {
  [LEGACY_INFECTION_STATUS.submitted]: {
    submissionStatus: INFECTION_SUBMISSION_STATUS.submitted,
    caseStatus: INFECTION_CASE_STATUS.new,
  },
  [LEGACY_INFECTION_STATUS.reviewing]: {
    submissionStatus: INFECTION_SUBMISSION_STATUS.reviewed,
    caseStatus: INFECTION_CASE_STATUS.checking,
  },
  [LEGACY_INFECTION_STATUS.completed]: {
    submissionStatus: INFECTION_SUBMISSION_STATUS.reviewed,
    caseStatus: INFECTION_CASE_STATUS.closed,
  },
};

const CASE_STATUS_LEGACY_STATUS = {
  [INFECTION_CASE_STATUS.new]: LEGACY_INFECTION_STATUS.submitted,
  [INFECTION_CASE_STATUS.checking]: LEGACY_INFECTION_STATUS.reviewing,
  [INFECTION_CASE_STATUS.managing]: LEGACY_INFECTION_STATUS.reviewing,
  [INFECTION_CASE_STATUS.returnCheckNeeded]: LEGACY_INFECTION_STATUS.reviewing,
  [INFECTION_CASE_STATUS.closed]: LEGACY_INFECTION_STATUS.completed,
};

function hasOwnValue(options, value) {
  return Object.values(options).includes(value);
}

export function getInfectionLegacyStatus(documentData) {
  const status = documentData?.report?.status;
  return hasOwnValue(LEGACY_INFECTION_STATUS, status) ? status : LEGACY_INFECTION_STATUS.submitted;
}

export function getInfectionSubmissionStatus(documentData) {
  const submissionStatus = documentData?.report?.submissionStatus;
  if (hasOwnValue(INFECTION_SUBMISSION_STATUS, submissionStatus)) return submissionStatus;

  return LEGACY_STATUS_COMPATIBILITY[getInfectionLegacyStatus(documentData)].submissionStatus;
}

export function getInfectionCaseStatus(documentData) {
  const caseStatus = documentData?.report?.caseStatus;
  if (hasOwnValue(INFECTION_CASE_STATUS, caseStatus)) return caseStatus;

  return LEGACY_STATUS_COMPATIBILITY[getInfectionLegacyStatus(documentData)].caseStatus;
}

export function getInfectionStatusLabels(documentData) {
  const legacyStatus = getInfectionLegacyStatus(documentData);
  const submissionStatus = getInfectionSubmissionStatus(documentData);
  const caseStatus = getInfectionCaseStatus(documentData);

  return {
    statusLabel: INFECTION_STATUS_LABELS[legacyStatus],
    submissionStatusLabel: INFECTION_SUBMISSION_STATUS_LABELS[submissionStatus],
    caseStatusLabel: INFECTION_CASE_STATUS_LABELS[caseStatus],
  };
}

export function getInfectionStatusUpdate(status) {
  if (!INFECTION_LEGACY_STATUS_OPTIONS.includes(status)) {
    throw new Error("지원하지 않는 감염병 보고 상태입니다.");
  }

  const compatibility = LEGACY_STATUS_COMPATIBILITY[status];
  return {
    "report.status": status,
    "report.submissionStatus": compatibility.submissionStatus,
    "report.caseStatus": compatibility.caseStatus,
  };
}

export function getLegacyStatusForCaseStatus(caseStatus) {
  if (!INFECTION_CASE_STATUS_OPTIONS.includes(caseStatus)) {
    throw new Error("지원하지 않는 감염병 사례 상태입니다.");
  }

  return CASE_STATUS_LEGACY_STATUS[caseStatus];
}

export function getInfectionCaseStatusUpdate(caseStatus) {
  const legacyStatus = getLegacyStatusForCaseStatus(caseStatus);
  return {
    "report.status": legacyStatus,
    "report.submissionStatus": INFECTION_SUBMISSION_STATUS.reviewed,
    "report.caseStatus": caseStatus,
  };
}
