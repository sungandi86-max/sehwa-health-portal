import { FieldValue } from "firebase-admin/firestore";
import { cell, exactText, findHeaderRow, normalizeRoster, readSheetValues, ROSTER_RANGE, ROSTER_SHEET_NAME } from "./staffRosterSheet.mjs";

const SOURCE_TYPE = "health_sheet";
const COLLECTION = "staff_submission_status";
const PROHIBITED_STATUS_KEYS = new Set([
  "name",
  "realName",
  "displayName",
  "email",
  "hospital",
  "hospitalName",
  "screeningDate",
  "checkupDate",
  "trainingMethod",
  "trainingPlace",
  "검진일",
  "검진유형",
  "이수방법",
  "응답상태",
  "비고",
  "memo",
  "note",
  "row",
  "rowData",
  "sourceRow",
]);

function addUnique(index, key, value) {
  if (!key) return;
  const existing = index.get(key) || [];
  existing.push(value);
  index.set(key, existing);
}

function buildRosterIndexes(rosterRows) {
  const byNamePosition = new Map();
  const byNameDepartment = new Map();
  const byNamePositionDepartment = new Map();

  rosterRows.forEach((row) => {
    const namePosition = `${exactText(row.realName)}|${exactText(row.position)}`;
    const nameDepartment = `${exactText(row.realName)}|${exactText(row.department)}`;
    const namePositionDepartment = `${namePosition}|${exactText(row.department)}`;
    addUnique(byNamePosition, namePosition, row);
    addUnique(byNameDepartment, nameDepartment, row);
    addUnique(byNamePositionDepartment, namePositionDepartment, row);
  });

  return { byNamePosition, byNameDepartment, byNamePositionDepartment };
}

function uniqueLookup(index, key) {
  if (!key) return { status: "missing", match: null };
  const matches = index.get(key) || [];
  if (matches.length === 1) return { status: "matched", match: matches[0] };
  if (matches.length > 1) return { status: "ambiguous", match: null };
  return { status: "missing", match: null };
}

function resolveStaffId(sourceRow, rosterIndexes, taskConfig) {
  const namePosition = `${exactText(sourceRow.realName)}|${exactText(sourceRow.position)}`;
  const primary = uniqueLookup(rosterIndexes.byNamePosition, namePosition);
  if (primary.status === "matched") return { kind: "matched", match: primary.match, criterion: "realName_position_exact" };

  const namePositionDepartment = `${namePosition}|${exactText(sourceRow.department)}`;
  const secondary = uniqueLookup(rosterIndexes.byNamePositionDepartment, namePositionDepartment);
  if (secondary.status === "matched") return { kind: "matched", match: secondary.match, criterion: "realName_position_department_exact" };
  if (primary.status === "ambiguous" || secondary.status === "ambiguous") {
    return { kind: "ambiguous", match: null, criterion: "realName_position_exact" };
  }

  if (taskConfig.allowNameDepartmentFallback === true) {
    const nameDepartment = `${exactText(sourceRow.realName)}|${exactText(sourceRow.department)}`;
    const tertiary = uniqueLookup(rosterIndexes.byNameDepartment, nameDepartment);
    if (tertiary.status === "matched") return { kind: "matched", match: tertiary.match, criterion: "realName_department_exact" };
    if (tertiary.status === "ambiguous") return { kind: "ambiguous", match: null, criterion: "realName_department_exact" };
  }
  return { kind: "unmatched", match: null, criterion: "realName_position_exact" };
}

function assertNoProhibitedKeys(payload) {
  const found = Object.keys(payload).filter((key) => PROHIBITED_STATUS_KEYS.has(key));
  if (found.length) throw new Error(`Projection payload contains prohibited keys: ${found.join(", ")}`);
}

