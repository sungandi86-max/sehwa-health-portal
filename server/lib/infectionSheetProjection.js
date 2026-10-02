import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { JWT } from "google-auth-library";
import { getFirebaseAdminDb, getFirebaseServiceAccount } from "./firebaseAdmin.js";

const SHEET_NAME = "학생 감염병 관리 현황";
const DATA_START_ROW = 5;
const DOC_ID_METADATA_KEY = "firestoreInfectionDocId";
const DEFAULT_SPREADSHEET_ID = "1ZCsztyIDuvcTzGdE4zZvexJmLuz8aNIIiuGuSyIBwbs";
const PROJECTION_LOCK_COLLECTION = "system_locks";
const PROJECTION_LOCK_DOCUMENT = "infection_sheet_projection";
const PROJECTION_LOCK_MS = 300000;

export const INFECTION_CASE_STATUS_LABELS = Object.freeze({
  new: "신규",
  checking: "확인 중",
  managing: "관리 중",
  return_check_needed: "복귀 확인 필요",
  closed: "종결",
});

function getSpreadsheetId() {
  if (process.env.HEALTH_ROOM_SOURCE_SPREADSHEET_ID) return process.env.HEALTH_ROOM_SOURCE_SPREADSHEET_ID;

  try {
    const code = fs.readFileSync(new URL("../../apps-script/Code.gs", import.meta.url), "utf8");
    return code.match(/const SPREADSHEET_ID\s*=\s*"([^"]+)"/)?.[1] || DEFAULT_SPREADSHEET_ID;
  } catch {
    return DEFAULT_SPREADSHEET_ID;
  }
}

function getSheetsAuth() {
  const serviceAccount = getFirebaseServiceAccount();
  if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
    throw new Error("Google Sheets projection service account is not configured.");
  }
  return new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getTimestampDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toKstSheetSerial(value) {
  const date = getTimestampDate(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const utcMillis = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour) % 24,
    Number(values.minute),
    Number(values.second)
  );
  return utcMillis / 86400000 + 25569;
}

function toDateSheetSerial(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return "";
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000 + 25569;
}

export function getInfectionCaseStatusLabel(status) {
  return INFECTION_CASE_STATUS_LABELS[status] || INFECTION_CASE_STATUS_LABELS.new;
}

function getCompatibleCaseStatus(report) {
  if (INFECTION_CASE_STATUS_LABELS[report?.caseStatus]) return report.caseStatus;
  if (report?.status === "completed") return "closed";
  if (report?.status === "reviewing") return "checking";
  return "new";
}

export function buildInfectionSheetValues(document) {
  const data = document.data || {};
  return {
    docId: document.id,
    bToJ: [
      toKstSheetSerial(data.submittedAt),
      Number(data.student?.grade) || "",
      Number(data.student?.classNo) || "",
      Number(data.student?.number) || "",
      String(data.student?.name || "").trim(),
      String(data.infection?.diseaseName || "").trim(),
      toDateSheetSerial(data.infection?.diagnosisDate),
      toDateSheetSerial(data.infection?.exclusionStartDate),
      toDateSheetSerial(data.infection?.exclusionEndDate),
    ],
    note: String(data.report?.note || "").trim(),
    caseStatus: getInfectionCaseStatusLabel(getCompatibleCaseStatus(data.report)),
  };
}

function comparable(value) {
  if (typeof value === "number") return Number(value.toFixed(8));
  return String(value ?? "").trim();
}

function rowMatches(rowValues, desired) {
  const existing = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => comparable(rowValues[index]));
  const expected = desired.bToJ.map(comparable);
  return (
    existing.every((value, index) => value === expected[index]) &&
    comparable(rowValues[11]) === comparable(desired.note) &&
    comparable(rowValues[13]) === comparable(desired.caseStatus)
  );
}

function isOccupiedRow(rowValues) {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 13].some(
    (index) => String(rowValues[index] ?? "").trim()
  );
}

