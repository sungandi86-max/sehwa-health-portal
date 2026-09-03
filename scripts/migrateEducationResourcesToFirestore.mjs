import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { JWT } from "google-auth-library";
import { initializeFirebaseAdmin, loadLocalEnv, readServiceAccountJson } from "./lib/firebaseAdminCli.mjs";

const DEFAULT_SPREADSHEET_ID = "1ZCsztyIDuvcTzGdE4zZvexJmLuz8aNIIiuGuSyIBwbs";
const SHEET_NAME = "앱_교육자료";
const SHEET_RANGE = `${SHEET_NAME}!A1:K1000`;
const REQUIRED_HEADERS = [
  "사용여부",
  "교육명",
  "대상",
  "소요시간",
  "일정",
  "설명",
  "확인방법",
  "버튼명",
  "링크",
  "상태",
  "정렬순서",
];
const isApplyMode = process.argv.includes("--apply");

function sourceSpreadsheetId() {
  return process.env.EDUCATION_SOURCE_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
}

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function cell(row, indexes, header) {
  return text(row[indexes.get(header)]);
}

function isTrue(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "TRUE" || normalized === "사용" || normalized === "Y" || normalized === "YES" || normalized === "1";
}

function stableEducationId(title) {
  const normalizedTitle = title.replace(/\s+/g, " ").trim();
  const hash = crypto.createHash("sha256").update(normalizedTitle).digest("hex").slice(0, 16);
  return `education-${hash}`;
}

function indexesFor(headers) {
  const indexes = new Map();
  headers.forEach((header, index) => indexes.set(String(header || "").trim(), index));
  for (const header of REQUIRED_HEADERS) {
    if (!indexes.has(header)) throw new Error(`앱_교육자료 필수 헤더가 없습니다: ${header}`);
  }
  return indexes;
}

