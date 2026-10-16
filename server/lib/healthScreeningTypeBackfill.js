import { createHash } from "node:crypto";
import { validHealthScreeningTypeRecord } from "./healthScreeningTypeStore.js";

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
  })).sort((left, right) => left.staffId.localeCompare(right.staffId) || left.action.localeCompare(right.action)
    || left.sourceDocumentId.localeCompare(right.sourceDocumentId) || String(left.legacyRaw).localeCompare(String(right.legacyRaw)));
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
  if (schoolYear !== 2026) throw new Error("Only schoolYear 2026 is supported");
  const canonicalIds = roster.map((item) => item.staffId);
  if (canonicalIds.some((id) => typeof id !== "string" || !id || id !== text(id) || id.includes("/") || /^QA[-_]/i.test(id))
    || new Set(canonicalIds).size !== canonicalIds.length) throw new Error("Canonical roster identifiers must be unique and valid");
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
  const invalidAnnualIds = new Set();
  const annualIds = new Set();
  for (const item of annualRecords) {
    const staffId = text(item.staffId);
    if (!staffId || item.staffId !== staffId) throw new Error("Annual record must have a canonical staff identifier");
    if (annualIds.has(staffId) || !validHealthScreeningTypeRecord(item, staffId, schoolYear, "production")
      || (item.id !== undefined && item.id !== `${staffId}_${schoolYear}`)) invalidAnnualIds.add(staffId);
    annualIds.add(staffId);
  }
  const validLegacy = (item, staffId) => item?.staffId === staffId && item?.id === `${staffId}_tb-screening-${schoolYear}`
    && (item.taskId === undefined || item.taskId === `tb-screening-${schoolYear}`)
    && (item.schoolYear === undefined || Number(item.schoolYear) === schoolYear);
  const entries = [];

  for (const staffId of [...activeIds].sort()) {
    const legacy = legacyById.get(staffId);
    const annual = annualById.get(staffId);
    const legacyRaw = text(legacy?.screening?.screeningType);
    const mappedType = LEGACY_ROUTE_MAP.get(legacyRaw) || null;
    let action = "review";
    if (invalidAnnualIds.has(staffId)) action = "conflict";
    else if (duplicateLegacyIds.has(staffId) || !validLegacy(legacy, staffId)) action = "review";
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
    if (staffId && activeIds.has(staffId)) continue;
    const inRoster = rosterById.has(staffId);
    entries.push({
      staffId: staffId || "<missing>",
      sourceDocumentId: item.id || "",
      legacyRaw: text(item.screening?.screeningType) || null,
      mappedType: LEGACY_ROUTE_MAP.get(text(item.screening?.screeningType)) || null,
      existingType: annualById.get(staffId)?.screeningType || null,
      action: inRoster && validLegacy(item, staffId) ? "excluded_inactive" : "unmatched",
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
  if (plan.schoolYear !== 2026 || !plan.summary || plan.summary.conflict || plan.summary.unmatched) throw new Error("Unresolved or non-2026 plan cannot be applied");
  const expectedHash = createHash("sha256").update(JSON.stringify(stableManifest(plan.entries)), "utf8").digest("hex");
  if (plan.manifestHash !== expectedHash || plan.migrationId !== `legacy-tb-route-2026-${expectedHash.slice(0, 16)}`
    || plan.creates.length !== plan.summary.create || new Set(plan.creates.map((item) => item.staffId)).size !== plan.creates.length
    || plan.entries.filter((item) => item.action === "create").length !== plan.creates.length) throw new Error("Plan manifest must match its create candidates");
  for (const candidate of plan.creates) {
    const record = candidate.record;
    if (!plan.entries.some((entry) => entry.staffId === candidate.staffId && entry.action === "create"
      && entry.sourceDocumentId === candidate.sourceDocumentId && entry.legacyRaw === candidate.legacyRaw && entry.mappedType === candidate.mappedType)
      || !candidate.staffId || candidate.staffId.includes("/") || /^QA[-_]/i.test(candidate.staffId)
      || candidate.action !== "create" || LEGACY_ROUTE_MAP.get(candidate.legacyRaw) !== candidate.mappedType
      || record?.staffId !== candidate.staffId || record?.schoolYear !== 2026 || record?.environment !== "production"
      || record?.source !== LEGACY_SCREENING_BACKFILL_SOURCE || record?.screeningType !== candidate.mappedType
      || record?.selfChoice !== null || record?.confirmedBy !== null || record?.confirmedAt !== null
      || record?.migration?.id !== plan.migrationId || record?.migration?.manifestHash !== expectedHash
      || record?.migration?.sourceCollection !== LEGACY_SCREENING_COLLECTION
      || record?.migration?.sourceDocumentId !== `${candidate.staffId}_tb-screening-2026`) throw new Error("Invalid create candidate");
  }
  if (!importedAt) throw new Error("importedAt is required");
  const result = { created: 0, skipped: 0, conflicts: 0 };
  for (const candidate of plan.creates) {
    const target = db.collection(ANNUAL_SCREENING_COLLECTION).doc(`${candidate.staffId}_${plan.schoolYear}`);
    const outcome = await db.runTransaction(async (transaction) => {
      const history = target.collection("history").doc("1");
      const [current, currentHistory] = await Promise.all([transaction.get(target), transaction.get(history)]);
      if (current.exists) {
        const item = current.data();
        return validHealthScreeningTypeRecord(item, candidate.staffId, plan.schoolYear, "production")
          && item.screeningType === candidate.mappedType ? "skipped" : "conflict";
      }
      if (currentHistory.exists) return "conflict";
      const record = {
        ...recordFor(candidate, plan.schoolYear, plan.migrationId, plan.manifestHash),
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