export function planInfectionSheetProjection(documents, sheetState) {
  const metadataByDocId = new Map();
  const metadataByRow = new Map();
  for (const item of sheetState.metadata || []) {
    if (!metadataByDocId.has(item.docId)) metadataByDocId.set(item.docId, []);
    metadataByDocId.get(item.docId).push(item.rowNumber);
    if (!metadataByRow.has(item.rowNumber)) metadataByRow.set(item.rowNumber, []);
    metadataByRow.get(item.rowNumber).push(item.docId);
  }

  const rowsByNumber = new Map((sheetState.rows || []).map((row) => [row.rowNumber, row.values]));
  const formulasByNumber = new Map(
    (sheetState.formulaRows || []).map((row) => [row.rowNumber, row.values])
  );
  const managedRows = new Set((sheetState.metadata || []).map((item) => item.rowNumber));
  const reservedRows = new Set(managedRows);
  const duplicateIds = new Set(
    [...metadataByDocId.entries()].filter(([, rows]) => rows.length > 1).map(([docId]) => docId)
  );
  const duplicateRows = new Set(
    [...metadataByRow.entries()].filter(([, docIds]) => docIds.length > 1).map(([rowNumber]) => rowNumber)
  );
  const operations = [];
  let errors = 0;

  const findInsertRow = () => {
    const maximumRow = Math.max(sheetState.rowCount || DATA_START_ROW, DATA_START_ROW);
    for (let rowNumber = DATA_START_ROW; rowNumber <= maximumRow; rowNumber += 1) {
      if (reservedRows.has(rowNumber)) continue;
      if (!isOccupiedRow(rowsByNumber.get(rowNumber) || [])) {
        reservedRows.add(rowNumber);
        return rowNumber;
      }
    }
    const rowNumber = maximumRow + 1;
    reservedRows.add(rowNumber);
    return rowNumber;
  };

  for (const document of documents) {
    const existingRows = metadataByDocId.get(document?.id) || [];
    if (!document?.id || duplicateIds.has(document.id) || existingRows.some((row) => duplicateRows.has(row))) {
      errors += 1;
      continue;
    }
    const desired = buildInfectionSheetValues(document);
    if (existingRows.length === 1) {
      const rowNumber = existingRows[0];
      const rowValues = rowsByNumber.get(rowNumber) || [];
      const formulaValues = formulasByNumber.get(rowNumber) || [];
      const initializeReportComplete = rowValues[10] === undefined || rowValues[10] === "";
      const initializeSequence = !String(formulaValues[0] || "").startsWith("=");
      const initializeMonth = !String(formulaValues[12] || "").startsWith("=");
      if (!rowMatches(rowValues, desired) || initializeReportComplete || initializeSequence || initializeMonth) {
        operations.push({
          type: "update",
          rowNumber,
          desired,
          initializeReportComplete,
          initializeSequence,
          initializeMonth,
        });
      }
      continue;
    }
    operations.push({ type: "insert", rowNumber: findInsertRow(), desired });
  }

  return {
    operations,
    projectedExisting: managedRows.size,
    unmanagedSheetRows: (sheetState.rows || []).filter(
      (row) => isOccupiedRow(row.values) && !managedRows.has(row.rowNumber)
    ).length,
    duplicates: duplicateIds.size + duplicateRows.size,
    errors,
  };
}

function summarizePlan(firestoreCount, plan) {
  return {
    firestoreCount,
    projectedExisting: plan.projectedExisting,
    toInsert: plan.operations.filter((operation) => operation.type === "insert").length,
    toUpdate: plan.operations.filter((operation) => operation.type === "update").length,
    unmanagedSheetRows: plan.unmanagedSheetRows,
    duplicates: plan.duplicates,
    errors: plan.errors,
  };
}

