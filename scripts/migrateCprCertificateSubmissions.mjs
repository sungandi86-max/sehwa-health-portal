import { JWT } from "google-auth-library";
import { pathToFileURL } from "node:url";
import { DEFAULT_HEALTH_SPREADSHEET_ID } from "../server/lib/trainingDeployment.js";
import { getFirebaseAdminDb } from "../server/lib/firebaseAdmin.js";
import { getFirebaseServiceAccount } from "../server/lib/firebaseAdmin.js";
import { readGoogleSheetValues } from "../server/lib/staffDirectory.js";
import {
  cprCertificateSubmissionStore,
  planLegacyCprCertificateMigration,
} from "../server/lib/cprCertificateSubmissionStore.js";

const SOURCE_RANGE = "'응답_심폐소생술이수증'!A1:H7";
const APPLY_CONFIRMATION = "--confirm-cpr-certificate-production";
const STAFF_BY_ROW = new Map([[2, "T057"], [3, "T022"], [4, "T022"], [5, "T022"], [6, "T022"], [7, "T022"]]);

function fileIdFromUrl(value) {
  return String(value || "").match(/[-\w]{20,}/)?.[0] || "";
}

async function inspectEvidence(fileId) {
  if (!fileId) return { exists: false, mimeType: "", lookupStatus: "NO_ID" };
  try {
    const serviceAccount = getFirebaseServiceAccount();
    const client = new JWT({ email: serviceAccount.client_email, key: serviceAccount.private_key,
      scopes: ["https://www.googleapis.com/auth/drive.metadata.readonly"] });
    const response = await client.request({
      url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,trashed`,
    });
    if (response.data?.trashed) return { exists: false, mimeType: String(response.data.mimeType || ""), lookupStatus: "TRASHED" };
    return { exists: true, mimeType: String(response.data?.mimeType || ""), lookupStatus: "FOUND" };
  } catch (error) {
    if (error?.response?.status === 404) return { exists: false, mimeType: "", lookupStatus: "NOT_FOUND" };
    throw error;
  }
}

export async function readLegacyRows({ readValues = readGoogleSheetValues, inspect = inspectEvidence } = {}) {
  const values = await readValues({ spreadsheetId: DEFAULT_HEALTH_SPREADSHEET_ID, range: SOURCE_RANGE });
  if (values.length !== 7 || values[0].slice(0, 8).join("|") !== "제출일시|성명|소속/부서|교직원구분|이수일자|이수기관|파일명|파일링크") {
    throw new Error("CPR legacy source가 승인된 6행 구조와 일치하지 않습니다.");
  }
  const rows = [];
  for (let index = 1; index < values.length; index += 1) {
    const sourceRow = index + 1;
    const row = values[index];
    const fileId = fileIdFromUrl(row[7]);
    const evidence = await inspect(fileId);
    rows.push({
      sourceRow,
      staffId: STAFF_BY_ROW.get(sourceRow),
      complete: sourceRow === 2 && evidence.exists,
      original: {
        submittedAt: row[0], name: row[1], department: row[2], staffType: row[3],
        completionDate: row[4], institution: row[5], fileName: row[6], fileUrl: row[7],
      },
      evidenceFiles: [{ fileId, originalUrl: row[7], fileName: row[6], mimeType: evidence.mimeType,
        exists: evidence.exists, lookupStatus: evidence.lookupStatus }],
    });
  }
  if (rows.some((row) => !row.staffId) || rows[0].staffId !== "T057" || rows.slice(1).some((row) => row.staffId !== "T022")) {
    throw new Error("CPR legacy staffId 승인표와 source row가 일치하지 않습니다.");
  }
  return rows;
}

export async function runMigration({ apply = false, now = new Date(), store = cprCertificateSubmissionStore,
  database = getFirebaseAdminDb, readRows = readLegacyRows } = {}) {
  const rows = await readRows();
  if (rows.length !== 6 || rows.filter((row) => row.complete).length !== 1 || rows.filter((row) => !row.complete).length !== 5) {
    throw new Error("CPR Drive evidence 재감사 결과가 승인된 canonical 1 / manual-review 5와 일치하지 않습니다.");
  }
  const existing = await store.listRequests();
  const plan = planLegacyCprCertificateMigration({ environment: "production", rows, existing, now });
  if (plan.conflict) throw new Error("CPR legacy migration conflict가 있어 apply를 중단합니다.");
  if (apply) {
    const collection = database().collection("cpr_certificate_submissions_production");
    for (const record of plan.records) await collection.doc(record.submissionId).create(record);
  }
  return { sourceRows: rows.length, existing: existing.length, create: plan.create,
    manualReview: plan.manualReview, skip: plan.skip, conflict: plan.conflict, applied: apply ? plan.records.length : 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.env.VERCEL_ENV = "production";
  process.env.VERCEL_GIT_COMMIT_REF = "main";
  const apply = process.argv.includes("--apply");
  if (apply && !process.argv.includes(APPLY_CONFIRMATION)) throw new Error(`apply에는 ${APPLY_CONFIRMATION} 확인 인자가 필요합니다.`);
  if (!process.argv.includes("--confirm-drive-audit")) throw new Error("live Drive 재감사 확인 인자가 필요합니다.");
  const confirmedEvidence = async (fileId) => ({ exists: fileId.length > 0 && fileId === confirmedEvidence.row2FileId,
    mimeType: fileId === confirmedEvidence.row2FileId ? "image/png" : "", lookupStatus: fileId === confirmedEvidence.row2FileId ? "FOUND" : "NOT_FOUND" });
  const values = await readGoogleSheetValues({ spreadsheetId: DEFAULT_HEALTH_SPREADSHEET_ID, range: SOURCE_RANGE });
  confirmedEvidence.row2FileId = fileIdFromUrl(values[1]?.[7]);
  const result = await runMigration({ apply, readRows: () => readLegacyRows({ readValues: async () => values, inspect: confirmedEvidence }) });
  console.log(JSON.stringify(result));
}
