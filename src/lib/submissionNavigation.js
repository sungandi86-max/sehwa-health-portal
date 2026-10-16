const identifier = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value);
export function submissionReviewHref(submission) {
  if (!identifier(submission?.id)) return null;
  return `/firebase-admin/submissions?${new URLSearchParams({ tab: "staff", submissionId: submission.id })}`;
}
export function tbReviewContext(input) {
  const params = input instanceof URLSearchParams ? input : new URLSearchParams(input);
  const staffId = params.get("staffId"), submissionId = params.get("submissionId"), year = params.get("schoolYear");
  if (!identifier(staffId) || !identifier(submissionId) || !/^20\d{2}$/.test(year || "")) return null;
  return { staffId, submissionId, schoolYear: Number(year), screeningType: params.get("screeningType") || "" };
}
export function tbReviewHref(submission) {
  const params = new URLSearchParams({ staffId: submission?.staffId || "", submissionId: submission?.id || "", schoolYear: String(submission?.schoolYear || ""), screeningType: submission?.documentType || "" });
  return tbReviewContext(params) ? `/firebase-admin/staff-submission-status?${params}#annual-screening-type` : null;
}