async function loadSheetState(auth, spreadsheetId) {
  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  const spreadsheet = await auth.request({
    url: baseUrl,
    params: { fields: "sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))" },
  });
  const sheet = spreadsheet.data.sheets?.find((item) => item.properties?.title === SHEET_NAME);
  if (!sheet) throw new Error("Infection management sheet was not found.");

  const range = `'${SHEET_NAME}'!A${DATA_START_ROW}:N${sheet.properties.gridProperties.rowCount}`;
  const [valuesResponse, formulaResponse, metadataResponse] = await Promise.all([
    auth.request({
      url: `${baseUrl}/values/${encodeURIComponent(range)}`,
      params: { valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" },
    }),
    auth.request({
      url: `${baseUrl}/values/${encodeURIComponent(range)}`,
      params: { valueRenderOption: "FORMULA", dateTimeRenderOption: "SERIAL_NUMBER" },
    }),
    auth.request({
      url: `${baseUrl}/developerMetadata:search`,
      method: "POST",
      data: { dataFilters: [{ developerMetadataLookup: { metadataKey: DOC_ID_METADATA_KEY } }] },
    }),
  ]);

  const rows = (valuesResponse.data.values || []).map((values, index) => ({
    rowNumber: DATA_START_ROW + index,
    values,
  }));
  const formulaRows = (formulaResponse.data.values || []).map((values, index) => ({
    rowNumber: DATA_START_ROW + index,
    values,
  }));
  const metadata = (metadataResponse.data.matchedDeveloperMetadata || []).flatMap((match) => {
    const item = match.developerMetadata;
    const rangeLocation = item?.location?.dimensionRange;
    if (rangeLocation?.sheetId !== sheet.properties.sheetId || rangeLocation.dimension !== "ROWS") return [];
    return [{ docId: String(item.metadataValue || ""), rowNumber: Number(rangeLocation.startIndex) + 1 }];
  });

  return {
    sheetId: sheet.properties.sheetId,
    rowCount: sheet.properties.gridProperties.rowCount,
    rows,
    formulaRows,
    metadata,
  };
}

function findFormulaSourceRow(sheetState, targetRow, columnIndex) {
  for (let rowNumber = targetRow - 1; rowNumber >= DATA_START_ROW; rowNumber -= 1) {
    const row = sheetState.formulaRows?.find((item) => item.rowNumber === rowNumber);
    if (String(row?.values?.[columnIndex] || "").startsWith("=")) return rowNumber;
  }
  return null;
}

function targetHasFormula(sheetState, targetRow, columnIndex) {
  const row = sheetState.formulaRows?.find((item) => item.rowNumber === targetRow);
  return String(row?.values?.[columnIndex] || "").startsWith("=");
}

export function getInfectionSheetFallbackFormula(rowNumber, columnIndex) {
  if (columnIndex === 0) return "=ROW()-4";
  if (columnIndex === 12) return `=IF(H${rowNumber}="","",TEXT(H${rowNumber},"yyyy-mm"))`;
  return "";
}

async function prepareOperationRow(auth, spreadsheetId, sheetState, operation) {
  const requests = [];
  if (operation.type === "insert" && operation.rowNumber > sheetState.rowCount) {
    requests.push({
      appendDimension: {
        sheetId: sheetState.sheetId,
        dimension: "ROWS",
        length: operation.rowNumber - sheetState.rowCount,
      },
    });
  }

  if (operation.type === "insert") {
    const formatSourceRow = Math.max(DATA_START_ROW, operation.rowNumber - 1);
    if (formatSourceRow !== operation.rowNumber) {
      requests.push({
        copyPaste: {
          source: {
            sheetId: sheetState.sheetId,
            startRowIndex: formatSourceRow - 1,
            endRowIndex: formatSourceRow,
            startColumnIndex: 0,
            endColumnIndex: 14,
          },
          destination: {
            sheetId: sheetState.sheetId,
            startRowIndex: operation.rowNumber - 1,
            endRowIndex: operation.rowNumber,
            startColumnIndex: 0,
            endColumnIndex: 14,
          },
          pasteType: "PASTE_FORMAT",
        },
      });
    }

  }

  for (const columnIndex of [0, 12]) {
    const shouldInitialize =
      operation.type === "insert" ||
      (columnIndex === 0 && operation.initializeSequence) ||
      (columnIndex === 12 && operation.initializeMonth);
    if (!shouldInitialize || targetHasFormula(sheetState, operation.rowNumber, columnIndex)) continue;

    const sourceRow = findFormulaSourceRow(sheetState, operation.rowNumber, columnIndex);
    if (sourceRow) {
      requests.push({
        copyPaste: {
          source: {
            sheetId: sheetState.sheetId,
            startRowIndex: sourceRow - 1,
            endRowIndex: sourceRow,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1,
          },
          destination: {
            sheetId: sheetState.sheetId,
            startRowIndex: operation.rowNumber - 1,
            endRowIndex: operation.rowNumber,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1,
          },
          pasteType: "PASTE_FORMULA",
        },
      });
      continue;
    }

    requests.push({
      updateCells: {
        start: {
          sheetId: sheetState.sheetId,
          rowIndex: operation.rowNumber - 1,
          columnIndex,
        },
        rows: [
          {
            values: [
              {
                userEnteredValue: {
                  formulaValue: getInfectionSheetFallbackFormula(operation.rowNumber, columnIndex),
                },
              },
            ],
          },
        ],
        fields: "userEnteredValue",
      },
    });
  }

  if (operation.type === "insert") {
    requests.push({
      createDeveloperMetadata: {
        developerMetadata: {
          metadataKey: DOC_ID_METADATA_KEY,
          metadataValue: operation.desired.docId,
          visibility: "DOCUMENT",
          location: {
            dimensionRange: {
              sheetId: sheetState.sheetId,
              dimension: "ROWS",
              startIndex: operation.rowNumber - 1,
              endIndex: operation.rowNumber,
            },
          },
        },
      },
    });
  }

  if (operation.type === "insert" || operation.initializeReportComplete) {
    requests.push({
      copyPaste: {
        source: {
          sheetId: sheetState.sheetId,
          startRowIndex: DATA_START_ROW - 1,
          endRowIndex: DATA_START_ROW,
          startColumnIndex: 10,
          endColumnIndex: 11,
        },
        destination: {
          sheetId: sheetState.sheetId,
          startRowIndex: operation.rowNumber - 1,
          endRowIndex: operation.rowNumber,
          startColumnIndex: 10,
          endColumnIndex: 11,
        },
        pasteType: "PASTE_DATA_VALIDATION",
      },
    });
  }

  requests.push({
    repeatCell: {
      range: {
        sheetId: sheetState.sheetId,
        startRowIndex: operation.rowNumber - 1,
        endRowIndex: operation.rowNumber,
        startColumnIndex: 1,
        endColumnIndex: 2,
      },
      cell: { userEnteredFormat: { numberFormat: { type: "DATE_TIME", pattern: "yyyy-MM-dd HH:mm:ss" } } },
      fields: "userEnteredFormat.numberFormat",
    },
  });
  requests.push({
    repeatCell: {
      range: {
        sheetId: sheetState.sheetId,
        startRowIndex: operation.rowNumber - 1,
        endRowIndex: operation.rowNumber,
        startColumnIndex: 7,
        endColumnIndex: 10,
      },
      cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "yyyy-MM-dd" } } },
      fields: "userEnteredFormat.numberFormat",
    },
  });

  if (requests.length === 0) return;

  await auth.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    method: "POST",
    data: { requests },
  });
}

