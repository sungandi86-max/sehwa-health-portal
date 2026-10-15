import process from "node:process";
import { getFirestore } from "firebase-admin/firestore";
import { getProjectId, initializeFirebaseAdmin, loadLocalEnv } from "./lib/firebaseAdminCli.mjs";
import { readStaffDirectory } from "../server/lib/staffDirectory.js";
import {
  ANNUAL_SCREENING_COLLECTION,
  applyHealthScreeningTypeBackfill,
  buildHealthScreeningTypeBackfillPlan,
  LEGACY_SCREENING_COLLECTION,
} from "../server/lib/healthScreeningTypeBackfill.js";

const SCHOOL_YEAR = 2026;
const TASK_ID = `tb-screening-${SCHOOL_YEAR}`;
const write = process.argv.includes("--write");

loadLocalEnv();
if (getProjectId() !== "sehwa-health-portal-v2") throw new Error("Unexpected Firebase project; migration stopped before reads");
process.env.VERCEL_ENV = "production";
process.env.VERCEL_GIT_COMMIT_REF = "main";
initializeFirebaseAdmin();

const db = getFirestore();
const [{ directory }, legacySnapshot, annualSnapshot] = await Promise.all([
  readStaffDirectory({ allowInvalidEmploymentStatus: false }),
  db.collection(LEGACY_SCREENING_COLLECTION).where("taskId", "==", TASK_ID).get(),
  db.collection(ANNUAL_SCREENING_COLLECTION).where("schoolYear", "==", SCHOOL_YEAR).get(),
]);
const legacyRecords = legacySnapshot.docs.map((snapshot) => ({ ...snapshot.data(), id: snapshot.id }));
const annualRecords = annualSnapshot.docs.map((snapshot) => ({ ...snapshot.data(), id: snapshot.id }));
const plan = buildHealthScreeningTypeBackfillPlan({
  schoolYear: SCHOOL_YEAR,
  roster: directory,
  legacyRecords,
  annualRecords,
});

console.log(JSON.stringify({
  mode: write ? "WRITE" : "DRY_RUN",
  schoolYear: plan.schoolYear,
  migrationId: plan.migrationId,
  manifestHash: plan.manifestHash,
  summary: plan.summary,
  manifest: plan.manifest,
}, null, 2));

if (write) {
  if (plan.summary.conflict || plan.summary.unmatched) {
    throw new Error("conflict 또는 unmatched 항목이 있어 write를 중단했습니다.");
  }
  const result = await applyHealthScreeningTypeBackfill({ db, plan, importedAt: new Date().toISOString() });
  console.log(JSON.stringify({ mode: "WRITE_RESULT", migrationId: plan.migrationId, result }, null, 2));
}
