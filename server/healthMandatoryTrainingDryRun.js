import { FieldValue } from "firebase-admin/firestore";
import { buildSnapshotPlan, healthColumnMode, summarizePlan, summarizeResearchRows } from "./healthMandatoryTrainingAnalysis.js";
import { readGoogleSheetValues, readStaffDirectory } from "../api/lib/staffDirectory.js";

const RESEARCH_SPREADSHEET_ID = "1rn4CVt41lq2f_o8Uiodij4h_R4Q9lVbpPMNFJjy6-IM";
const RESEARCH_SHEET_NAME = "법정의무연수 묶음과정";
const RESEARCH_RANGE = `${RESEARCH_SHEET_NAME}!A1:Z1000`;
const TASK_ID = "health-mandatory-training-2026";

function buildSummary(source, plan) {
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
      matched: plan.matched,
      unmatched: plan.unmatched,
      ambiguous: plan.ambiguous,
      duplicateStaffIds: plan.duplicateStaffIds,
      duplicateCanonicalStaffIds: plan.duplicateCanonicalStaffIds,
      matchCriteria: plan.matchCriteria,
      issueReasons: plan.issueReasons,
    },
    status: {
      completed: plan.completed,
      incomplete: plan.incomplete,
      unknown: plan.unknown,
      completedRule: "이수상태 == 이수완료",
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

async function getResearchTrainingSummary() {
  const [directoryResult, researchValues] = await Promise.all([
    readStaffDirectory(),
    readGoogleSheetValues({ spreadsheetId: RESEARCH_SPREADSHEET_ID, range: RESEARCH_RANGE }),
  ]);
  const source = summarizeResearchRows(researchValues);
  const plan = summarizePlan(source.rows, directoryResult.directory);
  return { directory: directoryResult.directory, source, plan, summary: buildSummary(source, plan) };
}

function assertSafeApply(source, plan, snapshotPlan) {
  const hasRequiredHeaders =
    source.headerInfo.parseStatus === "success" &&
    source.headerInfo.indexes.realName !== null &&
    source.headerInfo.indexes.position !== null &&
    source.headerInfo.indexes.status !== null;

  if (!hasRequiredHeaders) throw new Error("연구부 연수 시트 헤더를 확인할 수 없습니다.");
  if (source.stats.validRows <= 0) throw new Error("반영할 연구부 연수 행이 없습니다.");
  if (plan.matched !== source.stats.validRows) throw new Error("매칭되지 않은 연구부 연수 행이 있습니다.");
  if (plan.unmatched !== 0 || plan.ambiguous !== 0) throw new Error("연구부 연수 매칭 결과를 먼저 확인해야 합니다.");
  if (plan.duplicateStaffIds !== 0 || snapshotPlan.duplicateStaffIds !== 0) throw new Error("중복 staffId가 있어 반영할 수 없습니다.");
  if (snapshotPlan.docs.length !== source.stats.validRows) throw new Error("반영 대상 문서 수가 유효 행 수와 다릅니다.");
}

export async function runHealthMandatoryTrainingDryRun() {
  const { summary } = await getResearchTrainingSummary();
  return summary;
}

export async function applyHealthMandatoryTrainingSnapshot({ db }) {
  const { directory, source, plan, summary } = await getResearchTrainingSummary();
  const snapshotPlan = buildSnapshotPlan(source.rows, directory);
  assertSafeApply(source, plan, snapshotPlan);

  const taskSnapshot = await db.collection("staff_submission_tasks").doc(TASK_ID).get();
  if (!taskSnapshot.exists) throw new Error("보건 관련 법정의무연수 task 정의가 없습니다.");
  if (taskSnapshot.data()?.enabled !== true) throw new Error("보건 관련 법정의무연수 task가 활성화되어 있지 않습니다.");

  const existingSnapshot = await db.collection("staff_submission_status").where("taskId", "==", TASK_ID).get();
  const sourceStaffIds = new Set(snapshotPlan.docs.map((item) => item.data.staffId));
  const orphanSnapshots = existingSnapshot.docs.filter((doc) => !sourceStaffIds.has(doc.data()?.staffId)).length;
  const batch = db.batch();
  snapshotPlan.docs.forEach((item) => {
    batch.set(db.collection("staff_submission_status").doc(item.id), {
      ...item.data,
      syncedAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();

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
    },
  };
}
