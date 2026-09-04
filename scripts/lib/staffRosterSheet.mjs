import { JWT } from "google-auth-library";
import { readServiceAccountJson } from "./firebaseAdminCli.mjs";

export const DEFAULT_HEALTH_SPREADSHEET_ID = "1ZCsztyIDuvcTzGdE4zZvexJmLuz8aNIIiuGuSyIBwbs";
export const ROSTER_SHEET_NAME = "교직원명단";
export const ROSTER_RANGE = `${ROSTER_SHEET_NAME}!A1:Z1000`;

const ROSTER_HEADERS = {
  staffId: ["교직원ID", "교직원Id", "직원ID", "직원Id", "staffId", "staff_id"],
  position: ["직책", "직위", "position"],
  realName: ["성명", "이름", "실명", "name"],
  department: ["소속부서", "부서", "소속/부서", "department"],
  target: ["제출대상", "대상", "target"],
};

export function text(value) {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  return normalized || null;
}

export function exactText(value) {
  return text(value)?.replace(/\s+/g, " ") || "";
}

function headerKey(value) {
  return text(value)?.replace(/\s+/g, "").toLowerCase() || "";
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

export function findHeaderRow({ rows, aliasesByField, requiredFields }) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const indexes = {};
    for (const [field, aliases] of Object.entries(aliasesByField)) {
      const index = findHeaderIndex(row, aliases);
      indexes[field] = index === -1 ? null : index;
    }
    if (requiredFields.every((field) => indexes[field] !== null)) return { headerRowIndex: rowIndex, indexes };
  }

  throw new Error(`필수 헤더를 찾지 못했습니다: ${requiredFields.join(", ")}`);
}

export function cell(row, indexes, key) {
  const index = indexes[key];
  return index === null || index === undefined ? null : text(row[index]);
}

export async function readSheetValues(range) {
  const serviceAccount = readServiceAccountJson();
  const auth = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const spreadsheetId = process.env.STAFF_ROSTER_SOURCE_SPREADSHEET_ID || DEFAULT_HEALTH_SPREADSHEET_ID;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const response = await auth.request({ url });
  return Array.isArray(response.data.values) ? response.data.values : [];
}

export function normalizeRoster(values) {
  const { headerRowIndex, indexes } = findHeaderRow({
    rows: values,
    aliasesByField: ROSTER_HEADERS,
    requiredFields: ["staffId", "position", "realName"],
  });
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