async function writeOperation(auth, spreadsheetId, sheetState, operation) {
  await prepareOperationRow(auth, spreadsheetId, sheetState, operation);

  const ranges = [
    { range: `'${SHEET_NAME}'!B${operation.rowNumber}:J${operation.rowNumber}`, values: [operation.desired.bToJ] },
    { range: `'${SHEET_NAME}'!L${operation.rowNumber}`, values: [[operation.desired.note]] },
    { range: `'${SHEET_NAME}'!N${operation.rowNumber}`, values: [[operation.desired.caseStatus]] },
  ];
  if (operation.type === "insert" || operation.initializeReportComplete) {
    ranges.push({ range: `'${SHEET_NAME}'!K${operation.rowNumber}`, values: [[false]] });
  }

  await auth.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    method: "POST",
    data: { valueInputOption: "RAW", data: ranges },
  });
}

async function withProjectionLock(operation) {
  const db = getFirebaseAdminDb();
  const lockRef = db.collection(PROJECTION_LOCK_COLLECTION).doc(PROJECTION_LOCK_DOCUMENT);
  const leaseId = randomUUID();
  const now = Date.now();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(lockRef);
    const expiresAt = snapshot.data()?.expiresAt?.toMillis?.() || 0;
    if (expiresAt > now) throw new Error("Infection projection is already running.");
    transaction.set(lockRef, { leaseId, expiresAt: new Date(now + PROJECTION_LOCK_MS) });
  });

  try {
    return await operation();
  } finally {
    try {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(lockRef);
        if (snapshot.data()?.leaseId === leaseId) transaction.delete(lockRef);
      });
    } catch {
      console.warn("[infection-sheet-projection] lock release deferred");
    }
  }
}

