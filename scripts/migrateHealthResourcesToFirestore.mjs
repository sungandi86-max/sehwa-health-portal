import crypto from "node:crypto";
import process from "node:process";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { JWT } from "google-auth-library";
import { initializeFirebaseAdmin, loadLocalEnv, readServiceAccountJson } from "./lib/firebaseAdminCli.mjs";

const DEFAULT_SPREADSHEET_ID = "1ZCsztyIDuvcTzGdE4zZvexJmLuz8aNIIiuGuSyIBwbs";
const SHEET_NAME = "앱_건강정보/이벤트";
const SHEET_RANGE = `${SHEET_NAME}!A1:G1000`;
const REQUIRED_HEADERS = ["사용여부", "제목", "카테고리", "설명", "버튼명", "링크", "정렬순서"];
const FORBIDDEN_KEYS = [
  "name", "realName", "studentName", "studentNo", "number", "symptom", "treatment",
  "diagnosis", "diseaseName", "resultDetail", "note", "contact", "guardian",
];
const isApplyMode = process.argv.includes("--apply");

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function isTrue(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "TRUE" || normalized === "사용" || normalized === "Y" || normalized === "YES" || normalized === "1";
}

function stableId(title, url, rowNumber) {
  const key = [title.replace(/\s+/g, " ").trim(), url || "", String(rowNumber)].join("|");
  return `health-resource-${crypto.createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
}

function normalizeOrder(value, fallbackOrder) {
  const order = Number(value);
  return Number.isFinite(order) ? order : fallbackOrder;
}

function indexesFor(headers) {
  const indexes = new Map(headers.map((header, index) => [String(header || "").trim(), index]));
  const missing = REQUIRED_HEADERS.filter((header) => !indexes.has(header));
  if (missing.length) throw new Error(`${SHEET_NAME} 필수 헤더가 없습니다: ${missing.join(", ")}`);
  return indexes;
}

function cell(row, indexes, header) {
  return text(row[indexes.get(header)]);
}

async function readSheetValues() {
  const serviceAccount = readServiceAccountJson();
  const auth = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const spreadsheetId = process.env.HEALTH_RESOURCES_SOURCE_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(SHEET_RANGE)}`;
  const response = await auth.request({ url });
  return { kind: "sheet-values", values: Array.isArray(response.data.values) ? response.data.values : [] };
}

