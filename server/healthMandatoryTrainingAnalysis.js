const COMPLETED_VALUE = "이수완료";
const INCOMPLETE_VALUES = new Set(["미이수", "미완료", "미수료", "미완"]);
const HEALTH_TRAINING_COLUMNS = ["감염병", "4대폭력", "아동학대", "장애인학대"];
const HEALTH_MANDATORY_TRAINING_TASK_ID = "health-mandatory-training-2026";
const ACTIVE_EMPLOYMENT_STATUS = "재직";
const LEAVE_EMPLOYMENT_STATUS = "휴직";
const RETIRED_EMPLOYMENT_STATUS = "퇴직";
const VALID_EMPLOYMENT_STATUSES = new Set([
  ACTIVE_EMPLOYMENT_STATUS,
  LEAVE_EMPLOYMENT_STATUS,
  RETIRED_EMPLOYMENT_STATUS,
]);
const HOURLY_INSTRUCTOR_POSITIONS = new Set(["강사", "시간강사"]);
const ALLOWED_EXCEPTION_REASONS = new Set(["퇴직", "전출", "기타"]);
const CONFIRMED_EXCEPTION_STATUS = "확인완료";

const RESEARCH_HEADERS = {
  sequence: ["순", "순번", "번호", "no"],
  realName: ["성명", "이름", "실명", "교직원명", "성명(한글)", "name"],
  department: ["소속부서", "부서", "부서명", "소속", "소속/부서", "department"],
  position: ["직책", "직위", "직급", "보직", "업무", "position"],
  completionNumber: ["이수번호", "이수 번호", "수료번호", "수료 번호"],
  completionDate: ["교육수료일", "수료일", "이수일"],
  status: ["이수상태", "이수여부", "수료상태", "완료여부", "이수", "상태", "status"],
};

const EXCEPTION_HEADERS = {
  year: ["적용연도", "연도", "year"],
  realName: ["성명", "이름", "실명", "name"],
  position: ["직책", "직위", "position"],
  reason: ["제외사유", "사유", "reason"],
  confirmationStatus: ["확인상태", "상태", "confirmationStatus"],
  note: ["비고", "메모", "note"],
};

function text(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function exactText(value) {
  return text(value).replace(/\s+/g, " ");
}

function headerKey(value) {
  return text(value).replace(/\s+/g, "").toLowerCase();
}

function findHeaderIndex(headers, aliases) {
  const normalizedHeaders = headers.map((header) => headerKey(header));
  for (const alias of aliases) {
    const headerIndex = normalizedHeaders.indexOf(headerKey(alias));
    if (headerIndex !== -1) return headerIndex;
  }
  return -1;
}

function findHeaderIndexes(rows, rowIndex) {
  const row = rows[rowIndex] || [];
  const nextRow = rows[rowIndex + 1] || [];
  const combinedRow = row.map((value, index) => {
    const nextValue = nextRow[index];
    return [value, nextValue].map(text).filter(Boolean).join(" ");
  });
  const indexes = {};
  const sourceRows = {};
  for (const [field, aliases] of Object.entries(RESEARCH_HEADERS)) {
    const rowIndexMatch = findHeaderIndex(row, aliases);
    const nextRowIndexMatch = findHeaderIndex(nextRow, aliases);
    const combinedIndexMatch = findHeaderIndex(combinedRow, aliases);
    const index = rowIndexMatch !== -1 ? rowIndexMatch : nextRowIndexMatch !== -1 ? nextRowIndexMatch : combinedIndexMatch;
    indexes[field] = index === -1 ? null : index;
    sourceRows[field] = rowIndexMatch !== -1 || combinedIndexMatch !== -1 ? rowIndex : nextRowIndexMatch !== -1 ? rowIndex + 1 : null;
  }
  const headerDepth = Object.values(sourceRows).some((sourceRow) => sourceRow === rowIndex + 1) ? 2 : 1;
  return { indexes, headers: combinedRow.map(text).filter(Boolean), headerDepth };
}

function findResearchHeaderRow(rows) {
  let fallback = null;
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const { indexes, headers, headerDepth } = findHeaderIndexes(rows, rowIndex);
    const foundCount = Object.values(indexes).filter((index) => index !== null).length;
    if (!fallback || foundCount > fallback.foundCount) {
      fallback = { headerRowIndex: rowIndex, dataStartRowIndex: rowIndex + headerDepth, indexes, headers, foundCount };
    }
    if (indexes.position !== null && indexes.realName !== null && indexes.status !== null) {
      return { headerRowIndex: rowIndex, dataStartRowIndex: rowIndex + headerDepth, indexes, headers, parseStatus: "success" };
    }
  }
  return {
    headerRowIndex: fallback?.headerRowIndex ?? 0,
    dataStartRowIndex: fallback?.dataStartRowIndex ?? 1,
    indexes: fallback?.indexes || Object.fromEntries(Object.keys(RESEARCH_HEADERS).map((key) => [key, null])),
    headers: fallback?.headers || [],
    parseStatus: "header_not_found",
  };
}

