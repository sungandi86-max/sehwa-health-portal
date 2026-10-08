import fs from "node:fs";
import process from "node:process";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "../server/lib/firebaseAdmin.js";
import { readGoogleSheetValues } from "../server/lib/staffDirectory.js";
import { DEFAULT_HEALTH_SPREADSHEET_ID } from "../server/lib/trainingDeployment.js";
import { planCheckupCmsMigration } from "../server/lib/checkupCmsMigration.js";
import { cmsCollection, cmsPublicItems } from "../server/lib/portalContentCms.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const qa = args.includes("--qa");
const production = args.includes("--production");
const sourceFile = args.find((argument) => argument.startsWith("--source-json="))?.slice("--source-json=".length);
const sourceBase64 = args.find((argument) => argument.startsWith("--source-base64="))?.slice("--source-base64=".length);
const useAdc = args.includes("--use-adc");

function abort(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

async function sourceRows() {
  if (sourceFile || sourceBase64) {
    const source = JSON.parse(sourceFile ? fs.readFileSync(sourceFile, "utf8") : Buffer.from(sourceBase64, "base64").toString("utf8"));
    if (!Array.isArray(source.values)) abort("source_json_values_missing");
    return source.values;
  }
  return readGoogleSheetValues({ spreadsheetId: DEFAULT_HEALTH_SPREADSHEET_ID, range: "'앱_검진검사'!A1:T1000" });
}

const asRecords = (snapshot) => snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const oldContent = (records) => JSON.stringify(canonical(records.filter((record) => record.id !== "_config" && record.type !== "checkup")
  .sort((a, b) => a.id.localeCompare(b.id))));

async function main() {
  if (qa === production) abort("choose_exactly_one_environment");
  if (apply && !args.includes("--confirm-four-checkup-rows")) abort("explicit_apply_confirmation_required");
  const context = qa ? { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }
    : { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" };
  const values = await sourceRows();
  const db = useAdc ? getFirestore(initializeApp({ credential: applicationDefault(),
    projectId: "sehwa-health-portal-v2" }, "checkup-cms-migration")) : getFirebaseAdminDb();
  const collection = db.collection(cmsCollection(context));
  const existing = asRecords(await collection.get());
  const plan = planCheckupCmsMigration(values, existing);
  const expectedRows = 4;
  const sourceCount = values.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim())).length;
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", environment: qa ? "qa" : "production",
    sourceRows: sourceCount, expectedRows, existingDocs: existing.length, operations: plan.operations,
    conflicts: plan.conflicts.map(({ row, code }) => ({ row, code })) }));
  if (sourceCount !== expectedRows || plan.records.length !== expectedRows || plan.conflicts.length) abort("migration_preconditions_failed");
  if (!apply) return;

  const importedAt = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(collection);
    const concurrent = asRecords(currentSnapshot);
    if (oldContent(existing) !== oldContent(concurrent)) abort("concurrent_content_change");
    const current = planCheckupCmsMigration(values, concurrent);
    if (current.conflicts.length) abort("concurrent_migration_conflict");
    const configRef = collection.doc("_config");
    for (const record of current.records) {
      if (!concurrent.some((item) => item.id === record.id)) {
        transaction.create(collection.doc(record.id), { ...record, createdAt: importedAt, updatedAt: importedAt,
          legacyImportedAt: importedAt, updatedBy: "approved_checkup_cms_migration" });
      }
    }
    if (current.operations.update) transaction.update(configRef, {
      counts: current.configCounts, updatedAt: importedAt,
    });
  });
  const actual = asRecords(await collection.get());
  const repeat = planCheckupCmsMigration(values, actual);
  const expectedPublic = cmsPublicItems(plan.records, "checkup");
  const actualPublic = cmsPublicItems(actual.filter((record) => record.type === "checkup"), "checkup");
  const parity = JSON.stringify(actualPublic) === JSON.stringify(expectedPublic) && oldContent(existing) === oldContent(actual)
    && repeat.operations.create === 0 && repeat.operations.update === 0 && repeat.operations.conflict === 0;
  console.log(JSON.stringify({ mode: "read-back", environment: qa ? "qa" : "production",
    checkups: actual.filter((record) => record.type === "checkup").length,
    existingContentUnchanged: oldContent(existing) === oldContent(actual), parity,
    rerunOperations: repeat.operations }));
  if (!parity) abort("migration_readback_mismatch");
}

try { await main(); } catch (error) {
  console.error(JSON.stringify({ failed: true, code: error?.code || "migration_error" }));
  process.exitCode = 1;
}
