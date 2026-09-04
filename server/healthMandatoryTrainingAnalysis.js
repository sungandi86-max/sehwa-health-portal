const COMPLETED_VALUE = "이수완료";
const INCOMPLETE_VALUES = new Set(["미이수", "미완료", "미수료", "미완"]);
const HEALTH_TRAINING_COLUMNS = ["감염병", "4대폭력", "아동학대", "장애인학대"];

const RESEARCH_HEADERS = {
  sequence: ["순", "순번", "번호", "no"],
  realName: ["성명", "이름", "실명", "교직원명", "성명(한글)", "name"],
  department: ["소속부서", "부서", "부서명", "소속", "소속/부서", "department"],
  position: ["직책", "직위", "직급", "보직", "업무", "position"],
  completionNumber: ["이수번호", "이수 번호", "수료번호", "수료 번호"],
  status: ["이수상태", "이수여부", "수료상태", "완료여부", "이수", "상태", "status"],
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
    indexes: fallback?.indexes || {
      sequence: null,
      realName: null,
      department: null,
      position: null,
      completionNumber: null,
      status: null,
    },
    headers: fallback?.headers || [],
    parseStatus: "header_not_found",
  };
}

function cell(row, indexes, key) {
  const index = indexes[key];
  return index === null || index === undefined ? "" : text(row[index]);
}

function normalizeStatus(value) {
  const status = exactText(value);
  if (status === COMPLETED_VALUE) return "completed";
  if (INCOMPLETE_VALUES.has(status)) return "incomplete";
  return "unknown";
}

function addUnique(index, key, value) {
  if (!key.includes("|") || key.endsWith("|")) return;
  const existing = index.get(key) || [];
  existing.push(value);
  index.set(key, existing);
}

function buildDirectoryIndexes(directory) {
  const byNameDepartment = new Map();
  const byNamePosition = new Map();
  const staffIdCounts = new Map();
  directory.forEach((item) => {
    const name = exactText(item.name);
    addUnique(byNameDepartment, `${name}|${exactText(item.department)}`, item);
    addUnique(byNamePosition, `${name}|${exactText(item.position)}`, item);
    staffIdCounts.set(item.staffId, (staffIdCounts.get(item.staffId) || 0) + 1);
  });
  return {
    byNameDepartment,
    byNamePosition,
    duplicateCanonicalStaffIds: [...staffIdCounts.values()].filter((count) => count > 1).length,
  };
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
  const department = exactText(sourceRow.department);
  const position = exactText(sourceRow.position);
  const byDepartment = uniqueLookup(indexes.byNameDepartment, `${name}|${department}`);
  if (byDepartment.kind === "matched") return { kind: "matched", match: byDepartment.match, criterion: "realName_department_exact" };
  if (byDepartment.kind === "ambiguous") return { kind: "ambiguous", criterion: "realName_department_exact" };

  const byPosition = uniqueLookup(indexes.byNamePosition, `${name}|${position}`);
  if (byPosition.kind === "matched") return { kind: "matched", match: byPosition.match, criterion: "realName_position_exact" };
  if (byPosition.kind === "ambiguous") return { kind: "ambiguous", criterion: "realName_position_exact" };
  return { kind: "unmatched", criterion: department || position ? "exact_secondary_identifier" : "no_secondary_identifier" };
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

export function summarizePlan(sourceRows, directory) {
  const indexes = buildDirectoryIndexes(directory);
  const seenStaffIds = new Set();
  const duplicateStaffIds = new Set();
  const counts = { matched: 0, unmatched: 0, ambiguous: 0, completed: 0, incomplete: 0, unknown: 0 };
  const matchCriteria = {};
  const issueReasons = {};

  sourceRows.forEach((sourceRow) => {
    const resolved = resolveStaff(sourceRow, indexes);
    if (resolved.kind !== "matched") {
      counts[resolved.kind] += 1;
      issueReasons[resolved.criterion] = (issueReasons[resolved.criterion] || 0) + 1;
      return;
    }

    counts.matched += 1;
    matchCriteria[resolved.criterion] = (matchCriteria[resolved.criterion] || 0) + 1;
    if (seenStaffIds.has(resolved.match.staffId)) duplicateStaffIds.add(resolved.match.staffId);
    seenStaffIds.add(resolved.match.staffId);
    counts[normalizeStatus(sourceRow.sourceStatus)] += 1;
  });

  return {
    ...counts,
    duplicateStaffIds: duplicateStaffIds.size,
    duplicateCanonicalStaffIds: indexes.duplicateCanonicalStaffIds,
    matchCriteria,
    issueReasons,
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
