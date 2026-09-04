import { healthColumnMode, summarizePlan, summarizeResearchRows } from "./healthMandatoryTrainingAnalysis.js";
import { readGoogleSheetValues, readStaffDirectory } from "../api/lib/staffDirectory.js";

const RESEARCH_SPREADSHEET_ID = "1rn4CVt41lq2f_o8Uiodij4h_R4Q9lVbpPMNFJjy6-IM";
const RESEARCH_SHEET_NAME = "법정의무연수 묶음과정";
const RESEARCH_RANGE = `${RESEARCH_SHEET_NAME}!A1:Z1000`;

export async function runHealthMandatoryTrainingDryRun() {
  const [directoryResult, researchValues] = await Promise.all([
    readStaffDirectory(),
    readGoogleSheetValues({ spreadsheetId: RESEARCH_SPREADSHEET_ID, range: RESEARCH_RANGE }),
  ]);
  const source = summarizeResearchRows(researchValues);
  const plan = summarizePlan(source.rows, directoryResult.directory);

  return {
    ok: true,
    dryRun: true,
    taskId: "health-mandatory-training-2026",
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
      policy: ["realName_department_exact", "realName_position_exact"],
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
    },
  };
}