async function readPortalResources() {
  const gasUrl = process.env.GAS_URL || process.env.VITE_GAS_BASE_URL || "";
  if (!/\/exec(?:\?|$)/.test(gasUrl)) throw new Error("GAS_URL 또는 VITE_GAS_BASE_URL /exec URL이 필요합니다.");

  const separator = gasUrl.includes("?") ? "&" : "?";
  const response = await fetch(`${gasUrl}${separator}mode=portal`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Apps Script HTTP ${response.status}`);

  const portal = await response.json();
  if (portal?.success === false || portal?.result === "error") throw new Error(portal.message || "Apps Script portal error");
  if (!Array.isArray(portal?.resources)) throw new Error("Apps Script portal 응답에 resources 배열이 없습니다.");
  return { kind: "portal-resources", resources: portal.resources };
}

async function readSource() {
  try {
    return await readSheetValues();
  } catch (error) {
    console.warn("Sheets API read failed; falling back to Apps Script portal resources.");
    console.warn(error instanceof Error ? error.message : error);
    return readPortalResources();
  }
}

function resourceDocument(resource, sortOrder, rowNumber) {
  const title = text(resource.title);
  if (!title) return null;
  const url = text(resource.url);

  return {
    id: stableId(title, url, rowNumber),
    data: {
      title,
      category: text(resource.category) || "기타",
      description: text(resource.description),
      buttonText: text(resource.buttonText) || "자료 열기",
      url,
      active: true,
      sortOrder,
      source: {
        type: "google_sheet",
        sheetName: SHEET_NAME,
        rowNumber,
        via: resource.via || "sheets_api",
      },
    },
  };
}

function documentsFromSheetValues(values) {
  const [headers, ...rows] = values;
  if (!headers) throw new Error(`${SHEET_NAME} 헤더를 읽지 못했습니다.`);

  const indexes = indexesFor(headers);
  const stats = { sourceRows: rows.length, trueRows: 0, falseRows: 0, emptyRows: 0, incompleteRows: 0, invalidOrderRows: 0 };
  const documents = [];

  rows.forEach((row, index) => {
    const rowValues = REQUIRED_HEADERS.map((header) => cell(row, indexes, header));
    if (rowValues.every((value) => value === null)) {
      stats.emptyRows += 1;
      return;
    }
    if (!isTrue(cell(row, indexes, "사용여부"))) {
      stats.falseRows += 1;
      return;
    }

    const rowNumber = index + 2;
    const orderText = cell(row, indexes, "정렬순서");
    if (orderText !== null && !Number.isFinite(Number(orderText))) stats.invalidOrderRows += 1;
    const document = resourceDocument({
      title: cell(row, indexes, "제목"),
      category: cell(row, indexes, "카테고리"),
      description: cell(row, indexes, "설명"),
      buttonText: cell(row, indexes, "버튼명"),
      url: cell(row, indexes, "링크"),
    }, normalizeOrder(orderText, index + 1), rowNumber);

    if (!document) stats.incompleteRows += 1;
    else {
      stats.trueRows += 1;
      documents.push(document);
    }
  });

  return { documents, stats };
}

function documentsFromPortalResources(resources) {
  const stats = { sourceRows: resources.length, trueRows: 0, falseRows: 0, emptyRows: 0, incompleteRows: 0, invalidOrderRows: 0 };
  const documents = resources.flatMap((resource, index) => {
    const document = resourceDocument({ ...resource, via: "apps_script_portal" }, index + 1, index + 2);
    if (!document) {
      stats.incompleteRows += 1;
      return [];
    }
    stats.trueRows += 1;
    return [document];
  });
  return { documents, stats };
}

function assertSafe(documents, stats) {
  if (stats.trueRows === 0) throw new Error("TRUE 건강정보/이벤트 데이터가 0개라서 migration을 중단합니다.");
  if (stats.incompleteRows > 0) throw new Error("제목 누락 행이 있어 migration을 중단합니다.");
  if (stats.invalidOrderRows > 1) throw new Error("정렬순서 파싱 실패가 많아 migration을 중단합니다.");
  if (new Set(documents.map((document) => document.id)).size !== documents.length) {
    throw new Error("health_resources 문서 ID가 중복되어 migration을 중단합니다.");
  }

  const payload = JSON.stringify(documents.map((document) => document.data));
  const forbiddenKey = FORBIDDEN_KEYS.find((key) => payload.includes(`"${key}"`));
  if (forbiddenKey) throw new Error(`health_resources에 저장 금지 필드가 포함되었습니다: ${forbiddenKey}`);
}

function comparable(data) {
  return JSON.stringify({
    active: data.active === true,
    buttonText: data.buttonText || "자료 열기",
    category: data.category || "기타",
    description: data.description || null,
    sortOrder: Number(data.sortOrder || 999),
    title: data.title || "",
    url: data.url || null,
  });
}

async function planMigration(documents) {
  const db = getFirestore();
  const snapshots = documents.length
    ? await db.getAll(...documents.map((document) => db.collection("health_resources").doc(document.id)))
    : [];
  const planned = { create: [], update: [], unchanged: [], conflicts: [] };

  documents.forEach((document, index) => {
    const existing = snapshots[index].data();
    if (!snapshots[index].exists) planned.create.push(document);
    else if (existing.title && existing.title !== document.data.title) planned.conflicts.push(document);
    else if (comparable(existing) === comparable(document.data)) planned.unchanged.push(document);
    else planned.update.push(document);
  });
  return planned;
}

async function applyMigration(planned) {
  const db = getFirestore();
  const batch = db.batch();
  planned.create.forEach((document) => {
    batch.set(db.collection("health_resources").doc(document.id), {
      ...document.data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  planned.update.forEach((document) => {
    batch.set(db.collection("health_resources").doc(document.id), { ...document.data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  await batch.commit();
}

function summary(source, stats, planned, documents) {
  return {
    mode: isApplyMode ? "apply" : "dry-run",
    source,
    sourceRows: stats.sourceRows,
    trueRows: stats.trueRows,
    excludedFalseRows: stats.falseRows,
    excludedEmptyRows: stats.emptyRows,
    incompleteRows: stats.incompleteRows,
    invalidOrderRows: stats.invalidOrderRows,
    plannedCreates: planned.create.length,
    plannedUpdates: planned.update.length,
    unchanged: planned.unchanged.length,
    conflicts: planned.conflicts.length,
    privacyForbiddenFieldCount: 0,
    preview: documents.slice(0, 3).map((document) => ({
      id: document.id,
      title: document.data.title,
      category: document.data.category,
      sortOrder: document.data.sortOrder,
      hasUrl: Boolean(document.data.url),
    })),
  };
}

async function main() {
  loadLocalEnv();
  initializeFirebaseAdmin();

  const source = await readSource();
  const result = source.kind === "portal-resources"
    ? documentsFromPortalResources(source.resources)
    : documentsFromSheetValues(source.values);
  assertSafe(result.documents, result.stats);

  const planned = await planMigration(result.documents);
  console.log(JSON.stringify(summary(source.kind, result.stats, planned, result.documents), null, 2));
  if (planned.conflicts.length) throw new Error("Firestore 문서 ID 충돌이 있어 apply를 중단합니다.");
  if (!isApplyMode) {
    console.log("Dry-run only. Firestore 변경 없음. 실제 반영은 --apply를 사용하세요.");
    return;
  }

  await applyMigration(planned);
  console.log("Health resources migration apply completed.");
}

// no-excuse-ok: catch - CLI boundary prints concise migration failure.
main().catch((error) => {
  console.error("Health resources migration failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
