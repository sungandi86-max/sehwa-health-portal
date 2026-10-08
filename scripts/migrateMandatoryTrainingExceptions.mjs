import process from "node:process";
import { isDeepStrictEqual } from "node:util";
import { JWT } from "google-auth-library";
import { getFirebaseAdminDb, getFirebaseServiceAccount } from "../server/lib/firebaseAdmin.js";
import { DEFAULT_HEALTH_SPREADSHEET_ID } from "../server/lib/trainingDeployment.js";
import { readGoogleSheetValues, readStaffDirectory } from "../server/lib/staffDirectory.js";
import { buildSnapshotPlan, summarizePlan, summarizeResearchRows, summarizeSourceOnlyExceptions } from "../server/healthMandatoryTrainingAnalysis.js";
import { planLegacyExceptionMigration } from "../server/healthMandatoryTrainingExceptionMigration.js";
import { exceptionCollection, readStoredExceptions, summarizeStoredExceptions } from "../server/healthMandatoryTrainingExceptions.js";
import { getResearchTrainingSummary } from "../server/healthMandatoryTrainingDryRun.js";

const RESEARCH_SPREADSHEET_ID = "1rn4CVt41lq2f_o8Uiodij4h_R4Q9lVbpPMNFJjy6-IM";
const LEGACY_RANGE = "'법정의무연수_예외'!A1:F1000";
const RESEARCH_RANGE = "'법정의무연수 묶음과정'!A1:Z1000";
const APPLY = process.argv.includes("--apply");