async function readRowsFromSheetsApi() {
  const serviceAccount = readServiceAccountJson();
  const auth = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sourceSpreadsheetId()}/values/${encodeURIComponent(SHEET_RANGE)}`;
  const response = await auth.request({ url });
  return Array.isArray(response.data.values) ? response.data.values : [];
}

function readRowsFromJson(sourcePath) {
  const parsed = JSON.parse(fs.readFileSync(path.resolve(sourcePath), "utf8"));
  if (!Array.isArray(parsed.values)) throw new Error("EDUCATION_SOURCE_JSON_PATH 파일에는 values 배열이 필요합니다.");
  return parsed.values;
}

async function readSourceRows() {
  if (process.env.EDUCATION_SOURCE_JSON_PATH) return readRowsFromJson(process.env.EDUCATION_SOURCE_JSON_PATH);
  return readRowsFromSheetsApi();
}

function parseOrder(value) {
  if (value === null) return null;
  const order = Number(value);
  return Number.isFinite(order) ? order : null;
}

function nextFallbackOrder(orders) {
  return orders.length ? Math.max(...orders) + 1 : 1;
}

function toEducationDocuments(values) {
  const [headers, ...rows] = values;
  if (!headers) throw new Error("앱_교육자료 헤더를 읽지 못했습니다.");
  const indexes = indexesFor(headers);
  const stats = { sourceRows: rows.length, trueRows: 0, falseRows: 0, emptyRows: 0, titleMissingRows: 0, fallbackOrderRows: 0 };
  const documents = [];
  const assignedOrders = [];

  rows.forEach((row) => {
    const rowValues = REQUIRED_HEADERS.map((header) => cell(row, indexes, header));
    if (rowValues.every((value) => value === null)) {
      stats.emptyRows += 1;
      return;
    }
    if (!isTrue(cell(row, indexes, "사용여부"))) {
      stats.falseRows += 1;
      return;
    }

    const title = cell(row, indexes, "교육명");
    if (!title) {
      stats.titleMissingRows += 1;
      return;
    }

    let order = parseOrder(cell(row, indexes, "정렬순서"));
    if (order === null) {
      order = nextFallbackOrder(assignedOrders);
      stats.fallbackOrderRows += 1;
    }
    assignedOrders.push(order);
    stats.trueRows += 1;

    documents.push({
      id: stableEducationId(title),
      data: {
        title,
        target: cell(row, indexes, "대상"),
        duration: cell(row, indexes, "소요시간"),
        schedule: cell(row, indexes, "일정"),
        description: cell(row, indexes, "설명"),
        confirmationMethod: cell(row, indexes, "확인방법"),
        buttonLabel: cell(row, indexes, "버튼명"),
        linkUrl: cell(row, indexes, "링크"),
        status: cell(row, indexes, "상태"),
        order,
        enabled: true,
        source: "google-sheet:앱_교육자료",
      },
    });
  });

  return { documents, stats };
}

function comparable(data) {
  return JSON.stringify({
    buttonLabel: data.buttonLabel || null,
    confirmationMethod: data.confirmationMethod || null,
    description: data.description || null,
    duration: data.duration || null,
    enabled: data.enabled === true,
    linkUrl: data.linkUrl || null,
    order: Number(data.order || 999),
    schedule: data.schedule || null,
    source: data.source || null,
    status: data.status || null,
    target: data.target || null,
    title: data.title || "",
  });
}

async function planMigration(documents) {
  const db = getFirestore();
  const refs = documents.map((document) => db.collection("education_resources").doc(document.id));
  const snapshots = refs.length ? await db.getAll(...refs) : [];
  const planned = { create: [], update: [], unchanged: [], conflicts: [] };
  documents.forEach((document, index) => {
    const snapshot = snapshots[index];
    if (!snapshot.exists) planned.create.push(document);
    else if (snapshot.data().title && snapshot.data().title !== document.data.title) planned.conflicts.push(document);
    else if (comparable(snapshot.data()) === comparable(document.data)) planned.unchanged.push(document);
    else planned.update.push(document);
  });
  return planned;
}

async function applyMigration(planned) {
  const db = getFirestore();
  const batch = db.batch();
  planned.create.forEach((document) => {
    batch.set(db.collection("education_resources").doc(document.id), {
      ...document.data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  planned.update.forEach((document) => {
    batch.set(
      db.collection("education_resources").doc(document.id),
      { ...document.data, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  });
  await batch.commit();
}

function validateDocuments(documents, stats) {
  if (stats.trueRows === 0) throw new Error("TRUE 교육자료 데이터가 0개라서 migration을 중단합니다.");
  if (stats.titleMissingRows > 0) throw new Error("교육명 누락 행이 있어 migration을 중단합니다.");
  const orders = documents.map((document) => document.data.order);
  const uniqueOrders = new Set(orders);
  if (orders.some((order) => !Number.isFinite(order)) || uniqueOrders.size !== orders.length) {
    throw new Error("정렬순서 fallback 계산 결과가 중복되거나 비정상입니다.");
  }
}

function preview(documents) {
  return documents.slice(0, 2).map((document) => ({
    id: document.id,
    title: document.data.title,
    target: document.data.target,
    order: document.data.order,
    descriptionPreview: String(document.data.description || "").slice(0, 60),
  }));
}

async function main() {
  loadLocalEnv();
  initializeFirebaseAdmin();
  const { documents, stats } = toEducationDocuments(await readSourceRows());
  validateDocuments(documents, stats);
  const planned = await planMigration(documents);
  console.log(JSON.stringify({
    mode: isApplyMode ? "apply" : "dry-run",
    sourceRows: stats.sourceRows,
    trueRows: stats.trueRows,
    excludedFalseRows: stats.falseRows,
    excludedEmptyRows: stats.emptyRows,
    titleMissingRows: stats.titleMissingRows,
    fallbackOrderRows: stats.fallbackOrderRows,
    plannedCreates: planned.create.length,
    plannedUpdates: planned.update.length,
    unchanged: planned.unchanged.length,
    conflicts: planned.conflicts.length,
    preview: preview(documents),
  }, null, 2));
  if (planned.conflicts.length) throw new Error("Firestore 문서 ID 충돌이 있어 apply를 중단합니다.");
  if (isApplyMode) {
    await applyMigration(planned);
    console.log("Education resources migration apply completed.");
  } else {
    console.log("Dry-run only. Firestore 변경 없음. 실제 반영은 --apply를 사용하세요.");
  }
}

// no-excuse-ok: catch - CLI boundary prints concise migration failure.
main().catch((error) => {
  console.error("Education resources migration failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
