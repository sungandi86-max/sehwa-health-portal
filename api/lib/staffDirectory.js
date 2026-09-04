import { JWT } from "google-auth-library";
import { getFirebaseAdminAuth, getFirebaseAdminDb, getFirebaseServiceAccount } from "./firebaseAdmin.js";

const CURRENT_SCHOOL_YEAR = 2026;
const CURRENT_SEMESTER = 2;
const DEFAULT_HEALTH_SPREADSHEET_ID = "1ZCsztyIDuvcTzGdE4zZvexJmLuz8aNIIiuGuSyIBwbs";
const STAFF_ROSTER_SHEET_NAME = "교직원명단";
const STAFF_ROSTER_RANGE = `${STAFF_ROSTER_SHEET_NAME}!A1:Z1000`;

const ROSTER_HEADERS = {
  staffId: ["교직원ID", "교직원Id", "직원ID", "직원Id", "staffId", "staff_id"],
  name: ["성명", "이름", "실명", "name"],
  position: ["직책", "직위", "보직", "업무", "position"],
  department: ["소속부서", "부서", "소속/부서", "department"],
};

export function getAssignmentId(uid, schoolYear = CURRENT_SCHOOL_YEAR, semester = CURRENT_SEMESTER) {
  return `${uid}_${schoolYear}_${semester}`;
}

export function getBearerToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const bodyText = Buffer.concat(chunks).toString("utf8");
  return bodyText ? JSON.parse(bodyText) : {};
}

export function sendCors(res, methods = "GET, OPTIONS") {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

function text(value) {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  return normalized || "";
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

function findHeaderRow(rows) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const indexes = {};
    for (const [field, aliases] of Object.entries(ROSTER_HEADERS)) {
      const index = findHeaderIndex(row, aliases);
      indexes[field] = index === -1 ? null : index;
    }
    if (indexes.staffId !== null && indexes.name !== null && indexes.position !== null) {
      return { headerRowIndex: rowIndex, indexes };
    }
  }

  throw new Error("교직원명단에서 교직원ID/성명/직책 헤더를 찾지 못했습니다.");
}

function cell(row, indexes, key) {
  const index = indexes[key];
  return index === null || index === undefined ? "" : text(row[index]);
}

function normalizeDirectory(values) {
  const { headerRowIndex, indexes } = findHeaderRow(values);
  const rows = [];
  const staffIdCounts = new Map();

  values.slice(headerRowIndex + 1).forEach((row) => {
    const staffId = cell(row, indexes, "staffId");
    const name = cell(row, indexes, "name");
    if (!staffId || !name) return;

    rows.push({
      staffId,
      name,
      position: cell(row, indexes, "position"),
      department: cell(row, indexes, "department"),
    });
    staffIdCounts.set(staffId, (staffIdCounts.get(staffId) || 0) + 1);
  });

  return {
    directory: rows,
    stats: {
      count: rows.length,
      duplicateStaffIds: [...staffIdCounts.values()].filter((count) => count > 1).length,
    },
  };
}

async function readSheetValues() {
  const serviceAccount = getFirebaseServiceAccount();
  if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
    throw new Error("Google Sheets 읽기에 사용할 서비스 계정 환경변수가 필요합니다.");
  }

  const auth = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const spreadsheetId = process.env.STAFF_ROSTER_SOURCE_SPREADSHEET_ID || DEFAULT_HEALTH_SPREADSHEET_ID;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
    STAFF_ROSTER_RANGE
  )}`;
  const response = await auth.request({ url });
  return Array.isArray(response.data.values) ? response.data.values : [];
}

export async function readStaffDirectory() {
  return normalizeDirectory(await readSheetValues());
}

export async function verifyDirectoryAdmin(req) {
  const idToken = getBearerToken(req);
  if (!idToken) return { ok: false, status: 401, message: "로그인이 필요합니다." };

  const decodedToken = await getFirebaseAdminAuth().verifyIdToken(idToken);
  const db = getFirebaseAdminDb();
  const assignmentSnapshot = await db.collection("user_assignments").doc(getAssignmentId(decodedToken.uid)).get();
  if (!assignmentSnapshot.exists) {
    return { ok: false, status: 403, message: "현재 학기 관리자 권한이 없습니다." };
  }

  const assignment = assignmentSnapshot.data();
  const roles = Array.isArray(assignment?.roles) ? assignment.roles : [];
  const hasAccess = assignment.active === true && (roles.includes("health_teacher") || roles.includes("admin"));
  if (!hasAccess) return { ok: false, status: 403, message: "관리자 권한이 없습니다." };

  return { ok: true, decodedToken, assignment, db };
}