function cell(row, indexes, key) {
  const index = indexes[key];
  return index === null || index === undefined ? "" : text(row[index]);
}

function rawCell(row, indexes, key) {
  const index = indexes[key];
  return index === null || index === undefined ? "" : String(row[index] ?? "");
}

function normalizeStatus(value) {
  const status = exactText(value);
  if (status === COMPLETED_VALUE) return "completed";
  if (INCOMPLETE_VALUES.has(status)) return "incomplete";
  return "unknown";
}

function findExceptionHeaderRow(rows) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const indexes = {};
    for (const [field, aliases] of Object.entries(EXCEPTION_HEADERS)) {
      const index = findHeaderIndex(row, aliases);
      indexes[field] = index === -1 ? null : index;
    }
    if (
      indexes.year !== null &&
      indexes.realName !== null &&
      indexes.position !== null &&
      indexes.reason !== null &&
      indexes.confirmationStatus !== null
    ) {
      return { headerRowIndex: rowIndex, dataStartRowIndex: rowIndex + 1, indexes, parseStatus: "success" };
    }
  }
  return {
    headerRowIndex: 0,
    dataStartRowIndex: 1,
    indexes: Object.fromEntries(Object.keys(EXCEPTION_HEADERS).map((key) => [key, null])),
    parseStatus: "header_not_found",
  };
}

function exceptionKey(year, realName, position) {
  return `${Number(year)}|${exactText(realName)}|${exactText(position)}`;
}

export function summarizeSourceOnlyExceptions(values, taskYear) {
  const headerInfo = findExceptionHeaderRow(values);
  if (headerInfo.parseStatus !== "success") {
    return {
      headerInfo,
      rows: [],
      stats: { sourceRows: 0, currentYearRows: 0, confirmedRows: 0, invalidRows: 0, duplicateConfirmedRows: 0 },
    };
  }

  const rows = [];
  const confirmedKeys = new Set();
  let invalidRows = 0;
  let duplicateConfirmedRows = 0;

  values.slice(headerInfo.dataStartRowIndex).forEach((row) => {
    if (!row.some((value) => Boolean(text(value)))) return;
    const year = Number(cell(row, headerInfo.indexes, "year"));
    const realName = cell(row, headerInfo.indexes, "realName");
    const position = cell(row, headerInfo.indexes, "position");
    const reason = cell(row, headerInfo.indexes, "reason");
    const confirmationStatus = cell(row, headerInfo.indexes, "confirmationStatus");
    const isCurrentYear = year === Number(taskYear);
    const isValid =
      Number.isInteger(year) &&
      Boolean(realName) &&
      Boolean(position) &&
      ALLOWED_EXCEPTION_REASONS.has(exactText(reason)) &&
      [CONFIRMED_EXCEPTION_STATUS, "확인필요"].includes(exactText(confirmationStatus));
    const isConfirmed = isCurrentYear && isValid && exactText(confirmationStatus) === CONFIRMED_EXCEPTION_STATUS;
    const key = exceptionKey(year, realName, position);

    if (isCurrentYear && !isValid) invalidRows += 1;
    if (isConfirmed && confirmedKeys.has(key)) duplicateConfirmedRows += 1;
    if (isConfirmed) confirmedKeys.add(key);
    rows.push({ year, realName, position, reason, confirmationStatus, isCurrentYear, isValid, isConfirmed, key });
  });

  return {
    headerInfo,
    rows,
    stats: {
      sourceRows: rows.length,
      currentYearRows: rows.filter((row) => row.isCurrentYear).length,
      confirmedRows: rows.filter((row) => row.isConfirmed).length,
      invalidRows,
      duplicateConfirmedRows,
    },
  };
}

function addUnique(index, key, value) {
  if (!key.includes("|") || key.endsWith("|")) return;
  const existing = index.get(key) || [];
  existing.push(value);
  index.set(key, existing);
}

function buildDirectoryIndexes(directory) {
  const byNamePosition = new Map();
  const staffIdCounts = new Map();
  directory.forEach((item) => {
    const name = exactText(item.name);
    addUnique(byNamePosition, `${name}|${exactText(item.position)}`, item);
    staffIdCounts.set(item.staffId, (staffIdCounts.get(item.staffId) || 0) + 1);
  });
  return {
    byNamePosition,
    duplicateCanonicalStaffIds: [...staffIdCounts.values()].filter((count) => count > 1).length,
  };
}

