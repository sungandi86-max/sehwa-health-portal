import process from "node:process";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { initializeFirebaseAdmin, loadLocalEnv } from "./lib/firebaseAdminCli.mjs";
import { readSheetValues } from "./lib/staffRosterSheet.mjs";

const TASK_ID = "cpr-training-2026";
const SOURCE_SHEET = "교직원 심폐소생술 연수 이수";
const LEGACY_SOURCE = "staff_cpr_training_sheet_2026";
const MANUAL_ROW_OVERRIDES = new Map([[93, "T078"]]);
const apply = process.argv.includes("--apply");

const text = (value) => String(value ?? "").normalize("NFKC").trim();
const key = (value) => text(value).replace(/\s+/g, "").toLowerCase();
const findHeaderRow = (rows, aliases) => rows.findIndex((row) => row.some((cell) => aliases.includes(key(cell))));
const findColumn = (header, aliases) => aliases.map(key).map((alias) => header.map(key).indexOf(alias)).find((index) => index >= 0) ?? -1;

function legacyMethod(value) {
  const normalized = text(value).replace(/\s+/g, "");
  if (normalized.includes("학교단체")) return "group";
  if (normalized.includes("개별") || normalized.includes("외부")) return "individual";
  return "unknown";
}

function legacyStatus(value) {
  return text(value) === "확인완료" ? "completed" : "unknown";
}

loadLocalEnv();
initializeFirebaseAdmin();

const [legacyValues, rosterValues] = await Promise.all([
  readSheetValues(`'${SOURCE_SHEET}'!A1:Z1000`),
  readSheetValues("'교직원명단'!A1:Z1000"),
]);
const legacyHeaderIndex = findHeaderRow(legacyValues, ["성명", "이름"]);
const rosterHeaderIndex = findHeaderRow(rosterValues, ["교직원id", "staffid"]);
if (legacyHeaderIndex < 0 || rosterHeaderIndex < 0) throw new Error("CPR migration source header is not ready.");
const legacyHeader = legacyValues[legacyHeaderIndex].map(text);
const rosterHeader = rosterValues[rosterHeaderIndex].map(text);
const legacyColumns = {
  name: findColumn(legacyHeader, ["성명", "이름"]),
  method: findColumn(legacyHeader, ["이수방법"]),
  status: findColumn(legacyHeader, ["확인상태", "상태"]),
  note: findColumn(legacyHeader, ["비고"]),
};
const rosterColumns = {
  staffId: findColumn(rosterHeader, ["교직원ID", "staffId"]),
  name: findColumn(rosterHeader, ["성명", "이름"]),
};
if (Object.values(legacyColumns).slice(0, 3).some((index) => index < 0) || Object.values(rosterColumns).some((index) => index < 0)) {
  throw new Error("CPR migration source columns are not ready.");
}

const rosterByName = new Map();
for (const row of rosterValues.slice(rosterHeaderIndex + 1)) {
  const staffId = text(row[rosterColumns.staffId]);
  const name = text(row[rosterColumns.name]);
  if (staffId && name) rosterByName.set(name, [...(rosterByName.get(name) || []), staffId]);
}

const rows = legacyValues.slice(legacyHeaderIndex + 1).map((row, offset) => ({ row, sourceRow: legacyHeaderIndex + offset + 2 }))
  .filter(({ row }) => row.some((cell) => text(cell)));
const mappings = rows.map(({ row, sourceRow }) => {
  const name = text(row[legacyColumns.name]);
  const candidates = rosterByName.get(name) || [];
  const staffId = candidates.length === 1 ? candidates[0] : MANUAL_ROW_OVERRIDES.get(sourceRow) || "";
  if (!staffId || !candidates.includes(staffId)) throw new Error(`CPR migration mapping is unresolved at source row ${sourceRow}.`);
  return {
    staffId,
    sourceRow,
    status: legacyStatus(row[legacyColumns.status]),
    completionMethod: legacyMethod(row[legacyColumns.method]),
    evidenceStatus: text(row[legacyColumns.status]),
    note: legacyColumns.note >= 0 ? text(row[legacyColumns.note]) : "",
  };
});

if (mappings.length !== 94 || new Set(mappings.map((item) => item.staffId)).size !== mappings.length) {
  throw new Error("CPR migration requires 94 unique canonical staff IDs.");
}

const db = getFirestore();
const existingSnapshot = await db.collection("staff_submission_status").where("taskId", "==", TASK_ID).get();
const existingByStaffId = new Map(existingSnapshot.docs.map((doc) => [text(doc.data().staffId), { ref: doc.ref, data: doc.data() }]));
const plan = mappings.map((mapping) => {
  const existing = existingByStaffId.get(mapping.staffId);
  if (existing && existing.data.status === "completed" && mapping.status !== "completed") {
    return { action: "update", mapping, existing, preserveCompleted: true };
  }
  return { action: existing ? "update" : "create", mapping, existing, preserveCompleted: false };
});
const conflicts = plan.filter(({ existing, mapping }) => existing && existing.data.taskId !== TASK_ID || mapping.status === "completed" && mapping.completionMethod === "unknown");
const summary = {
  approved: mappings.length,
  create: plan.filter((item) => item.action === "create").length,
  update: plan.filter((item) => item.action === "update").length,
  skip: 0,
  conflict: conflicts.length,
  preservedCompleted: plan.filter((item) => item.preserveCompleted).length,
  apply,
};
if (conflicts.length) {
  console.log(JSON.stringify(summary));
  process.exitCode = 2;
} else if (!apply) {
  console.log(JSON.stringify(summary));
} else {
  const writer = db.bulkWriter();
  for (const item of plan) {
    const { mapping, existing } = item;
    const currentTraining = existing?.data?.training && typeof existing.data.training === "object" ? existing.data.training : {};
    const training = {
      ...currentTraining,
      ...(!currentTraining.completionMethod && mapping.completionMethod !== "unknown" ? { completionMethod: mapping.completionMethod } : {}),
      ...(!currentTraining.evidenceStatus && mapping.evidenceStatus ? { evidenceStatus: mapping.evidenceStatus } : {}),
      ...(!currentTraining.note && mapping.note ? { note: mapping.note } : {}),
    };
    const payload = {
      staffId: mapping.staffId,
      taskId: TASK_ID,
      ...(!existing ? { status: mapping.status, sourceType: "legacy_sheet_migration" } : {}),
      ...(Object.keys(training).length ? { training } : {}),
      legacyImported: true,
      legacySource: LEGACY_SOURCE,
      legacyImportedAt: FieldValue.serverTimestamp(),
      sourceSheetName: SOURCE_SHEET,
      legacySourceRow: mapping.sourceRow,
      updatedAt: FieldValue.serverTimestamp(),
    };
    writer.set(db.collection("staff_submission_status").doc(`${mapping.staffId}_${TASK_ID}`), payload, { merge: true });
  }
  await writer.close();
  console.log(JSON.stringify(summary));
}
