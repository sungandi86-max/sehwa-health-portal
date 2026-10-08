import process from "node:process";
import { isDeepStrictEqual } from "node:util";
import { getFirebaseAdminDb } from "../server/lib/firebaseAdmin.js";
import { DEFAULT_HEALTH_SPREADSHEET_ID } from "../server/lib/trainingDeployment.js";
import { readGoogleSheetValues } from "../server/lib/staffDirectory.js";
import {
  planRoadmapMigration, readRoadmap, roadmapCollection, roadmapViewFromRecords,
} from "../server/lib/portalRoadmap.js";

const APPLY = process.argv.includes("--apply");
const REQUIRED_COUNT = 56;
const SOURCE_NAME = "앱_업무로드맵";
const SOURCE_RANGE = "'앱_업무로드맵'!A1:X200";
const CONFIG_RANGE = "'앱_설정'!A1:B100";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

async function main() {
  if (process.env.VERCEL_ENV !== "production" || process.env.VERCEL_GIT_COMMIT_REF !== "main") fail("production_context_required");
  if (APPLY && !process.argv.includes("--confirm-56-roadmap-rows")) fail("explicit_approval_flag_required");
  const db = getFirebaseAdminDb();
  const [values, configValues, existing] = await Promise.all([
    readGoogleSheetValues({ spreadsheetId: DEFAULT_HEALTH_SPREADSHEET_ID, range: SOURCE_RANGE }),
    readGoogleSheetValues({ spreadsheetId: DEFAULT_HEALTH_SPREADSHEET_ID, range: CONFIG_RANGE }),
    db.collection(roadmapCollection()).get(),
  ]);
  const settings = Object.fromEntries(configValues.map((row) => [row[0], row[1]]));
  const existingRecords = existing.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  const plan = planRoadmapMigration(values, {
    enabled: settings["업무로드맵_사용"],
    adminOnly: settings["업무로드맵_관리자전용"],
  }, existingRecords, SOURCE_NAME);
  const expectedView = roadmapViewFromRecords(plan.records, { includeHidden: true });
  const currentView = plan.alreadyMigrated ? roadmapViewFromRecords(existingRecords, { includeHidden: true }) : null;
  const parity = currentView ? isDeepStrictEqual(expectedView, currentView) : true;
  const summary = {
    mode: APPLY ? "apply" : "dry-run",
    sourceRows: plan.sourceRows,
    existingDocs: existingRecords.length,
    conflicts: plan.conflicts.length,
    duplicateSteps: plan.conflicts.filter((item) => item.code === "duplicate_step").length,
    alreadyMigrated: plan.alreadyMigrated,
    enabled: expectedView.enabled,
    adminOnly: expectedView.adminOnly,
    taskCount: new Set(expectedView.items.map((item) => `${item.category}|${item.taskName}`)).size,
    parity,
  };
  console.log(JSON.stringify(summary));
  if (plan.sourceRows !== REQUIRED_COUNT || plan.conflicts.length || !expectedView.enabled || !expectedView.adminOnly || !parity) {
    fail("migration_preconditions_failed");
  }
  if (!APPLY) return;
  if (plan.alreadyMigrated) fail("migration_already_applied");

  const collection = db.collection(roadmapCollection());
  const importedAt = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const refs = plan.records.map((record) => collection.doc(record.id));
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
    if (snapshots.some((snapshot) => snapshot.exists)) fail("concurrent_roadmap_conflict");
    plan.records.forEach((record, index) => transaction.create(refs[index], {
      ...record, createdAt: importedAt, updatedAt: importedAt,
      legacyImportedAt: importedAt, updatedBy: "approved_roadmap_migration",
    }));
  });
  const actual = await readRoadmap(db, { includeHidden: true });
  const actualParity = isDeepStrictEqual(expectedView, actual);
  console.log(JSON.stringify({ mode: "read-back", migratedItems: actual.items.length,
    configCreated: actual.enabled && actual.adminOnly, parity: actualParity }));
  if (!actualParity) fail("migration_readback_mismatch");
}

try {
  await main();
} catch (error) {
  console.error(JSON.stringify({ failed: true, code: error?.code || "migration_error", status: Number(error?.response?.status) || null }));
  process.exitCode = 1;
}
