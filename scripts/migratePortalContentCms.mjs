import process from "node:process";
import { getFirebaseAdminDb } from "../server/lib/firebaseAdmin.js";
import { readGoogleSheetValues } from "../server/lib/staffDirectory.js";
import { DEFAULT_HEALTH_SPREADSHEET_ID } from "../server/lib/trainingDeployment.js";
import { CMS_SHEETS, planCmsMigration } from "../server/lib/portalContentMigration.js";
import { cmsCollection, cmsPublicItems, readCms } from "../server/lib/portalContentCms.js";

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const QA = args.has("--qa");
const PRODUCTION = args.has("--production");
const EXPECTED = { notice: 3, faq: 9, health_event: 3, education: 9 };

function abort(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

async function main() {
  if (QA === PRODUCTION) abort("choose_exactly_one_environment");
  if (APPLY && !args.has("--confirm-24-content-rows")) abort("explicit_apply_confirmation_required");
  const context = QA
    ? { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }
    : { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" };
  // The QA workbook is intentionally limited to training data. The four CMS
  // source tabs are read-only in the operating workbook for both destinations.
  const sourceId = DEFAULT_HEALTH_SPREADSHEET_ID;
  const db = getFirebaseAdminDb();
  const collection = db.collection(cmsCollection(context));
  const entries = await Promise.all(Object.entries(CMS_SHEETS).map(async ([type, definition]) => {
    const escapedName = definition.name.replace(/'/g, "''");
    const values = await readGoogleSheetValues({ spreadsheetId: sourceId, range: `'${escapedName}'!A1:N1000` });
    return [type, values];
  }));
  const snapshot = await collection.get();
  const existing = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  const plan = planCmsMigration(Object.fromEntries(entries), existing);
  const countsMatch = Object.entries(EXPECTED).every(([type, count]) => plan.counts[type] === count);
  const operations = { create: existing.length ? 0 : plan.records.length,
    update: 0, skip: plan.alreadyMigrated ? plan.records.length : 0,
    conflict: plan.conflicts.length };
  console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", environment: QA ? "qa" : "production",
    sourceRows: plan.counts, expectedRows: EXPECTED, conflicts: plan.conflicts,
    existingDocs: existing.length, alreadyMigrated: plan.alreadyMigrated, countsMatch, operations }));
  if (!countsMatch || plan.conflicts.length) abort("migration_preconditions_failed");
  if (!APPLY) return;
  if (plan.alreadyMigrated) abort("migration_already_applied");

  const importedAt = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const configRef = collection.doc("_config");
    if ((await transaction.get(configRef)).exists) abort("concurrent_migration_conflict");
    for (const record of plan.records) transaction.create(collection.doc(record.id), {
      ...record, ...(record.kind === "config" ? { migrationComplete: false } : {}),
      createdAt: importedAt, updatedAt: importedAt, legacyImportedAt: importedAt,
      updatedBy: "approved_content_cms_migration",
    });
  });
  const rawSnapshot = await collection.get();
  const actual = rawSnapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })).filter((record) => record.kind === "item");
  const expectedItems = plan.records.filter((record) => record.kind === "item");
  const parity = Object.keys(EXPECTED).every((type) => JSON.stringify(cmsPublicItems(actual, type)) === JSON.stringify(cmsPublicItems(expectedItems, type)));
  if (actual.length !== 24 || !parity) abort("migration_readback_mismatch");
  await collection.doc("_config").update({ migrationComplete: true, updatedAt: new Date().toISOString() });
  const ready = await readCms(db, { context });
  console.log(JSON.stringify({ mode: "read-back", environment: QA ? "qa" : "production",
    createdItems: ready.length, parity: ready.length === 24 && parity }));
  if (ready.length !== 24) abort("migration_readback_mismatch");
}

try {
  await main();
} catch (error) {
  console.error(JSON.stringify({ failed: true, code: error?.code || "migration_error", status: Number(error?.response?.status) || null }));
  process.exitCode = 1;
}
