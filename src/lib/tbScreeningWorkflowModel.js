const CLASSIFIED_ROUTES = new Set(["individual", "nhis", "employment"]);
const DOCUMENT_ROUTES = new Map([
  ["결핵검진 확인증", "individual"],
  ["흉부 X-ray 확인 자료", "nhis"],
  ["채용검진 확인 자료", "employment"],
]);

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
  return {
    staffId,
    schoolYear: year,
    taskId: tbWorkflowTaskId(year),
    route: annualRoute,
    evidence: annualEvidence,
    status: annualStatus,
    completed: annualStatus?.status === "completed" && annualStatus?.screening?.completed === true,
    evidenceComplete,
    evidenceState: annualEvidence.length ? "present" : evidenceComplete ? "missing" : "unknown",
    routeMismatch: annualEvidence.some((item) => hasEvidenceRouteMismatch(annualRoute?.screeningType, item.evidenceRoute)),
  };
}