async function getInfectionDocuments() {
  const snapshot = await getFirebaseAdminDb()
    .collection("student_health_submissions")
    .where("type", "==", "infection")
    .get();
  return snapshot.docs.map((documentSnapshot) => ({ id: documentSnapshot.id, data: documentSnapshot.data() }));
}

export async function syncInfectionSheetProjection({ apply = false } = {}) {
  return withProjectionLock(async () => {
  const documents = await getInfectionDocuments();
  const spreadsheetId = getSpreadsheetId();
  const auth = getSheetsAuth();
  const sheetState = await loadSheetState(auth, spreadsheetId);
  const plan = planInfectionSheetProjection(documents, sheetState);
  const summary = summarizePlan(documents.length, plan);
  if (!apply || summary.duplicates > 0 || summary.errors > 0) return summary;

  let inserted = 0;
  let updated = 0;
  let writeErrors = 0;
  for (const operation of plan.operations) {
    try {
      await writeOperation(auth, spreadsheetId, sheetState, operation);
      if (operation.type === "insert") inserted += 1;
      else updated += 1;
    } catch {
      writeErrors += 1;
    }
  }

  console.log("[infection-sheet-projection] sync complete", {
    firestoreCount: documents.length,
    inserted,
    updated,
    errors: writeErrors,
    syncedAt: new Date().toISOString(),
  });
  return { ...summary, inserted, updated, errors: summary.errors + writeErrors };
  });
}

export async function projectInfectionDocument(docId) {
  return withProjectionLock(async () => {
  const documentSnapshot = await getFirebaseAdminDb().collection("student_health_submissions").doc(docId).get();
  if (!documentSnapshot.exists || documentSnapshot.data()?.type !== "infection") {
    throw new Error("Infection submission was not found.");
  }

  const spreadsheetId = getSpreadsheetId();
  const auth = getSheetsAuth();
  const sheetState = await loadSheetState(auth, spreadsheetId);
  const plan = planInfectionSheetProjection(
    [{ id: documentSnapshot.id, data: documentSnapshot.data() }],
    sheetState
  );
  if (plan.duplicates > 0 || plan.errors > 0) throw new Error("Infection projection identity is ambiguous.");
  if (plan.operations.length === 0) return { projected: false, unchanged: true };

  await writeOperation(auth, spreadsheetId, sheetState, plan.operations[0]);
  console.log("[infection-sheet-projection] document synced", { operation: plan.operations[0].type });
  return { projected: true, unchanged: false };
  });
}
