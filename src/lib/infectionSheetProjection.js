const PROJECTION_API_PATH = "/api/health-room-status";
const DRY_RUN_COUNT_FIELDS = [
  "firestoreCount",
  "projectedExisting",
  "toInsert",
  "toUpdate",
  "unmanagedSheetRows",
  "duplicates",
  "errors",
];

function isNonNegativeCount(value) {
  return Number.isInteger(value) && value >= 0;
}

export function isSafeInfectionSheetSyncPlan(result) {
  if (result?.success !== true || result?.mode !== "dry-run") return false;
  if (!DRY_RUN_COUNT_FIELDS.every((field) => isNonNegativeCount(result[field]))) return false;
  if (result.duplicates !== 0 || result.errors !== 0) return false;
  if (result.unsafe === true) return false;

  return ["unmatched", "unmatchedCount", "unsafeCount"].every(
    (field) => result[field] === undefined || result[field] === 0
  );
}

export function isSuccessfulInfectionSheetSyncApply(result) {
  return (
    result?.success === true &&
    result?.mode === "apply" &&
    isNonNegativeCount(result.inserted) &&
    isNonNegativeCount(result.updated) &&
    result.duplicates === 0 &&
    result.errors === 0
  );
}

export async function syncInfectionSheetProjection(user, { apply = false } = {}) {
  if (!user?.getIdToken) throw new Error("firebase-auth-required");

  const token = await user.getIdToken();
  const response = await fetch(PROJECTION_API_PATH, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "syncInfectionSheet", apply }),
  });
  const result = await response.json().catch(() => null);

  if (!response.ok || result?.success !== true) {
    const error = new Error(`projection-http-${response.status}`);
    error.status = response.status;
    throw error;
  }

  return result;
}

export async function projectInfectionCaseBestEffort(user, docId) {
  if (!user?.getIdToken || !docId) return false;

  try {
    const token = await user.getIdToken();
    const response = await fetch(PROJECTION_API_PATH, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "projectInfectionCase", docId }),
    });
    if (!response.ok) throw new Error(`projection-http-${response.status}`);
    return true;
  } catch (error) {
    console.warn("[infection-sheet-projection] sync deferred", {
      reason: error?.message || "unknown",
    });
    return false;
  }
}
