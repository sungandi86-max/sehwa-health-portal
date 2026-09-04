import process from "node:process";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { JWT } from "google-auth-library";
import { initializeFirebaseAdmin, loadLocalEnv, readServiceAccountJson } from "./lib/firebaseAdminCli.mjs";

const DEFAULT_SPREADSHEET_ID = "1ZCsztyIDuvcTzGdE4zZvexJmLuz8aNIIiuGuSyIBwbs";
const ROSTER_SHEET_NAME = "교직원명단";
const TB_SHEET_NAME = "교직원 결핵검진현황";
const ROSTER_RANGE = `${ROSTER_SHEET_NAME}!A1:Z1000`;
const TB_RANGE = `${TB_SHEET_NAME}!A1:Z1000`;
const TASK_ID = "tb-screening-2026";
const SOURCE_TYPE = "health_sheet";
const COMPLETED_VALUE = "검진완료";
const isApplyMode = process.argv.includes("--apply");

const PROHIBITED_STATUS_KEYS = new Set([
  "name",
  "realName",
  "displayName",
  "email",
  "hospital",
  "hospitalName",
  "screeningDate",
  "checkupDate",
  "검진일",
  "검진유형",
  "응답상태",
  "비고",
  "memo",
  "note",
  "row",
  "rowData",
  "sourceRow",
]);

const ROSTER_HEADERS = {
  staffId: ["교직원ID", "교직원Id", "직원ID", "직원Id", "staffId", "staff_id"],
  position: ["직책", "직위", "position"],
  realName: ["성명", "이름", "실명", "name"],
  department: ["소속부서", "부서", "소속/부서", "department"],
  target: ["제출대상", "대상", "target"],
};

const TB_HEADERS = {
  position: ["직책", "직위", "position"],
  department: ["부서", "소속부서", "소속/부서", "department"],
  realName: ["성명", "이름", "실명", "name"],
  status: ["검진상태", "상태", "status"],
};

function text(value) {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  return normalized || null;
}

function headerKey(value) {
  return text(value)?.replace(/\s+/g, "").toLowerCase() || "";
}

function exactText(value) {
  return text(value)?.replace(/\s+/g, " ") || "";
}

function targetEnabled(value) {
  const normalized = headerKey(value);
  if (!normalized) return true;
  return !["false", "n", "no", "0", "제외", "미대상", "퇴직", "전출"].includes(normalized);
}

function findHeaderIndex(headers, aliases) {
  const normalizedHeaders = headers.map((header) => headerKey(header));
  for (const alias of aliases) {
    const headerIndex = normalizedHeaders.indexOf(headerKey(alias));
    if (headerIndex !== -1) return headerIndex;
  }
  return -1;
}

function findHeaderRow(rows, aliasesByField, requiredFields) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const indexes = {};
    for (const [field, aliases] of Object.entries(aliasesByField)) {
      const index = findHeaderIndex(row, aliases);
      indexes[field] = index === -1 ? null : index;
    }

    if (requiredFields.every((field) => indexes[field] !== null)) {
      return { headerRowIndex: rowIndex, indexes };
    }
  }

  throw new Error(`필수 헤더를 찾지 못했습니다: ${requiredFields.join(", ")}`);
}

function cell(row, indexes, key) {
  const index = indexes[key];
  return index === null || index === undefined ? null : text(row[index]);
}

function addUnique(index, key, value) {
  if (!key) return;
  const existing = index.get(key) || [];
  existing.push(value);
  index.set(key, existing);
}

async function readSheetValues(range) {
  const serviceAccount = readServiceAccountJson();
  const auth = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const spreadsheetId = process.env.STAFF_ROSTER_SOURCE_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const response = await auth.request({ url });
  return Array.isArray(response.data.values) ? response.data.values : [];
}

function normalizeRoster(values) {
  const { headerRowIndex, indexes } = findHeaderRow(values, ROSTER_HEADERS, ["staffId", "position", "realName"]);
  const rows = [];
  const stats = {
    sourceRows: Math.max(values.length - headerRowIndex - 1, 0),
    validRows: 0,
    targetRows: 0,
    missingStaffIdRows: 0,
    missingNameRows: 0,
    duplicateStaffIds: 0,
  };
  const staffIdCounts = new Map();

  values.slice(headerRowIndex + 1).forEach((row) => {
    const staffId = cell(row, indexes, "staffId");
    const realName = cell(row, indexes, "realName");
    if (!staffId && !realName) return;
    if (!staffId) {
      stats.missingStaffIdRows += 1;
      return;
    }
    if (!realName) {
      stats.missingNameRows += 1;
      return;
    }

    const item = {
      staffId,
      realName,
      position: cell(row, indexes, "position"),
      department: cell(row, indexes, "department"),
      target: cell(row, indexes, "target"),
    };
    rows.push(item);
    stats.validRows += 1;
    if (targetEnabled(item.target)) stats.targetRows += 1;
    staffIdCounts.set(item.staffId, (staffIdCounts.get(item.staffId) || 0) + 1);
  });

  stats.duplicateStaffIds = [...staffIdCounts.values()].filter((count) => count > 1).length;
  return { rows, stats };
}

