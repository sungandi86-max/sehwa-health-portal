import process from "node:process";
import { getFirestore } from "firebase-admin/firestore";
import { initializeFirebaseAdmin, loadLocalEnv } from "./lib/firebaseAdminCli.mjs";
import { runStaffSubmissionStatusSync } from "./lib/staffSubmissionStatusSync.mjs";

const taskConfig = {
  taskId: "cpr-training-2026",
  sheetName: "교직원 심폐소생술 연수 이수",
  completedValue: "확인완료",
  allowNameDepartmentFallback: true,
  headers: {
    position: ["직책", "직위", "position"],
    department: ["부서", "소속부서", "소속/부서", "department"],
    realName: ["성명", "이름", "실명", "name"],
    status: ["확인상태", "상태", "status"],
  },
};

async function main() {
  loadLocalEnv();
  initializeFirebaseAdmin();
  await runStaffSubmissionStatusSync({
    db: getFirestore(),
    mode: process.argv.includes("--apply") ? "apply" : "dry-run",
    taskConfig,
  });
}

// no-excuse-ok: catch - CLI boundary prints concise sync failure.
main().catch((error) => {
  console.error("CPR training status sync failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
