import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleAuth } from "google-auth-library";
import { DEFAULT_HEALTH_SPREADSHEET_ID } from "../server/lib/trainingDeployment.js";
import { SIGNATURE_HEADERS } from "../server/lib/trainingCenterPhase2.js";
import { TrainingSignatureLedger } from "../server/lib/trainingSignatureLedger.js";

const apply = process.argv.includes("--apply");
const confirm = process.argv.includes("--confirm-empty-production-ledger");

async function readSource() {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  const client = await auth.getClient();
  const range = encodeURIComponent("'교직원교육전자서명'!A1:M1000");
  const response = await client.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${DEFAULT_HEALTH_SPREADSHEET_ID}/values/${range}`,
    headers: { "x-goog-user-project": "sehwa-health-portal-v2" },
  });
  const values = response.data.values || [];
  if (values[0]?.length !== SIGNATURE_HEADERS.length ||
    SIGNATURE_HEADERS.some((header, index) => values[0][index] !== header)) throw new Error("source_schema_mismatch");
  return values;
}

async function main() {
  if (apply && !confirm) throw new Error("apply_confirmation_required");
  const app = initializeApp({ credential: applicationDefault(), projectId: "sehwa-health-portal-v2" }, "training-signature-production-migration");
  const db = getFirestore(app);
  const ledger = new TrainingSignatureLedger({ database: () => db,
    context: () => ({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }) });
  const source = await readSource();
  const pairs = await db.collection(ledger.collectionName).get();
  const locks = await db.collection("training_attendance_locks_production").get();
  const plan = await ledger.migrationDryRun(source);
  const existingPairs = pairs.docs.filter((doc) => doc.id !== "__migration").length;
  console.log(JSON.stringify({ phase: "dry-run", environment: "production", sourceRows: plan.rows.length,
    existingPairs, lockDocs: locks.size, markerExists: pairs.docs.some((doc) => doc.id === "__migration"), ...plan.counts }));
  if (plan.rows.length || existingPairs || locks.size || plan.counts.create || plan.counts.update || plan.counts.skip || plan.counts.conflict) {
    throw new Error("production_signature_conflict");
  }
  if (!apply) return;
  await ledger.markMigrationReady(source);
  if (!await ledger.isReady()) throw new Error("production_ledger_not_ready");
  const repeat = await ledger.migrationDryRun(source);
  console.log(JSON.stringify({ phase: "read-back", environment: "production", sourceRows: repeat.rows.length,
    ready: true, ...repeat.counts }));
}

try { await main(); } catch (error) {
  console.error(JSON.stringify({ failed: true, code: error?.message || "production_signature_migration_failed" }));
  process.exitCode = 1;
}