function abort(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

async function assertNoNamedRangeReference() {
  const serviceAccount = getFirebaseServiceAccount();
  if (!serviceAccount?.client_email || !serviceAccount?.private_key) abort("service_account_missing");
  const auth = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const response = await auth.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${DEFAULT_HEALTH_SPREADSHEET_ID}?fields=namedRanges(name,range),sheets(properties(sheetId,title))`,
  });
  const tab = response.data.sheets?.find((sheet) => sheet.properties?.title === "법정의무연수_예외");
  if (!tab) abort("legacy_sheet_missing");
  const references = (response.data.namedRanges || []).filter((range) => range.range?.sheetId === tab.properties.sheetId);
  if (references.length) abort("legacy_sheet_named_range_reference");
  return references.length;
}

async function main() {
  if (process.env.VERCEL_ENV !== "production" || process.env.VERCEL_GIT_COMMIT_REF !== "main") {
    abort("production_context_required");
  }
  if (APPLY && !process.argv.includes("--confirm-four-source-only-rows")) abort("explicit_approval_flag_required");

  const namedRangeReferences = await assertNoNamedRangeReference();
  const db = getFirebaseAdminDb();
  const [legacyValues, researchValues, directoryResult, storedRecords] = await Promise.all([
    readGoogleSheetValues({ spreadsheetId: DEFAULT_HEALTH_SPREADSHEET_ID, range: LEGACY_RANGE }),
    readGoogleSheetValues({ spreadsheetId: RESEARCH_SPREADSHEET_ID, range: RESEARCH_RANGE }),
    readStaffDirectory({ allowInvalidEmploymentStatus: true }),
    readStoredExceptions(db),
  ]);
  const source = summarizeResearchRows(researchValues);
  const legacy = summarizeSourceOnlyExceptions(legacyValues, 2026);
  const plan = planLegacyExceptionMigration({
    legacyValues,
    sourceRows: source.rows,
    directory: directoryResult.directory,
    storedRecords: [],
  });
  const alreadyMigrated = storedRecords.length === 4 && plan.candidates.length === 4
    && plan.candidates.every((candidate) => {
      const record = storedRecords.find((item) => item.id === candidate.id);
      return record?.active === true && record?.legacySourceOnly === true
        && record?.staffId === null && record?.sourceFingerprint === candidate.data.sourceFingerprint
        && record?.legacySource === candidate.data.legacySource
        && record?.originalSheetName === candidate.data.originalSheetName
        && Boolean(record?.legacyImportedAt);
    });
  const projected = summarizeStoredExceptions(
    alreadyMigrated ? storedRecords : [...storedRecords, ...plan.candidates.map((candidate) => candidate.data)], 2026
  );
  const legacyPlan = summarizePlan(source.rows, directoryResult.directory, legacy, { taskYear: 2026 });
  const projectedPlan = summarizePlan(source.rows, directoryResult.directory, projected, { taskYear: 2026 });
  const legacySnapshot = buildSnapshotPlan(source.rows, directoryResult.directory, legacy, { taskYear: 2026 });
  const projectedSnapshot = buildSnapshotPlan(source.rows, directoryResult.directory, projected, { taskYear: 2026 });
  const parity = isDeepStrictEqual(legacyPlan, projectedPlan) && isDeepStrictEqual(legacySnapshot, projectedSnapshot);
  const dryRun = {
    mode: APPLY ? "apply" : "dry-run",
    namedRangeReferences,
    legacyRows: legacy.stats.sourceRows,
    legacyConfirmed: legacy.stats.confirmedRows,
    exactSourceOnlyCandidates: plan.candidates.length,
    canonicalStaffIdMappings: 0,
    existingExceptionDocs: storedRecords.length,
    alreadyMigrated,
    conflicts: plan.conflicts.length,
    parity,
    beforeUnresolvedSourceOnly: summarizePlan(source.rows, directoryResult.directory, summarizeStoredExceptions(storedRecords), { taskYear: 2026 }).unresolvedSourceOnly,
    afterUnresolvedSourceOnly: projectedPlan.unresolvedSourceOnly,
    researchRows: source.stats.validRows,
  };
  console.log(JSON.stringify(dryRun));
  if (namedRangeReferences || legacy.stats.sourceRows !== 4 || legacy.stats.confirmedRows !== 4
    || legacy.stats.invalidRows || legacy.stats.duplicateConfirmedRows
    || (storedRecords.length !== 0 && !alreadyMigrated)
    || plan.conflicts.length || plan.candidates.length !== 4 || !parity) {
    abort("migration_preconditions_failed");
  }
  if (!APPLY) return;
  if (alreadyMigrated) abort("migration_already_applied");

  const collection = db.collection(exceptionCollection());
  const importedAt = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const refs = plan.candidates.map((candidate) => collection.doc(candidate.id));
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
    if (snapshots.some((snapshot) => snapshot.exists)) abort("concurrent_exception_conflict");
    plan.candidates.forEach((candidate, index) => {
      transaction.create(refs[index], {
        ...candidate.data,
        legacyImportedAt: importedAt,
        createdAt: importedAt,
        updatedAt: importedAt,
        reviewedBy: "approved_legacy_migration",
      });
    });
  });

  const readBack = await readStoredExceptions(db);
  const migrated = plan.candidates.filter((candidate) => {
    const record = readBack.find((item) => item.id === candidate.id);
    return record?.legacyImportedAt === importedAt && record?.legacySourceOnly === true
      && record?.staffId === null && record?.sourceFingerprint === candidate.data.sourceFingerprint;
  });
  if (migrated.length !== 4) abort("migration_readback_mismatch");
  const actual = await getResearchTrainingSummary({ db });
  const actualParity = isDeepStrictEqual(
    legacyPlan,
    summarizePlan(actual.source.rows, actual.directory, actual.exceptions, { taskYear: 2026 })
  )
    && isDeepStrictEqual(legacySnapshot, actual.snapshotPlan);
  console.log(JSON.stringify({
    mode: "read-back",
    migrated: migrated.length,
    activeConfirmed: actual.exceptions.stats.confirmedRows,
    unresolvedSourceOnly: actual.plan.unresolvedSourceOnly,
    parity: actualParity,
    applyAllowed: actual.summary.safety.applyAllowed,
    researchRows: actual.source.stats.validRows,
  }));
  if (!actualParity || actual.plan.unresolvedSourceOnly !== legacyPlan.unresolvedSourceOnly) {
    abort("post_migration_parity_failed");
  }
}

try {
  await main();
} catch (error) {
  console.error(JSON.stringify({ failed: true, code: error?.code || "migration_error", status: Number(error?.response?.status) || null }));
  process.exitCode = 1;
}