function targetEnabled(value) {
  const normalized = headerKey(value);
  if (!normalized) return true;
  return !["false", "n", "no", "0", "제외", "미대상", "퇴직", "전출"].includes(normalized);
}

function isCurrentTarget(item) {
  return (
    exactText(item?.employmentStatus) === ACTIVE_EMPLOYMENT_STATUS &&
    targetEnabled(item?.target) &&
    !HOURLY_INSTRUCTOR_POSITIONS.has(exactText(item?.position))
  );
}

function uniqueLookup(index, key) {
  if (!key || key.endsWith("|")) return { kind: "missing" };
  const matches = index.get(key) || [];
  if (matches.length === 1) return { kind: "matched", match: matches[0] };
  if (matches.length > 1) return { kind: "ambiguous" };
  return { kind: "missing" };
}

function resolveStaff(sourceRow, indexes) {
  const name = exactText(sourceRow.realName);
  const position = exactText(sourceRow.position);
  const byPosition = uniqueLookup(indexes.byNamePosition, `${name}|${position}`);
  if (byPosition.kind === "matched") return { kind: "matched", match: byPosition.match, criterion: "realName_position_exact" };
  if (byPosition.kind === "ambiguous") return { kind: "ambiguous", criterion: "realName_position_exact" };
  return { kind: "unmatched", criterion: position ? "realName_position_exact" : "no_secondary_identifier" };
}

export function buildPlan(sourceRows, directory, exceptionSummary, taskYear) {
  const indexes = buildDirectoryIndexes(directory);
  const confirmedExceptionKeys = new Set(
    (exceptionSummary?.rows || []).filter((row) => row.isConfirmed).map((row) => row.key)
  );
  const sourceKeys = new Set();
  const matchedActiveItems = [];
  const seenStaffIds = new Set();
  const duplicateStaffIds = new Set();
  const counts = {
    matchedActive: 0,
    excludedLeave: 0,
    excludedRetired: 0,
    excludedByTargetRule: 0,
    confirmedSourceOnlyExcluded: 0,
    unresolvedSourceOnly: 0,
    canonicalActiveMissingFromSource: 0,
    ambiguous: 0,
    completed: 0,
    incomplete: 0,
    unknown: 0,
  };
  const matchCriteria = {};
  const issueReasons = {};

  sourceRows.forEach((sourceRow) => {
    const sourceKey = `${exactText(sourceRow.realName)}|${exactText(sourceRow.position)}`;
    sourceKeys.add(sourceKey);
    const resolved = resolveStaff(sourceRow, indexes);
    if (resolved.kind === "ambiguous") {
      counts.ambiguous += 1;
      issueReasons[resolved.criterion] = (issueReasons[resolved.criterion] || 0) + 1;
      return;
    }
    if (resolved.kind === "unmatched") {
      const key = exceptionKey(taskYear, sourceRow.realName, sourceRow.position);
      if (confirmedExceptionKeys.has(key)) {
        counts.confirmedSourceOnlyExcluded += 1;
      } else {
        counts.unresolvedSourceOnly += 1;
        issueReasons.source_only_unresolved = (issueReasons.source_only_unresolved || 0) + 1;
      }
      return;
    }

    const employmentStatus = exactText(resolved.match.employmentStatus);
    if (employmentStatus === LEAVE_EMPLOYMENT_STATUS) {
      counts.excludedLeave += 1;
      return;
    }
    if (employmentStatus === RETIRED_EMPLOYMENT_STATUS) {
      counts.excludedRetired += 1;
      return;
    }
    if (!isCurrentTarget(resolved.match)) {
      counts.excludedByTargetRule += 1;
      return;
    }

    counts.matchedActive += 1;
    matchCriteria[resolved.criterion] = (matchCriteria[resolved.criterion] || 0) + 1;
    if (seenStaffIds.has(resolved.match.staffId)) duplicateStaffIds.add(resolved.match.staffId);
    seenStaffIds.add(resolved.match.staffId);
    counts[normalizeStatus(sourceRow.sourceStatus)] += 1;
    matchedActiveItems.push({ sourceRow, match: resolved.match });
  });

  const canonicalActiveMissingFromSource = directory.filter((item) => {
    if (!isCurrentTarget(item)) return false;
    return !sourceKeys.has(`${exactText(item.name)}|${exactText(item.position)}`);
  });
  counts.canonicalActiveMissingFromSource = canonicalActiveMissingFromSource.length;

  return {
    ...counts,
    matchedActiveItems,
    canonicalActiveMissingFromSourceItems: canonicalActiveMissingFromSource,
    duplicateStaffIds: duplicateStaffIds.size,
    duplicateCanonicalStaffIds: indexes.duplicateCanonicalStaffIds,
    invalidEmploymentStatus: directory.filter(
      (item) => !VALID_EMPLOYMENT_STATUSES.has(exactText(item.employmentStatus))
    ).length,
    invalidExceptionRows: exceptionSummary?.stats?.invalidRows || 0,
    duplicateConfirmedExceptions: exceptionSummary?.stats?.duplicateConfirmedRows || 0,
    canonicalCurrentTarget: directory.filter(isCurrentTarget).length,
    matchCriteria,
    issueReasons,
  };
}

