import { FieldValue } from "firebase-admin/firestore";
import {
  buildSnapshotPlan,
  healthColumnMode,
  summarizePlan,
  summarizeResearchRows,
  summarizeSourceOnlyExceptions,
} from "./healthMandatoryTrainingAnalysis.js";
import { readGoogleSheetValues, readStaffDirectory } from "./lib/staffDirectory.js";

const RESEARCH_SPREADSHEET_ID = "1rn4CVt41lq2f_o8Uiodij4h_R4Q9lVbpPMNFJjy6-IM";
const HEALTH_SPREADSHEET_ID = "1ZCsztyIDuvcTzGdE4zZvexJmLuz8aNIIiuGuSyIBwbs";
const RESEARCH_SHEET_NAME = "법정의무연수 묶음과정";
const RESEARCH_RANGE = `${RESEARCH_SHEET_NAME}!A1:Z1000`;
const EXCEPTION_SHEET_NAME = "법정의무연수_예외";
const EXCEPTION_RANGE = `${EXCEPTION_SHEET_NAME}!A1:F1000`;
const TASK_ID = "health-mandatory-training-2026";
const TASK_YEAR = 2026;

function buildSummary(source, exceptions, plan, snapshotPlan, taskEnabled) {
  const applyAllowed =
    source.headerInfo.parseStatus === "success" &&
    exceptions.headerInfo.parseStatus === "success" &&
    source.stats.validRows > 0 &&
    Number(source.stats.missingNameRows || 0) === 0 &&
    plan.invalidEmploymentStatus === 0 &&
    plan.invalidExceptionRows === 0 &&
    plan.duplicateConfirmedExceptions === 0 &&
    plan.unresolvedSourceOnly === 0 &&
    plan.canonicalActiveMissingFromSource === 0 &&
    plan.ambiguous === 0 &&
    plan.duplicateStaffIds === 0 &&
    plan.duplicateCanonicalStaffIds === 0 &&
    snapshotPlan.docs.length === plan.matchedActive &&
    taskEnabled === true;
  return {
    ok: true,
    dryRun: true,
    taskId: TASK_ID,
    source: {
      spreadsheetName: "2026 세화여고 교직원 법정의무연수 이수 현황",
      sheetName: RESEARCH_SHEET_NAME,
      range: RESEARCH_RANGE,
      sheetWrite: false,
      firestoreWrite: false,
      managedScope: "보건 관련 법정의무연수",
      description: "감염병 · 4대폭력예방 · 아동학대예방 · 장애인학대예방",
    },
    exceptions: {
      sheetName: EXCEPTION_SHEET_NAME,
      parseStatus: exceptions.headerInfo.parseStatus,
      currentYearRows: exceptions.stats.currentYearRows,
      confirmedRows: exceptions.stats.confirmedRows,
      invalidRows: exceptions.stats.invalidRows,
      duplicateConfirmedRows: exceptions.stats.duplicateConfirmedRows,
    },
    headerInfo: {
      parseStatus: source.headerInfo.parseStatus,
      headerRow: source.headerInfo.headerRowIndex + 1,
      hasNameColumn: source.headerInfo.indexes.realName !== null,
      hasDepartmentColumn: source.headerInfo.indexes.department !== null,
      hasPositionColumn: source.headerInfo.indexes.position !== null,
      hasStatusColumn: source.headerInfo.indexes.status !== null,
      healthTrainingColumnMode: healthColumnMode(source.headerInfo.headers),
    },
    rows: source.stats,
    statusValues: source.statusValues,
    matching: {
      policy: ["realName_position_exact"],
      nameOnlyMatching: false,
      matched: plan.matchedActive,
      unmatched: plan.unresolvedSourceOnly,
      matchedActive: plan.matchedActive,
      excludedLeave: plan.excludedLeave,
      excludedRetired: plan.excludedRetired,
      excludedByTargetRule: plan.excludedByTargetRule,
      confirmedSourceOnlyExcluded: plan.confirmedSourceOnlyExcluded,
      unresolvedSourceOnly: plan.unresolvedSourceOnly,
      canonicalActiveMissingFromSource: plan.canonicalActiveMissingFromSource,
      ambiguous: plan.ambiguous,
      duplicateStaffIds: plan.duplicateStaffIds,
      duplicateCanonicalStaffIds: plan.duplicateCanonicalStaffIds,
      invalidEmploymentStatus: plan.invalidEmploymentStatus,
      invalidExceptionRows: plan.invalidExceptionRows,
      canonicalCurrentTarget: plan.canonicalCurrentTarget,
      matchCriteria: plan.matchCriteria,
      issueReasons: plan.issueReasons,
    },
    status: {
      completed: plan.completed,
      incomplete: plan.incomplete,
      unknown: plan.unknown,
      completedRule: "이수상태 == 이수완료",
    },
    safety: {
      applyAllowed,
      taskEnabled: taskEnabled === true,
      snapshotTargetCount: snapshotPlan.docs.length,
      blocksOnUnresolvedSourceOnly: true,
      blocksOnCanonicalActiveMissingFromSource: true,
      deletesExistingSnapshots: false,
    },
    privacy: {
      returnsRawRows: false,
      returnsNames: false,
      returnsEmails: false,
      returnsPrivateKey: false,
      returnsCompletionNumbers: false,
    },
  };
}

