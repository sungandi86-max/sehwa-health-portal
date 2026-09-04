const COMPLETED_VALUE = "이수완료";
const INCOMPLETE_VALUES = new Set(["미이수", "미완료", "미수료", "미완"]);
const HEALTH_TRAINING_COLUMNS = ["감염병", "4대폭력", "아동학대", "장애인학대"];

const RESEARCH_HEADERS = {
  realName: ["성명", "이름", "실명", "name"],
  department: ["소속부서", "부서", "소속/부서", "department"],
  position: ["직책", "직위", "보직", "업무", "position"],
  status: ["이수상태", "상태", "status"],
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

function findResearchHeaderRow(rows) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const indexes = {};
    for (const [field, aliases] of Object.entries(RESEARCH_HEADERS)) {
      const index = findHeaderIndex(row, aliases);
      indexes[field] = index === -1 ? null : index;
    }
    if (indexes.realName !== null && indexes.status !== null) {
      return { headerRowIndex: rowIndex, indexes, headers: row.map(text).filter(Boolean) };
    }
  }
  throw new Error("연구부 연수 시트에서 성명/이수상태 헤더를 찾지 못했습니다.");
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
  const rows = [];
  const statusValues = {};
  const nameCounts = new Map();
  let blankRows = 0;
  let missingNameRows = 0;
  let lecturerRows = 0;

  values.slice(headerInfo.headerRowIndex + 1).forEach((row) => {
    if (!row.some((value) => Boolean(text(value)))) {
      blankRows += 1;
      return;
    }

    const realName = cell(row, headerInfo.indexes, "realName");
    if (!realName) {
      missingNameRows += 1;
      return;
    }

    const sourceStatus = cell(row, headerInfo.indexes, "status");
    const position = cell(row, headerInfo.indexes, "position");
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
      sourceRows: Math.max(values.length - headerInfo.headerRowIndex - 1, 0),
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