export function summarizeResearchRows(values) {
  const headerInfo = findResearchHeaderRow(values);
  if (headerInfo.parseStatus !== "success") {
    return {
      headerInfo,
      rows: [],
      stats: {
        sourceRows: Math.max(values.length - headerInfo.dataStartRowIndex, 0),
        validRows: 0,
        blankRows: 0,
        missingNameRows: 0,
        duplicateNames: 0,
        lecturerRows: 0,
      },
      statusValues: {},
    };
  }
  const rows = [];
  const statusValues = {};
  const nameCounts = new Map();
  let blankRows = 0;
  let missingNameRows = 0;
  let lecturerRows = 0;

  values.slice(headerInfo.dataStartRowIndex).forEach((row) => {
    if (!row.some((value) => Boolean(text(value)))) {
      blankRows += 1;
      return;
    }

    const realName = cell(row, headerInfo.indexes, "realName");
    const position = cell(row, headerInfo.indexes, "position");
    if (!realName || !position) {
      missingNameRows += 1;
      return;
    }

    const sourceStatus = cell(row, headerInfo.indexes, "status");
    const statusKey = exactText(sourceStatus) || "(blank)";
    statusValues[statusKey] = (statusValues[statusKey] || 0) + 1;
    nameCounts.set(exactText(realName), (nameCounts.get(exactText(realName)) || 0) + 1);
    if (["강사", "시간강사"].includes(exactText(position))) lecturerRows += 1;
    rows.push({
      realName,
      department: cell(row, headerInfo.indexes, "department"),
      position,
      sourceStatus,
      completionNumber: rawCell(row, headerInfo.indexes, "completionNumber"),
      completionDate: cell(row, headerInfo.indexes, "completionDate"),
    });
  });

  return {
    headerInfo,
    rows,
    stats: {
      sourceRows: Math.max(values.length - headerInfo.dataStartRowIndex, 0),
      validRows: rows.length,
      blankRows,
      missingNameRows,
      duplicateNames: [...nameCounts.values()].filter((count) => count > 1).length,
      lecturerRows,
    },
    statusValues,
  };
}

export function summarizePlan(sourceRows, directory, exceptionSummary = null, { taskYear = 2026 } = {}) {
  const plan = buildPlan(sourceRows, directory, exceptionSummary, taskYear);
  const { matchedActiveItems, canonicalActiveMissingFromSourceItems, ...summary } = plan;
  return {
    ...summary,
    matched: summary.matchedActive,
    unmatched: summary.unresolvedSourceOnly,
  };
}

export function buildSnapshotPlan(sourceRows, directory, exceptionSummary = null, { taskYear = 2026 } = {}) {
  const plan = buildPlan(sourceRows, directory, exceptionSummary, taskYear);
  const docs = [];
  const seenStaffIds = new Set();
  const duplicateStaffIds = new Set();

  plan.matchedActiveItems.forEach(({ sourceRow, match }) => {
    const staffId = match.staffId;
    if (seenStaffIds.has(staffId)) duplicateStaffIds.add(staffId);
    seenStaffIds.add(staffId);
    docs.push({
      id: `${staffId}_${HEALTH_MANDATORY_TRAINING_TASK_ID}`,
      data: {
        staffId,
        taskId: HEALTH_MANDATORY_TRAINING_TASK_ID,
        status: normalizeStatus(sourceRow.sourceStatus),
        sourceType: "research_sheet",
        sourceUpdatedAt: null,
        sourceStatusVersion: "research_training_status_v1",
      },
    });
  });

  return {
    docs,
    duplicateStaffIds: duplicateStaffIds.size,
    matchedActive: plan.matchedActive,
  };
}

export function healthColumnMode(headers) {
  const normalizedHeaders = headers.map(headerKey);
  const present = HEALTH_TRAINING_COLUMNS.filter((columnName) => {
    return normalizedHeaders.some((header) => header.includes(headerKey(columnName)));
  });
  return {
    individualHealthColumns: present.length,
    usesBundledCompletionStatus: present.length === 0,
  };
}
