import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { getFirestore } from "firebase-admin/firestore";
import { JWT } from "google-auth-library";
import { initializeFirebaseAdmin, loadLocalEnv, readServiceAccountJson } from "./lib/firebaseAdminCli.mjs";

const DEFAULT_SPREADSHEET_ID = "1ZCsztyIDuvcTzGdE4zZvexJmLuz8aNIIiuGuSyIBwbs";
const STAFF_ROSTER_SHEET_NAME = "교직원명단";
const STAFF_ROSTER_RANGE = `${STAFF_ROSTER_SHEET_NAME}!A1:Z1000`;
const DEFAULT_SCHOOL_YEAR = 2026;
const DEFAULT_SEMESTER = 2;
const isApplyMode = process.argv.includes("--apply");

const HEADER_ALIASES = {
  staffId: ["교직원ID", "교직원Id", "직원ID", "직원Id", "staffId", "staff_id"],
  realName: ["성명", "이름", "실명", "name"],
  department: ["소속부서", "부서", "소속/부서", "department"],
  position: ["직책", "직위", "보직", "업무", "position"],
  target: ["제출대상", "대상", "target"],
  email: ["이메일", "email", "Email", "E-mail"],
};

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function text(value) {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  return normalized || null;
}

function keyText(value) {
  return text(value)?.replace(/\s+/g, "").toLowerCase() || "";
}

function normalizeEmail(value) {
  return text(value)?.toLowerCase() || "";
}

function exactMatchText(value) {
  return text(value)?.replace(/\s+/g, " ") || "";
}

function isHourlyInstructor(row) {
  return ["강사", "시간강사"].includes(exactMatchText(row.position));
}

function assignmentId(uid, schoolYear, semester) {
  return `${uid}_${schoolYear}_${semester}`;
}

function findHeaderIndex(headers, aliases) {
  const normalizedHeaders = headers.map((header) => keyText(header));
  for (const alias of aliases) {
    const headerIndex = normalizedHeaders.indexOf(keyText(alias));
    if (headerIndex !== -1) return headerIndex;
  }
  return -1;
}

function getHeaderIndexes(rows) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const staffIdIndex = findHeaderIndex(row, HEADER_ALIASES.staffId);
    const realNameIndex = findHeaderIndex(row, HEADER_ALIASES.realName);
    if (staffIdIndex === -1 || realNameIndex === -1) continue;

    const indexes = {};
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      const index = findHeaderIndex(row, aliases);
      indexes[key] = index === -1 ? null : index;
    }
    return { headerRowIndex: rowIndex, indexes };
  }

  throw new Error("교직원명단에서 교직원ID/성명 헤더를 찾지 못했습니다.");
}

function cell(row, indexes, key) {
  const index = indexes[key];
  return index === null || index === undefined ? null : text(row[index]);
}

function targetEnabled(value) {
  const normalized = keyText(value);
  if (!normalized) return true;
  return !["false", "n", "no", "0", "제외", "미대상", "퇴직", "전출"].includes(normalized);
}

