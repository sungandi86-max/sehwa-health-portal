const CLASSIFIED_ROUTES = new Set(["individual", "nhis", "employment"]);
const DOCUMENT_ROUTES = new Map([
  ["결핵검진 확인증", "individual"],
  ["흉부 X-ray 확인 자료", "nhis"],
  ["채용검진 확인 자료", "employment"],
]);
const INVALID_EVIDENCE_STATES = new Set(["cancelled", "invalid", "invalidated", "rejected", "withdrawn"]);
const TRUSTED_EVIDENCE_ENVIRONMENTS = new Set(["production", "qa"]);

function evidenceFileId(item) {
  return item?.fileId || item?.evidenceFiles?.[0]?.fileId || "";
}

function isValidEvidenceState(item) {
  return !INVALID_EVIDENCE_STATES.has(item?.status) && !INVALID_EVIDENCE_STATES.has(item?.reviewState);
}

function isTrustedSelfSubmission(item, staffId, schoolYear) {
  return item?.staffId === staffId && item.subjectStaffId === staffId && item.schoolYear === schoolYear
    && TRUSTED_EVIDENCE_ENVIRONMENTS.has(item.environment) && item.source === "portal" && item.submissionMode === "self"
    && item.identityConfirmed === true && item.migration?.imported !== true && Boolean(evidenceFileId(item))
    && isValidEvidenceState(item);
}

function latestSelfSubmission(evidence, staffId, schoolYear) {
  return evidence.filter((item) => isTrustedSelfSubmission(item, staffId, schoolYear)).sort((left, right) => {
    const time = Date.parse(right.submittedAt || "") - Date.parse(left.submittedAt || "");
    return (Number.isNaN(time) ? 0 : time) || String(right.submissionId || "").localeCompare(String(left.submissionId || ""));
  })[0] || null;
}

function confirmedEvidence(evidence, status, staffId, schoolYear) {
  if (status?.status !== "completed" || status?.screening?.completed !== true
      || status.sourceType !== "admin_confirmation" || !status.evidenceSubmissionId) return null;
  return evidence.find((item) => item?.submissionId === status.evidenceSubmissionId
    && item.staffId === staffId && item.subjectStaffId === staffId && item.schoolYear === schoolYear
    && item.reviewState === "confirmed" && item.status === "completed" && isValidEvidenceState(item)) || null;
}

function selfChoiceConfirmed(route, staffId) {
  return route?.selfChoice?.confirmedBy === staffId && Boolean(route.selfChoice.screeningType);
}

export function validatedSchoolYear(value) {
  const year = typeof value === "string" && /^\d{4}$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    const error = new Error("학년도를 확인해 주세요.");
    error.status = 400;
    throw error;
  }
  return year;
}

export function tbWorkflowTaskId(schoolYear) {
  return `tb-screening-${validatedSchoolYear(schoolYear)}`;
}

export function evidenceRoute(documentType) {
  return DOCUMENT_ROUTES.get(documentType) ?? null;
}

export function hasEvidenceRouteMismatch(route, classifiedEvidenceRoute) {
  return CLASSIFIED_ROUTES.has(route) && CLASSIFIED_ROUTES.has(classifiedEvidenceRoute)
    && route !== classifiedEvidenceRoute;
}

export function joinTbScreeningWorkflow({ staffId, schoolYear, route = null, evidence = [], status = null, evidenceComplete = true }) {
  const year = validatedSchoolYear(schoolYear);
  const matches = (item) => item?.staffId === staffId && item.schoolYear === year;
  const annualRoute = matches(route) ? route : null;
  const annualEvidence = evidence.filter(matches);
  const annualStatus = matches(status) ? status : null;
  const approvedEvidence = confirmedEvidence(annualEvidence, annualStatus, staffId, year);
  const selfEvidence = latestSelfSubmission(annualEvidence, staffId, year);
  const confirmationBasis = approvedEvidence ? "admin_evidence_confirmation"
    : selfChoiceConfirmed(annualRoute, staffId) ? "self_choice"
    : selfEvidence ? "self_submission" : "none";
  return {
    staffId,
    schoolYear: year,
    taskId: tbWorkflowTaskId(year),
    route: annualRoute,
    evidence: annualEvidence,
    status: annualStatus,
    completed: annualStatus?.status === "completed" && annualStatus?.screening?.completed === true,
    confirmationBasis,
    confirmationEvidenceSubmissionId: approvedEvidence?.submissionId || selfEvidence?.submissionId || null,
    evidenceComplete,
    evidenceState: annualEvidence.length ? "present" : evidenceComplete ? "missing" : "unknown",
    routeMismatch: annualEvidence.some((item) => hasEvidenceRouteMismatch(annualRoute?.screeningType, item.evidenceRoute)),
  };
}
