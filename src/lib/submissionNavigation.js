import { CURRENT_SCHOOL_YEAR } from "../config/school.js";
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

// Navigation carries context only; authorization always remains with existing gates/APIs.
export function adminReturnHref(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.length > 2000) return null;
  try {
    const url = new URL(value, 'https://navigation.invalid');
    if (url.origin !== 'https://navigation.invalid' || !['/firebase-admin/submissions','/firebase-admin/submission-status','/firebase-admin/staff-submission-status'].includes(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}
export function withAdminReturn(href, returnTo) {
  const safe = adminReturnHref(returnTo);
  if (!href || !safe) return href;
  const url = new URL(href, 'https://navigation.invalid');
  url.searchParams.set('returnTo',safe);
  return `${url.pathname}${url.search}${url.hash}`;
}
export function staffWorkHref(submission) {
  if (!identifier(submission?.staffId)) return null;
  const year = submission.schoolYear ?? CURRENT_SCHOOL_YEAR;
  if (!/^20\d{2}$/.test(String(year))) return null;
  const task = submission.itemId === 'cpr' ? `cpr-training-${year}` : submission.itemId === 'tb' ? `tb-screening-${year}` : null;
  if (!task) return null;
  return `/firebase-admin/staff-submission-status?${new URLSearchParams({staffId:submission.staffId,schoolYear:String(year),task})}#completion-status`;
}

export function matchesTbReviewEvidence(item, evidence, schoolYear, context = null) {
  return evidence?.staffId === item?.staffId && evidence?.schoolYear === schoolYear &&
    (!context || (item.staffId === context.staffId && schoolYear === context.schoolYear &&
      evidence.submissionId === context.submissionId && (!context.screeningType || evidence.documentType === context.screeningType)));
}

export function screeningPanelContext(input) {
  const params = input instanceof URLSearchParams ? input : new URLSearchParams(input);
  if (params.has('submissionId')) {
    const reviewContext = tbReviewContext(params);
    return reviewContext ? {reviewContext,focusedStaffId:reviewContext.staffId,schoolYear:reviewContext.schoolYear} : null;
  }
  const staffId = params.get('staffId') || '';
  const year = params.get('schoolYear') ?? String(CURRENT_SCHOOL_YEAR);
  if ((params.has('staffId') && !identifier(staffId)) || !/^20\d{2}$/.test(year)) return null;
  return {reviewContext:null,focusedStaffId:staffId,schoolYear:Number(year)};
}

export function adminStaffFilters(input) {
  const params = input instanceof URLSearchParams ? input : new URLSearchParams(input);
  return {status:params.get('filterStatus') || (params.has('staffId') || params.has('task') ? 'all' : 'incomplete'),
    department:params.get('department') || 'all',position:params.get('position') || 'all',
    screeningType:params.get('screeningTypeFilter') || 'all',cprMethod:params.get('cprMethod') || 'all',search:params.get('search') || ''};
}