async function readStaffRosterRows() {
  if (process.env.STAFF_ROSTER_SOURCE_JSON_PATH) {
    const parsed = JSON.parse(fs.readFileSync(path.resolve(process.env.STAFF_ROSTER_SOURCE_JSON_PATH), "utf8"));
    if (!Array.isArray(parsed.values)) throw new Error("STAFF_ROSTER_SOURCE_JSON_PATH 파일에는 values 배열이 필요합니다.");
    return parsed.values;
  }

  const serviceAccount = readServiceAccountJson();
  const auth = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const spreadsheetId = process.env.STAFF_ROSTER_SOURCE_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(STAFF_ROSTER_RANGE)}`;
  const response = await auth.request({ url });
  return Array.isArray(response.data.values) ? response.data.values : [];
}

function normalizeRoster(values) {
  const { headerRowIndex, indexes } = getHeaderIndexes(values);
  const stats = {
    headerRow: headerRowIndex + 1,
    sourceRows: Math.max(values.length - headerRowIndex - 1, 0),
    validStaffRows: 0,
    targetStaffRows: 0,
    missingStaffIdRows: 0,
    missingNameRows: 0,
    duplicateStaffIds: 0,
    generalStaffRows: 0,
    hourlyInstructorRows: 0,
  };
  const rows = [];
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
      department: cell(row, indexes, "department"),
      position: cell(row, indexes, "position"),
      target: cell(row, indexes, "target"),
      email: normalizeEmail(cell(row, indexes, "email")),
    };

    rows.push(item);
    stats.validStaffRows += 1;
    if (targetEnabled(item.target)) stats.targetStaffRows += 1;
    if (isHourlyInstructor(item)) stats.hourlyInstructorRows += 1;
    else stats.generalStaffRows += 1;
    staffIdCounts.set(staffId, (staffIdCounts.get(staffId) || 0) + 1);
  });

  stats.duplicateStaffIds = [...staffIdCounts.values()].filter((count) => count > 1).length;
  return { rows, stats };
}

function addUnique(index, key, row) {
  if (!key) return;
  const existing = index.get(key) || [];
  existing.push(row);
  index.set(key, existing);
}

function buildRosterIndexes(rows) {
  const byStaffId = new Map();
  const byEmail = new Map();
  const byNameDepartment = new Map();
  const byNamePosition = new Map();

  rows.forEach((row) => {
    addUnique(byStaffId, row.staffId, row);
    if (row.email) addUnique(byEmail, row.email, row);
    if (isHourlyInstructor(row)) {
      addUnique(byNamePosition, `${exactMatchText(row.realName)}|${exactMatchText(row.position)}`, row);
    } else {
      addUnique(byNameDepartment, `${exactMatchText(row.realName)}|${exactMatchText(row.department)}`, row);
    }
  });

  return { byStaffId, byEmail, byNameDepartment, byNamePosition };
}

function uniqueLookup(index, key) {
  if (!key) return { status: "missing", match: null };
  const matches = index.get(key) || [];
  if (matches.length === 1) return { status: "matched", match: matches[0] };
  if (matches.length > 1) return { status: "ambiguous", match: null };
  return { status: "missing", match: null };
}

async function readFirebaseState(db, schoolYear, semester) {
  const [usersSnapshot, assignmentsSnapshot, requestsSnapshot] = await Promise.all([
    db.collection("users").limit(500).get(),
    db.collection("user_assignments")
      .where("schoolYear", "==", Number(schoolYear))
      .where("semester", "==", Number(semester))
      .limit(700)
      .get(),
    db.collection("access_requests")
      .where("schoolYear", "==", Number(schoolYear))
      .where("semester", "==", Number(semester))
      .limit(700)
      .get(),
  ]);

  const usersByUid = new Map();
  usersSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    const uid = data.uid || doc.id;
    usersByUid.set(uid, {
      uid,
      email: normalizeEmail(data.email),
      displayName: text(data.displayName),
      active: data.active === true,
    });
  });

  const assignments = assignmentsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const requestsByUid = new Map();
  requestsSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (!data.uid) return;
    requestsByUid.set(data.uid, data);
  });

  return { usersByUid, assignments, requestsByUid };
}

function buildCandidate(assignment, usersByUid, requestsByUid, rosterIndexes) {
  const user = usersByUid.get(assignment.uid) || {};
  const request = requestsByUid.get(assignment.uid);
  const applicant = request?.applicant || {};

  if (assignment.staffId) {
    const existing = uniqueLookup(rosterIndexes.byStaffId, assignment.staffId);
    return {
      kind: existing.status === "matched" ? "existing-valid" : "existing-unverified",
      staffId: assignment.staffId,
      confidence: "existing",
      staffCategory: existing.match && isHourlyInstructor(existing.match) ? "hourly_instructor" : "general",
      writable: false,
    };
  }

  const emailMatch = user.email ? uniqueLookup(rosterIndexes.byEmail, user.email) : { status: "missing", match: null };
  if (emailMatch.status === "matched") {
    return {
      kind: "auto",
      staffId: emailMatch.match.staffId,
      confidence: "email_exact",
      staffCategory: isHourlyInstructor(emailMatch.match) ? "hourly_instructor" : "general",
      writable: true,
    };
  }
  if (emailMatch.status === "ambiguous") {
    return { kind: "ambiguous", staffId: null, confidence: "email_exact", writable: false };
  }

  const applicantNameDepartment = `${exactMatchText(applicant.realName)}|${exactMatchText(applicant.department)}`;
  const applicantMatch = uniqueLookup(rosterIndexes.byNameDepartment, applicantNameDepartment);
  if (applicantMatch.status === "matched") {
    return {
      kind: "auto",
      staffId: applicantMatch.match.staffId,
      confidence: "realName_department_exact",
      staffCategory: "general",
      writable: true,
    };
  }
  if (applicantMatch.status === "ambiguous") {
    return { kind: "ambiguous", staffId: null, confidence: "realName_department_exact", writable: false };
  }

  const applicantPosition = exactMatchText(applicant.position || assignment.position);
  const applicantNamePosition = `${exactMatchText(applicant.realName)}|${applicantPosition}`;
  const hourlyInstructorMatch = uniqueLookup(rosterIndexes.byNamePosition, applicantNamePosition);
  if (hourlyInstructorMatch.status === "matched") {
    return {
      kind: "auto",
      staffId: hourlyInstructorMatch.match.staffId,
      confidence: "realName_position_exact",
      staffCategory: "hourly_instructor",
      writable: true,
    };
  }
  if (hourlyInstructorMatch.status === "ambiguous") {
    return { kind: "ambiguous", staffId: null, confidence: "realName_position_exact", writable: false };
  }

  return { kind: "unmatched", staffId: null, confidence: "none", writable: false };
}

function makePlan(assignments, usersByUid, requestsByUid, rosterRows) {
  const rosterIndexes = buildRosterIndexes(rosterRows);
  const byStaffId = new Map(rosterRows.map((row) => [row.staffId, row]));
  const plan = {
    existingValid: [],
    existingUnverified: [],
    update: [],
    ambiguous: [],
    lowConfidence: [],
    unmatchedAssignments: [],
    duplicateCandidates: [],
  };
  const targetAssignments = assignments.filter((assignment) => {
    return assignment.active === true && Array.isArray(assignment.roles) && assignment.roles.includes("staff");
  });

  targetAssignments.forEach((assignment) => {
    const candidate = buildCandidate(assignment, usersByUid, requestsByUid, rosterIndexes);
    if (candidate.kind === "existing-valid") plan.existingValid.push({ assignment, candidate });
    else if (candidate.kind === "existing-unverified") plan.existingUnverified.push({ assignment, candidate });
    else if (candidate.kind === "auto") plan.update.push({ assignment, candidate });
    else if (candidate.kind === "ambiguous") plan.ambiguous.push({ assignment, candidate });
    else if (candidate.kind === "low-confidence") plan.lowConfidence.push({ assignment, candidate });
    else plan.unmatchedAssignments.push({ assignment, candidate });
  });

  const mappedStaffIds = new Set([
    ...plan.existingValid.map(({ candidate }) => candidate.staffId),
    ...plan.update.map(({ candidate }) => candidate.staffId),
  ]);
  const unmatchedSheetStaff = rosterRows.filter((row) => targetEnabled(row.target) && !mappedStaffIds.has(row.staffId));

  return { plan, targetAssignments, unmatchedSheetStaff, byStaffId };
}

async function applyPlan(db, plan) {
  const batch = db.batch();
  plan.update.forEach(({ assignment, candidate }) => {
    batch.set(db.collection("user_assignments").doc(assignment.id), { staffId: candidate.staffId }, { merge: true });
  });
  await batch.commit();
}

function countBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function safeSummary({ mode, schoolYear, semester, rosterStats, usersByUid, assignments, targetAssignments, plan, unmatchedSheetStaff }) {
  return {
    mode,
    schoolYear,
    semester,
    roster: {
      sourceRows: rosterStats.sourceRows,
      validStaffRows: rosterStats.validStaffRows,
      targetStaffRows: rosterStats.targetStaffRows,
      missingStaffIdRows: rosterStats.missingStaffIdRows,
      missingNameRows: rosterStats.missingNameRows,
      duplicateStaffIds: rosterStats.duplicateStaffIds,
      generalStaffRows: rosterStats.generalStaffRows,
      hourlyInstructorRows: rosterStats.hourlyInstructorRows,
    },
    firebase: {
      userCount: usersByUid.size,
      currentTermAssignmentCount: assignments.length,
      activeStaffAssignmentCount: targetAssignments.length,
    },
    matching: {
      existingValid: plan.existingValid.length,
      existingUnverified: plan.existingUnverified.length,
      automaticUpdates: plan.update.length,
      generalStaffAutomaticUpdates: plan.update.filter(({ candidate }) => candidate.staffCategory === "general").length,
      hourlyInstructorAutomaticUpdates: plan.update.filter(({ candidate }) => candidate.staffCategory === "hourly_instructor").length,
      ambiguous: plan.ambiguous.length,
      lowConfidenceSkipped: plan.lowConfidence.length,
      unmatchedFirebaseAssignments: plan.unmatchedAssignments.length,
      unmatchedSheetStaff: unmatchedSheetStaff.length,
      duplicateCandidateStaffIds: rosterStats.duplicateStaffIds,
      confidenceBreakdown: countBy(plan.update, ({ candidate }) => candidate.confidence),
    },
    safety: {
      applyAllowed: rosterStats.duplicateStaffIds === 0,
      automaticMatchPolicy: "email_exact_when_present_or_realName_department_exact_or_hourly_realName_position_exact",
      writesOnlyStaffId: true,
      existingAssignmentFieldsPreserved: true,
      personalNameSamplesPrinted: false,
    },
  };
}

async function main() {
  loadLocalEnv();
  initializeFirebaseAdmin();

  const schoolYear = Number(argValue("--school-year", DEFAULT_SCHOOL_YEAR));
  const semester = Number(argValue("--semester", DEFAULT_SEMESTER));
  const roster = normalizeRoster(await readStaffRosterRows());
  const db = getFirestore();
  const firebaseState = await readFirebaseState(db, schoolYear, semester);
  const { plan, targetAssignments, unmatchedSheetStaff } = makePlan(
    firebaseState.assignments,
    firebaseState.usersByUid,
    firebaseState.requestsByUid,
    roster.rows
  );

  const summary = safeSummary({
    mode: isApplyMode ? "apply" : "dry-run",
    schoolYear,
    semester,
    rosterStats: roster.stats,
    usersByUid: firebaseState.usersByUid,
    assignments: firebaseState.assignments,
    targetAssignments,
    plan,
    unmatchedSheetStaff,
  });
  console.log(JSON.stringify(summary, null, 2));

  if (roster.stats.duplicateStaffIds > 0) {
    throw new Error("교직원명단에 중복 staffId가 있어 apply를 중단합니다.");
  }

  if (isApplyMode) {
    if (plan.update.length > 0) await applyPlan(db, plan);
    console.log("StaffId mapping apply completed.");
  } else {
    console.log("Dry-run only. Firestore 변경 없음. 실제 반영은 --apply를 사용하세요.");
  }
}

// no-excuse-ok: catch - CLI boundary prints concise migration failure.
main().catch((error) => {
  console.error("StaffId mapping failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
