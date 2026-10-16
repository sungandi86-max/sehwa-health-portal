import { createHash } from "node:crypto";

export const LEGACY_SCREENING_BACKFILL_SOURCE = "legacy_firestore_backfill";
export const LEGACY_SCREENING_COLLECTION = "staff_submission_status";
export const ANNUAL_SCREENING_COLLECTION = "staff_health_screening_types";

const LEGACY_ROUTE_MAP = new Map([
  ["national", "nhis"],
  ["individual", "individual"],
  ["employment", "employment"],
  ["group", "group"],
  ["other", "other"],
]);
const CREATE_TYPES = ["nhis", "individual", "employment", "group", "other"];

const text = (value) => String(value ?? "").normalize("NFKC").trim();

function countBy(items, selector) {
  const counts = {};
  for (const item of items) {
    const key = selector(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}
function stableManifest(entries) {
  return entries.map(({ staffId, sourceDocumentId, legacyRaw, mappedType, action }) => ({
    staffId, sourceDocumentId, legacyRaw, mappedType, action,
  })).sort((left, right) => left.staffId.localeCompare(right.staffId) || left.action.localeCompare(right.action));
}

function recordFor(entry, schoolYear, migrationId, manifestHash) {
  return {
    staffId: entry.staffId,
    schoolYear,
    screeningType: entry.mappedType,
    screeningTypeConfirmed: true,
    source: LEGACY_SCREENING_BACKFILL_SOURCE,
    selfChoice: null,
    confirmedBy: null,
    confirmedAt: null,
    environment: "production",
    schemaVersion: 1,
    revision: 1,
    migration: {
      id: migrationId,
      sourceCollection: LEGACY_SCREENING_COLLECTION,
      sourceDocumentId: entry.sourceDocumentId,
      importedAt: null,
      manifestHash,
    },
    createdAt: null,
    updatedAt: null,
  };
}

export function buildHealthScreeningTypeBackfillPlan({ schoolYear, roster, legacyRecords, annualRecords }) {
  if (!Number.isInteger(schoolYear)) throw new Error("schoolYear is required");
  const rosterById = new Map(roster.map((item) => [text(item.staffId), item]).filter(([staffId]) => staffId));
  const activeIds = new Set([...rosterById].filter(([, item]) => item.employmentStatus === "재직").map(([staffId]) => staffId));
  const legacyById = new Map();
  const duplicateLegacyIds = new Set();
  for (const item of legacyRecords) {
    const staffId = text(item.staffId);
    if (!staffId) continue;
    if (legacyById.has(staffId)) duplicateLegacyIds.add(staffId);
    legacyById.set(staffId, item);
  }
  const annualById = new Map(annualRecords.map((item) => [text(item.staffId), item]).filter(([staffId]) => staffId));
  const entries = [];

  for (const staffId of [...activeIds].sort()) {
    const legacy = legacyById.get(staffId);
    const annual = annualById.get(staffId);
    const legacyRaw = text(legacy?.screening?.screeningType);
    const mappedType = LEGACY_ROUTE_MAP.get(legacyRaw) || null;
    let action = "review";
    if (duplicateLegacyIds.has(staffId) || !legacy) action = "review";
    else if (annual && mappedType && annual.screeningType !== mappedType) action = "conflict";
    else if (annual) action = "skip_existing";
    else if (mappedType) action = "create";
    else action = "unknown";
    entries.push({
      staffId,
      sourceDocumentId: legacy?.id || `${staffId}_tb-screening-${schoolYear}`,
      legacyRaw: legacyRaw || null,
      mappedType,
      existingType: annual?.screeningType || null,
      action,
    });
  }
  for (const item of legacyRecords) {
    const staffId = text(item.staffId);
    if (!staffId || activeIds.has(staffId)) continue;
    const inRoster = rosterById.has(staffId);
    entries.push({
      staffId: staffId || "<missing>",
      sourceDocumentId: item.id || "",
      legacyRaw: text(item.screening?.screeningType) || null,
      mappedType: LEGACY_ROUTE_MAP.get(text(item.screening?.screeningType)) || null,
      existingType: annualById.get(staffId)?.screeningType || null,
      action: inRoster ? "excluded_inactive" : "unmatched",
    });
  }

  const manifest = stableManifest(entries);
  const manifestHash = createHash("sha256").update(JSON.stringify(manifest), "utf8").digest("hex");
  const migrationId = `legacy-tb-route-${schoolYear}-${manifestHash.slice(0, 16)}`;
  const creates = entries.filter((item) => item.action === "create").map((entry) => ({
    ...entry,
    record: recordFor(entry, schoolYear, migrationId, manifestHash),
  }));
  const summary = {
    totalActiveRoster: activeIds.size,
    legacyDocsFound: legacyRecords.length,
    create: creates.length,
    createByType: Object.fromEntries(CREATE_TYPES.map((type) => [type, creates.filter((item) => item.mappedType === type).length])),
    existingSkip: entries.filter((item) => item.action === "skip_existing").length,
    conflict: entries.filter((item) => item.action === "conflict").length,
    unknown: entries.filter((item) => item.action === "unknown").length,
    unknownByRaw: countBy(entries.filter((item) => item.action === "unknown"), (item) => item.legacyRaw || "empty"),
    unmatched: entries.filter((item) => item.action === "unmatched" || item.action === "review").length,
    excludedInactive: entries.filter((item) => item.action === "excluded_inactive").length,
    annualConfirmedBefore: [...activeIds].filter((staffId) => annualById.has(staffId)).length,
    annualUnconfirmedAfterWrite: activeIds.size - new Set([...annualById.keys(), ...creates.map((item) => item.staffId)].filter((staffId) => activeIds.has(staffId))).size,
  };
  return { schoolYear, migrationId, manifestHash, manifest, entries, creates, summary };
}

export async function applyHealthScreeningTypeBackfill({ db, plan, importedAt }) {
  if (!plan?.migrationId || !plan?.manifestHash || !Array.isArray(plan.creates)) throw new Error("validated dry-run plan is required");
  if (!importedAt) throw new Error("importedAt is required");
  const result = { created: 0, skipped: 0, conflicts: 0 };
  for (const candidate of plan.creates) {
    const target = db.collection(ANNUAL_SCREENING_COLLECTION).doc(`${candidate.staffId}_${plan.schoolYear}`);
    const outcome = await db.runTransaction(async (transaction) => {
      const history = target.collection("history").doc("1");
      const [current, currentHistory] = await Promise.all([transaction.get(target), transaction.get(history)]);
      if (current.exists) return "skipped";
      if (currentHistory.exists) return "conflict";
      const record = {
        ...candidate.record,
        migration: { ...candidate.record.migration, importedAt },
        createdAt: importedAt,
        updatedAt: importedAt,
      };
      transaction.create(target, record);
      transaction.create(history, { ...record, previousScreeningType: null });
      return "created";
    });
    if (outcome === "created") result.created += 1;
    else if (outcome === "skipped") result.skipped += 1;
    else result.conflicts += 1;
  }
  return result;
}