function normalizeSourceRows(values, config) {
  const { headerRowIndex, indexes } = findHeaderRow({
    rows: values,
    aliasesByField: config.headers,
    requiredFields: ["position", "realName", "status"],
  });
  const rows = [];

  values.slice(headerRowIndex + 1).forEach((row) => {
    const realName = cell(row, indexes, "realName");
    const position = cell(row, indexes, "position");
    if (!realName && !position) return;
    rows.push({
      realName,
      position,
      department: cell(row, indexes, "department"),
      sourceStatus: cell(row, indexes, "status"),
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

function makeStatusPlan(taskConfig, sourceRows, rosterRows) {
  const rosterIndexes = buildRosterIndexes(rosterRows);
  const plannedByStaffId = new Map();
  const unmatched = [];
  const ambiguous = [];
  const duplicateStaffIds = new Set();
  const criteria = {};

  sourceRows.forEach((sourceRow) => {
    const resolved = resolveStaffId(sourceRow, rosterIndexes, taskConfig);
    if (resolved.kind === "unmatched") {
      unmatched.push(resolved);
      return;
    }
    if (resolved.kind === "ambiguous") {
      ambiguous.push(resolved);
      return;
    }

    const staffId = resolved.match.staffId;
    const status = exactText(sourceRow.sourceStatus) === taskConfig.completedValue ? "completed" : "incomplete";
    const payload = {
      staffId,
      taskId: taskConfig.taskId,
      status,
      sourceType: SOURCE_TYPE,
      sourceUpdatedAt: null,
      syncedAt: FieldValue.serverTimestamp(),
    };
    assertNoProhibitedKeys(payload);
    if (plannedByStaffId.has(staffId)) {
      duplicateStaffIds.add(staffId);
      return;
    }

    plannedByStaffId.set(staffId, { staffId, docId: `${staffId}_${taskConfig.taskId}`, payload });
    criteria[resolved.criterion] = (criteria[resolved.criterion] || 0) + 1;
  });

  return { writes: [...plannedByStaffId.values()], unmatched, ambiguous, duplicateStaffIds: [...duplicateStaffIds], criteria };
}

async function readExistingStatus(db, taskId) {
  const snapshot = await db.collection(COLLECTION).where("taskId", "==", taskId).limit(1000).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function applyStatusPlan(db, writes) {
  const batch = db.batch();
  writes.forEach(({ docId, payload }) => {
    batch.set(db.collection(COLLECTION).doc(docId), payload, { merge: true });
  });
  await batch.commit();
}

function statusCounts(writes) {
  return writes.reduce((acc, { payload }) => {
    acc[payload.status] = (acc[payload.status] || 0) + 1;
    return acc;
  }, {});
}

function summarizeStatusSync({ mode, taskConfig, roster, source, plan, existingStatus }) {
  const plannedStaffIds = new Set(plan.writes.map((write) => write.staffId));
  const orphanExisting = existingStatus.filter((doc) => !plannedStaffIds.has(doc.staffId));
  const counts = statusCounts(plan.writes);

  return {
    mode,
    taskId: taskConfig.taskId,
    collection: COLLECTION,
    source: {
      spreadsheetName: "2026학년도 보건실 업무",
      rosterSheetName: ROSTER_SHEET_NAME,
      sourceSheetName: taskConfig.sheetName,
      sheetWrite: false,
    },
    roster: {
      sourceRows: roster.stats.sourceRows,
      validRows: roster.stats.validRows,
      targetRows: roster.stats.targetRows,
      duplicateStaffIds: roster.stats.duplicateStaffIds,
    },
    status: {
      sourceRows: source.stats.sourceRows,
      dataRows: source.stats.dataRows,
      matched: plan.writes.length,
      unmatched: plan.unmatched.length,
      ambiguous: plan.ambiguous.length,
      duplicateMatchedStaffIds: plan.duplicateStaffIds.length,
      completed: counts.completed || 0,
      incomplete: counts.incomplete || 0,
      plannedWrites: plan.writes.length,
      existingStatusDocs: existingStatus.length,
      orphanExistingDocs: orphanExisting.length,
      matchCriteria: plan.criteria,
    },
    privacy: {
      prohibitedProjectionKeysFound: 0,
      storesNames: false,
      storesEmail: false,
      storesScreeningDate: false,
      storesTrainingMethod: false,
      storesMemo: false,
      storesSourceRow: false,
    },
    safety: {
      applyAllowed: roster.stats.duplicateStaffIds === 0 && plan.ambiguous.length === 0 && plan.duplicateStaffIds.length === 0,
      deletesOrphans: false,
      writesOnlyTaskId: taskConfig.taskId,
      deterministicDocId: `{staffId}_${taskConfig.taskId}`,
    },
  };
}

export async function runStaffSubmissionStatusSync({ db, mode, taskConfig }) {
  const [rosterValues, sourceValues] = await Promise.all([
    readSheetValues(ROSTER_RANGE),
    readSheetValues(`${taskConfig.sheetName}!A1:Z1000`),
  ]);
  const roster = normalizeRoster(rosterValues);
  const source = normalizeSourceRows(sourceValues, taskConfig);
  const plan = makeStatusPlan(taskConfig, source.rows, roster.rows);
  const existingStatus = await readExistingStatus(db, taskConfig.taskId);
  const summary = summarizeStatusSync({ mode, taskConfig, roster, source, plan, existingStatus });

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.safety.applyAllowed) {
    throw new Error("ambiguous, duplicate staffId, or duplicate source match가 있어 apply를 중단합니다.");
  }
  if (mode === "apply") {
    await applyStatusPlan(db, plan.writes);
    console.log(`${taskConfig.taskId} status sync apply completed.`);
  } else {
    console.log("Dry-run only. Firestore 변경 없음. 실제 반영은 --apply를 사용하세요.");
  }
}