function normalizeTbRows(values) {
  const { headerRowIndex, indexes } = findHeaderRow(values, TB_HEADERS, ["position", "realName", "status"]);
  const rows = [];

  values.slice(headerRowIndex + 1).forEach((row) => {
    const realName = cell(row, indexes, "realName");
    const position = cell(row, indexes, "position");
    if (!realName && !position) return;

    rows.push({
      realName,
      position,
      department: cell(row, indexes, "department"),
      screeningStatus: cell(row, indexes, "status"),
    });
  });

  return {
    rows,
    stats: {
      sourceRows: Math.max(values.length - headerRowIndex - 1, 0),
      dataRows: rows.length,
    },
  };
}

function buildRosterIndexes(rosterRows) {
  const byNamePosition = new Map();
  const byNamePositionDepartment = new Map();

  rosterRows.forEach((row) => {
    const namePosition = `${exactText(row.realName)}|${exactText(row.position)}`;
    const namePositionDepartment = `${namePosition}|${exactText(row.department)}`;
    addUnique(byNamePosition, namePosition, row);
    addUnique(byNamePositionDepartment, namePositionDepartment, row);
  });

  return { byNamePosition, byNamePositionDepartment };
}

function uniqueLookup(index, key) {
  if (!key) return { status: "missing", match: null };
  const matches = index.get(key) || [];
  if (matches.length === 1) return { status: "matched", match: matches[0] };
  if (matches.length > 1) return { status: "ambiguous", match: null };
  return { status: "missing", match: null };
}

function resolveStaffId(tbRow, rosterIndexes) {
  const namePosition = `${exactText(tbRow.realName)}|${exactText(tbRow.position)}`;
  const primary = uniqueLookup(rosterIndexes.byNamePosition, namePosition);
  if (primary.status === "matched") return { kind: "matched", match: primary.match, criterion: "realName_position_exact" };
  if (primary.status === "missing") return { kind: "unmatched", match: null, criterion: "realName_position_exact" };

  const namePositionDepartment = `${namePosition}|${exactText(tbRow.department)}`;
  const secondary = uniqueLookup(rosterIndexes.byNamePositionDepartment, namePositionDepartment);
  if (secondary.status === "matched") {
    return { kind: "matched", match: secondary.match, criterion: "realName_position_department_exact" };
  }

  return {
    kind: secondary.status === "ambiguous" ? "ambiguous" : "ambiguous",
    match: null,
    criterion: secondary.status === "matched" ? "realName_position_department_exact" : "realName_position_exact",
  };
}

function buildStatusDoc(staffId, status) {
  return {
    staffId,
    taskId: TASK_ID,
    status,
    sourceType: SOURCE_TYPE,
    sourceUpdatedAt: null,
    syncedAt: FieldValue.serverTimestamp(),
  };
}

function assertNoProhibitedKeys(payload) {
  const keys = Object.keys(payload);
  const found = keys.filter((key) => PROHIBITED_STATUS_KEYS.has(key));
  if (found.length) {
    throw new Error(`Projection payload contains prohibited keys: ${found.join(", ")}`);
  }
}

function makeStatusPlan(tbRows, rosterRows) {
  const rosterIndexes = buildRosterIndexes(rosterRows);
  const plannedByStaffId = new Map();
  const unmatched = [];
  const ambiguous = [];
  const duplicateStaffIds = new Set();
  const criteria = {};

  tbRows.forEach((tbRow) => {
    const resolved = resolveStaffId(tbRow, rosterIndexes);
    if (resolved.kind === "unmatched") {
      unmatched.push(resolved);
      return;
    }
    if (resolved.kind === "ambiguous") {
      ambiguous.push(resolved);
      return;
    }

    const staffId = resolved.match.staffId;
    const status = exactText(tbRow.screeningStatus) === COMPLETED_VALUE ? "completed" : "incomplete";
    const payload = buildStatusDoc(staffId, status);
    assertNoProhibitedKeys(payload);

    if (plannedByStaffId.has(staffId)) {
      duplicateStaffIds.add(staffId);
      return;
    }

    plannedByStaffId.set(staffId, { staffId, docId: `${staffId}_${TASK_ID}`, payload });
    criteria[resolved.criterion] = (criteria[resolved.criterion] || 0) + 1;
  });

  return {
    writes: [...plannedByStaffId.values()],
    unmatched,
    ambiguous,
    duplicateStaffIds: [...duplicateStaffIds],
    criteria,
  };
}

