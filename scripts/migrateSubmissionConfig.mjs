import fs from "node:fs";
import process from "node:process";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "../server/lib/firebaseAdmin.js";
import { readGoogleSheetValues } from "../server/lib/staffDirectory.js";
import { DEFAULT_HEALTH_SPREADSHEET_ID } from "../server/lib/trainingDeployment.js";
import { planSubmissionConfigMigration, submissionConfigMigrationRecords } from "../server/lib/submissionConfigMigration.js";
import { submissionCollections } from "../server/lib/submissionConfig.js";

const args = process.argv.slice(2);
const qa = args.includes("--qa");
const production = args.includes("--production");
const apply = args.includes("--apply");
const arg = (name) => args.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
const fromFile = (name) => {
  const path = arg(name);
  return path ? JSON.parse(fs.readFileSync(path, "utf8")).values : null;
};
const docs = (snapshot) => snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const summary = (phase, environment, plan, counts) => console.log(JSON.stringify({ phase, environment,
  counts, operations: plan.actions, conflicts: plan.conflicts }));

async function main() {
  if (qa === production) throw new Error("choose_exactly_one_environment");
  if (apply && !args.includes("--confirm-submission-config")) throw new Error("apply_confirmation_required");
  const environment = qa ? "qa" : "production";
  const context = qa ? { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }
    : { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" };
  const [uploads, items] = await Promise.all([
    fromFile("--uploads-json") || readGoogleSheetValues({ spreadsheetId: DEFAULT_HEALTH_SPREADSHEET_ID, range: "'앱_제출센터'!A1:R7" }),
    fromFile("--items-json") || readGoogleSheetValues({ spreadsheetId: DEFAULT_HEALTH_SPREADSHEET_ID, range: "'제출항목관리'!A1:S4" }),
  ]);
  const expected = submissionConfigMigrationRecords(uploads, items);
  const db = args.includes("--use-adc") ? getFirestore(initializeApp({ credential: applicationDefault(),
    projectId: "sehwa-health-portal-v2" }, `submission-config-${environment}`)) : getFirebaseAdminDb();
  const names = submissionCollections(context);
  const refs = { public: db.collection(names.public), admin: db.collection(names.admin) };
  const existing = { public: docs(await refs.public.get()), admin: docs(await refs.admin.get()) };
  const plan = planSubmissionConfigMigration(expected, existing);
  summary("dry-run", environment, plan, { public: existing.public.length, admin: existing.admin.length });
  if (plan.actions.conflict) {
    if (apply) throw new Error("migration_conflict");
    return;
  }
  if (!apply) return;
  if (production) {
    const qaNames = submissionCollections({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" });
    const qaDocs = { public: docs(await db.collection(qaNames.public).get()), admin: docs(await db.collection(qaNames.admin).get()) };
    for (const group of ["public", "admin"]) {
      for (const record of expected[group]) {
        const qaRecord = qaDocs[group].find((item) => item.id === record.id);
        if (!qaRecord || planSubmissionConfigMigration({ public: group === "public" ? [record] : [],
          admin: group === "admin" ? [record] : [] }, { public: group === "public" ? [qaRecord] : [],
          admin: group === "admin" ? [qaRecord] : [] }).actions.conflict) throw new Error("qa_parity_required");
      }
    }
  }
  const importedAt = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const current = { public: docs(await transaction.get(refs.public)), admin: docs(await transaction.get(refs.admin)) };
    const currentPlan = planSubmissionConfigMigration(expected, current);
    if (currentPlan.actions.conflict) throw new Error("concurrent_migration_conflict");
    for (const group of ["public", "admin"]) {
      const present = new Set(current[group].map((record) => record.id));
      for (const record of expected[group]) {
        if (!present.has(record.id)) transaction.create(refs[group].doc(record.id), {
          ...record, createdAt: importedAt, updatedAt: importedAt, legacyImportedAt: importedAt,
          updatedBy: "approved_submission_config_migration",
        });
      }
    }
  });
  const actual = { public: docs(await refs.public.get()), admin: docs(await refs.admin.get()) };
  const repeat = planSubmissionConfigMigration(expected, actual);
  summary("read-back", environment, repeat, { public: actual.public.length, admin: actual.admin.length });
  if (repeat.actions.create || repeat.actions.update || repeat.actions.conflict) throw new Error("migration_parity_failed");
}

try { await main(); } catch (error) {
  console.error(JSON.stringify({ failed: true, code: error?.message || "submission_migration_failed" }));
  process.exitCode = 1;
}