export async function getResearchTrainingSummary({ db } = {}) {
  const [directoryResult, researchValues, exceptionValues, taskSnapshot] = await Promise.all([
    readStaffDirectory({ allowInvalidEmploymentStatus: true }),
    readGoogleSheetValues({ spreadsheetId: RESEARCH_SPREADSHEET_ID, range: RESEARCH_RANGE }),
    readGoogleSheetValues({
      spreadsheetId: process.env.STAFF_ROSTER_SOURCE_SPREADSHEET_ID || HEALTH_SPREADSHEET_ID,
      range: EXCEPTION_RANGE,
    }),
    db ? db.collection("staff_submission_tasks").doc(TASK_ID).get() : Promise.resolve(null),
  ]);
  const source = summarizeResearchRows(researchValues);
  const exceptions = summarizeSourceOnlyExceptions(exceptionValues, TASK_YEAR);
  const plan = summarizePlan(source.rows, directoryResult.directory, exceptions, { taskYear: TASK_YEAR });
  const snapshotPlan = buildSnapshotPlan(source.rows, directoryResult.directory, exceptions, { taskYear: TASK_YEAR });
  const taskEnabled = taskSnapshot ? taskSnapshot.exists && taskSnapshot.data()?.enabled === true : null;
  return {
    directory: directoryResult.directory,
    directoryStats: directoryResult.stats,
    source,
    exceptions,
    plan,
    snapshotPlan,
    taskSnapshot,
    summary: buildSummary(source, exceptions, plan, snapshotPlan, taskEnabled),
  };
}

export function assertSafeApply(source, exceptions, plan, snapshotPlan, taskEnabled) {
  const hasRequiredHeaders =
    source.headerInfo.parseStatus === "success" &&
    source.headerInfo.indexes.realName !== null &&
    source.headerInfo.indexes.position !== null &&
    source.headerInfo.indexes.status !== null;

  if (!hasRequiredHeaders) throw new Error("연구부 연수 시트 헤더를 확인할 수 없습니다.");
  if (exceptions.headerInfo.parseStatus !== "success") throw new Error("법정의무연수 예외 시트 헤더를 확인할 수 없습니다.");
  if (source.stats.validRows <= 0) throw new Error("반영할 연구부 연수 행이 없습니다.");
  if (Number(source.stats.missingNameRows || 0) !== 0) {
    throw new Error("연구부 연수 시트에 성명 또는 직책이 누락된 행이 있습니다.");
  }
  if (plan.invalidEmploymentStatus !== 0) throw new Error("교직원명단의 재직상태를 먼저 확인해야 합니다.");
  if (plan.invalidExceptionRows !== 0 || plan.duplicateConfirmedExceptions !== 0) {
    throw new Error("법정의무연수 예외 목록을 먼저 확인해야 합니다.");
  }
  if (plan.unresolvedSourceOnly !== 0) throw new Error("확인되지 않은 연구부 연수 source-only 행이 있습니다.");
  if (plan.canonicalActiveMissingFromSource !== 0) throw new Error("연구부 명단에 없는 현재 재직 대상자가 있습니다.");
  if (plan.ambiguous !== 0) throw new Error("연구부 연수 매칭 결과를 먼저 확인해야 합니다.");
  if (plan.duplicateStaffIds !== 0 || snapshotPlan.duplicateStaffIds !== 0) throw new Error("중복 staffId가 있어 반영할 수 없습니다.");
  if (plan.duplicateCanonicalStaffIds !== 0) throw new Error("교직원명단에 중복 staffId가 있어 반영할 수 없습니다.");
  if (taskEnabled !== true) throw new Error("보건 관련 법정의무연수 task가 활성화되어 있지 않습니다.");
  if (snapshotPlan.docs.length !== plan.matchedActive) throw new Error("반영 대상 문서 수가 현재 재직 매칭 수와 다릅니다.");
}

export async function runHealthMandatoryTrainingDryRun({ db } = {}) {
  const { summary } = await getResearchTrainingSummary({ db });
  return summary;
}

export async function getHealthMandatoryTrainingCurrentTargets({ db }) {
  const { snapshotPlan, summary } = await getResearchTrainingSummary({ db });

  return {
    currentTargetStaffIds: snapshotPlan.docs.map((item) => item.data.staffId),
    targetCount: snapshotPlan.docs.length,
    reconciliationSafe: summary.safety.applyAllowed,
  };
}

export async function writeSnapshotPlan({ db, docs }) {
  const batch = db.batch();
  docs.forEach((item) => {
    batch.set(db.collection("staff_submission_status").doc(item.id), {
      ...item.data,
      syncedAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function applyHealthMandatoryTrainingSnapshot({ db }) {
  const { source, exceptions, plan, snapshotPlan, taskSnapshot, summary } = await getResearchTrainingSummary({ db });
  const taskEnabled = taskSnapshot?.exists && taskSnapshot.data()?.enabled === true;
  assertSafeApply(source, exceptions, plan, snapshotPlan, taskEnabled);

  if (!taskSnapshot.exists) throw new Error("보건 관련 법정의무연수 task 정의가 없습니다.");
  if (taskSnapshot.data()?.enabled !== true) throw new Error("보건 관련 법정의무연수 task가 활성화되어 있지 않습니다.");

  const existingSnapshot = await db.collection("staff_submission_status").where("taskId", "==", TASK_ID).get();
  const sourceStaffIds = new Set(snapshotPlan.docs.map((item) => item.data.staffId));
  const orphanSnapshots = existingSnapshot.docs.filter((doc) => !sourceStaffIds.has(doc.data()?.staffId)).length;
  const syncedAt = new Date().toISOString();
  await writeSnapshotPlan({ db, docs: snapshotPlan.docs });

  return {
    ...summary,
    dryRun: false,
    source: {
      ...summary.source,
      firestoreWrite: true,
    },
    apply: {
      docsWritten: snapshotPlan.docs.length,
      orphanSnapshots,
      deletedSnapshots: 0,
      sheetWrite: false,
      firestoreWrite: true,
      syncedAt,
    },
  };
}