async function readExistingTbStatus(db) {
  const snapshot = await db.collection("staff_submission_status").where("taskId", "==", TASK_ID).limit(1000).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function applyStatusPlan(db, writes) {
  const batch = db.batch();
  writes.forEach(({ docId, payload }) => {
    batch.set(db.collection("staff_submission_status").doc(docId), payload, { merge: true });
  });
  await batch.commit();
}

function statusCounts(writes) {
  return writes.reduce((acc, { payload }) => {
    acc[payload.status] = (acc[payload.status] || 0) + 1;
    return acc;
  }, {});
}

function summarize({ mode, roster, tb, plan, existingTbStatus }) {
  const plannedStaffIds = new Set(plan.writes.map((write) => write.staffId));
  const orphanExisting = existingTbStatus.filter((doc) => !plannedStaffIds.has(doc.staffId));
  const counts = statusCounts(plan.writes);

  return {
    mode,
    taskId: TASK_ID,
    collection: "staff_submission_status",
    source: {
      spreadsheetName: "2026학년도 보건실 업무",
      rosterSheetName: ROSTER_SHEET_NAME,
      tbSheetName: TB_SHEET_NAME,
      sheetWrite: false,
    },
    roster: {
      sourceRows: roster.stats.sourceRows,
      validRows: roster.stats.validRows,
      targetRows: roster.stats.targetRows,
      duplicateStaffIds: roster.stats.duplicateStaffIds,
    },
    tb: {
      sourceRows: tb.stats.sourceRows,
      dataRows: tb.stats.dataRows,
      matched: plan.writes.length,
      unmatched: plan.unmatched.length,
      ambiguous: plan.ambiguous.length,
      duplicateMatchedStaffIds: plan.duplicateStaffIds.length,
      completed: counts.completed || 0,
      incomplete: counts.incomplete || 0,
      plannedWrites: plan.writes.length,
      existingTbStatusDocs: existingTbStatus.length,
      orphanExistingDocs: orphanExisting.length,
      matchCriteria: plan.criteria,
    },
    privacy: {
      prohibitedProjectionKeysFound: 0,
      storesNames: false,
      storesEmail: false,
      storesScreeningDate: false,
      storesScreeningType: false,
      storesMemo: false,
      storesSourceRow: false,
    },
    safety: {
      applyAllowed: roster.stats.duplicateStaffIds === 0 && plan.ambiguous.length === 0 && plan.duplicateStaffIds.length === 0,
      deletesOrphans: false,
      writesOnlyTaskId: TASK_ID,
      deterministicDocId: "{staffId}_tb-screening-2026",
    },
  };
}

async function main() {
  loadLocalEnv();
  initializeFirebaseAdmin();

  const [rosterValues, tbValues] = await Promise.all([
    readSheetValues(ROSTER_RANGE),
    readSheetValues(TB_RANGE),
  ]);
  const roster = normalizeRoster(rosterValues);
  const tb = normalizeTbRows(tbValues);
  const plan = makeStatusPlan(tb.rows, roster.rows);
  const db = getFirestore();
  const existingTbStatus = await readExistingTbStatus(db);
  const summary = summarize({ mode: isApplyMode ? "apply" : "dry-run", roster, tb, plan, existingTbStatus });

  console.log(JSON.stringify(summary, null, 2));

  if (!summary.safety.applyAllowed) {
    throw new Error("ambiguous, duplicate staffId, or duplicate source match가 있어 apply를 중단합니다.");
  }

  if (isApplyMode) {
    await applyStatusPlan(db, plan.writes);
    console.log("TB screening status sync apply completed.");
  } else {
    console.log("Dry-run only. Firestore 변경 없음. 실제 반영은 --apply를 사용하세요.");
  }
}

// no-excuse-ok: catch - CLI boundary prints concise sync failure.
main().catch((error) => {
  console.error("TB screening status sync failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
