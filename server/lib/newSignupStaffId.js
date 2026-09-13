export const GOOGLE_PROVIDER_ID = "google.com";
export const MICROSOFT_PROVIDER_ID = "microsoft.com";
export const GOOGLE_SIGNUP_PENDING_SOURCE = "google_signup_pending";

export const VERIFIED_TEAMS_NAME_PREFIXES = new Set(["수학", "영어", "보건"]);

export function normalizeStaffName(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function getStaffIdAutoLinkClaimId(staffId, schoolYear, semester) {
  const normalizedStaffId = String(staffId || "").normalize("NFKC").trim();
  return `${Number(schoolYear)}_${Number(semester)}_${encodeURIComponent(normalizedStaffId)}`;
}

export function isActiveStaffIdClaim({ claim, assignment, staffId, schoolYear, semester } = {}) {
  const normalizedStaffId = String(staffId || "").normalize("NFKC").trim();
  return (
    Boolean(claim?.uid) &&
    Boolean(claim?.assignmentId) &&
    assignment?.active === true &&
    assignment.uid === claim.uid &&
    assignment.staffId === normalizedStaffId &&
    Number(assignment.schoolYear) === Number(schoolYear) &&
    Number(assignment.semester) === Number(semester)
  );
}

export function getNewSignupRegistrationMode({ userExists, assignmentExists, providerId } = {}) {
  if (userExists) {
    return providerId === MICROSOFT_PROVIDER_ID
      ? "ensure-existing-microsoft-assignment"
      : "existing-user";
  }
  return assignmentExists ? "register-user-only" : "new-signup";
}

export function isPendingGoogleSignupAssignment(assignment) {
  return (
    assignment?.assignmentSource === GOOGLE_SIGNUP_PENDING_SOURCE &&
    Array.isArray(assignment.roles) &&
    assignment.roles.length === 0
  );
}

export function buildGoogleSignupApprovalUpdate({ assignmentScope, position, updatedAt } = {}) {
  return {
    roles: assignmentScope.roles,
    grade: assignmentScope.grade,
    classNo: assignmentScope.classNo,
    position,
    assignmentSource: "google_access_approved",
    active: true,
    updatedAt,
  };
}

export function buildGoogleSignupPendingAssignment({ uid, schoolYear, semester, createdAt } = {}) {
  return {
    uid,
    schoolYear,
    semester,
    roles: [],
    grade: null,
    classNo: null,
    position: null,
    assignmentSource: GOOGLE_SIGNUP_PENDING_SOURCE,
    active: false,
    createdAt,
    updatedAt: createdAt,
  };
}

export function getNormalizedStaffName({ providerId, providerDisplayName, displayNameOverride } = {}) {
  const override = normalizeStaffName(displayNameOverride);
  if (override) return override;

  const displayName = normalizeStaffName(providerDisplayName);
  if (!displayName || providerId !== MICROSOFT_PROVIDER_ID) return displayName;

  const separatorIndex = displayName.indexOf(" ");
  if (separatorIndex === -1) return displayName;

  const prefix = displayName.slice(0, separatorIndex);
  if (!VERIFIED_TEAMS_NAME_PREFIXES.has(prefix)) return displayName;

  return normalizeStaffName(displayName.slice(separatorIndex + 1));
}

export function resolveNewSignupStaffId({
  providerId,
  providerDisplayName,
  displayNameOverride,
  directory,
} = {}) {
  if (![GOOGLE_PROVIDER_ID, MICROSOFT_PROVIDER_ID].includes(providerId)) {
    return { status: "unsupported-provider", normalizedStaffName: "", staffId: "" };
  }

  const normalizedStaffName = getNormalizedStaffName({
    providerId,
    providerDisplayName,
    displayNameOverride,
  });
  if (!normalizedStaffName) {
    return { status: "unmatched", normalizedStaffName, staffId: "" };
  }

  const matches = (Array.isArray(directory) ? directory : []).filter((item) => {
    return normalizeStaffName(item?.name) === normalizedStaffName;
  });

  if (matches.length === 1) {
    return {
      status: "matched",
      normalizedStaffName,
      staffId: String(matches[0].staffId || "").normalize("NFKC").trim(),
    };
  }

  return {
    status: matches.length > 1 ? "ambiguous" : "unmatched",
    normalizedStaffName,
    staffId: "",
  };
}
