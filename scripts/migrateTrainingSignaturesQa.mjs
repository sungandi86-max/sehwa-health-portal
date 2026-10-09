import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleAuth } from "google-auth-library";
import { DEFAULT_HEALTH_SPREADSHEET_ID } from "../server/lib/trainingDeployment.js";
import { TrainingSignatureLedger } from "../server/lib/trainingSignatureLedger.js";

const args = process.argv.slice(2);
const sourceWorkbook = args.find((arg) => arg.startsWith("--qa-workbook="))?.slice("--qa-workbook=".length);
const apply = args.includes("--apply");
const EXPECTED_QA_ROWS = 4;

async function readQaSignatures() {
  if (!sourceWorkbook || sourceWorkbook === DEFAULT_HEALTH_SPREADSHEET_ID || !/^[A-Za-z0-9_-]{20,}$/.test(sourceWorkbook)) {
    throw new Error("qa_workbook_required");
  }
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  const client = await auth.getClient();
  const range = encodeURIComponent("'교직원교육전자서명'!A1:M1000");
  const response = await client.request({ url: `https://sheets.googleapis.com/v4/spreadsheets/${sourceWorkbook}/values/${range}`,
    headers: { "x-goog-user-project": "sehwa-health-portal-v2" } });
  return response.data.values || [];
}

async function main() {
  if (apply && !args.includes("--confirm-qa-signature-ledger")) throw new Error("apply_confirmation_required");
  const app = initializeApp({ credential: applicationDefault(), projectId: "sehwa-health-portal-v2" }, "training-signature-qa-migration");
  const ledger = new TrainingSignatureLedger({ database: () => getFirestore(app),
    context: () => ({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }) });
  const source = await readQaSignatures();
  const plan = await ledger.migrationDryRun(source);
  if (plan.rows.length !== EXPECTED_QA_ROWS) throw new Error("qa_source_row_count_mismatch");
  console.log(JSON.stringify({ phase: "dry-run", environment: "qa", sourceRows: plan.rows.length, ...plan.counts }));
  if (plan.counts.conflict || plan.counts.update) throw new Error("migration_conflict");
  if (!apply) return;
  await ledger.importSheetRows(source);
  const repeat = await ledger.migrationDryRun(source);
  console.log(JSON.stringify({ phase: "read-back", environment: "qa", sourceRows: repeat.rows.length, ...repeat.counts }));
  if (repeat.counts.create || repeat.counts.update || repeat.counts.conflict) throw new Error("read_back_parity_failed");
  await ledger.markMigrationReady(source);
  if (!await ledger.isReady()) throw new Error("qa_ledger_not_ready");
}

try { await main(); } catch (error) {
  console.error(JSON.stringify({ failed: true, code: error?.message || "qa_signature_migration_failed" }));
  process.exitCode = 1;
}
