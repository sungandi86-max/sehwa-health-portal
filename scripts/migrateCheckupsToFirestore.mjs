import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { JWT } from "google-auth-library";
import { initializeFirebaseAdmin, loadLocalEnv, readServiceAccountJson } from "./lib/firebaseAdminCli.mjs";

const DEFAULT_SPREADSHEET_ID = "1ZCsztyIDuvcTzGdE4zZvexJmLuz8aNIIiuGuSyIBwbs";
const SHEET_NAME = "앱_검진검사";
const SHEET_RANGE = `${SHEET_NAME}!A1:Q1000`;
const REQUIRED_HEADERS = [
  "사용여부", "제목", "설명", "대상", "세부항목", "버튼명", "링크", "상태", "정렬순서",
  "표시방식", "운영표상태", "이미지URL", "다운로드URL", "보조버튼명", "보조동작", "복사문구", "업데이트안내",
];
const isApplyMode = process.argv.includes("--apply");

function sourceSpreadsheetId() {
  return process.env.CHECKUPS_SOURCE_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
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

function stableCheckupId(title) {
  const normalizedTitle = title.replace(/\s+/g, " ").trim();
  const hash = crypto.createHash("sha256").update(normalizedTitle).digest("hex").slice(0, 16);
  return `checkup-${hash}`;
}

function orderValue(value, fallbackOrder) {
  const order = Number(value);
  if (Number.isFinite(order)) return order;
  return fallbackOrder;
}

function indexesFor(headers) {
  const indexes = new Map();
  headers.forEach((header, index) => indexes.set(String(header || "").trim(), index));
  for (const header of REQUIRED_HEADERS) {
    if (!indexes.has(header)) throw new Error(`앱_검진검사 필수 헤더가 없습니다: ${header}`);
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
  if (!Array.isArray(parsed.values)) throw new Error("CHECKUPS_SOURCE_JSON_PATH 파일에는 values 배열이 필요합니다.");
  return parsed.values;
}

async function readSourceRows() {
  if (process.env.CHECKUPS_SOURCE_JSON_PATH) return readRowsFromJson(process.env.CHECKUPS_SOURCE_JSON_PATH);
  return readRowsFromSheetsApi();
}

function toCheckupDocuments(values) {
  const [headers, ...rows] = values;
  if (!headers) throw new Error("앱_검진검사 헤더를 읽지 못했습니다.");
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
    const title = cell(row, indexes, "제목");
    if (!title) {
      stats.incompleteRows += 1;
      return;
    }
    const orderText = cell(row, indexes, "정렬순서");
    if (orderText !== null && !Number.isFinite(Number(orderText))) stats.invalidOrderRows += 1;
    stats.trueRows += 1;
    documents.push({
      id: stableCheckupId(title),
      data: {
        title,
        description: cell(row, indexes, "설명"),
        target: cell(row, indexes, "대상"),
        details: cell(row, indexes, "세부항목"),
        primaryButtonLabel: cell(row, indexes, "버튼명"),
        primaryLink: cell(row, indexes, "링크"),
        status: cell(row, indexes, "상태"),
        order: orderValue(orderText, index + 1),
        displayMode: cell(row, indexes, "표시방식"),
        scheduleStatus: cell(row, indexes, "운영표상태"),
        imageUrl: cell(row, indexes, "이미지URL"),
        downloadUrl: cell(row, indexes, "다운로드URL"),
        secondaryButtonLabel: cell(row, indexes, "보조버튼명"),
        secondaryAction: cell(row, indexes, "보조동작"),
        copyText: cell(row, indexes, "복사문구"),
        updateNotice: cell(row, indexes, "업데이트안내"),
        enabled: true,
        source: "google-sheet:앱_검진검사",
      },
    });
  });
  return { documents, stats };
}

function comparable(data) {
  return JSON.stringify({
    copyText: data.copyText || null,
    description: data.description || null,
    details: data.details || null,
    displayMode: data.displayMode || null,
    downloadUrl: data.downloadUrl || null,
    enabled: data.enabled === true,
    imageUrl: data.imageUrl || null,
    order: Number(data.order || 999),
    primaryButtonLabel: data.primaryButtonLabel || null,
    primaryLink: data.primaryLink || null,
    scheduleStatus: data.scheduleStatus || null,
    secondaryAction: data.secondaryAction || null,
    secondaryButtonLabel: data.secondaryButtonLabel || null,
    source: data.source || null,
    status: data.status || null,
    target: data.target || null,
    title: data.title || "",
    updateNotice: data.updateNotice || null,
  });
}

async function planMigration(documents) {
  const db = getFirestore();
  const refs = documents.map((document) => db.collection("checkups").doc(document.id));
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
    batch.set(db.collection("checkups").doc(document.id), {
      ...document.data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  planned.update.forEach((document) => {
    batch.set(db.collection("checkups").doc(document.id), { ...document.data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  await batch.commit();
}

function preview(documents) {
  return documents.slice(0, 2).map((document) => ({
    id: document.id,
    title: document.data.title,
    displayMode: document.data.displayMode,
    scheduleStatus: document.data.scheduleStatus,
    order: document.data.order,
  }));
}

async function main() {
  loadLocalEnv();
  initializeFirebaseAdmin();
  const { documents, stats } = toCheckupDocuments(await readSourceRows());
  if (stats.trueRows === 0) throw new Error("TRUE 검진·검사 데이터가 0개라서 migration을 중단합니다.");
  if (stats.incompleteRows > 0) throw new Error("제목 누락 행이 있어 migration을 중단합니다.");
  if (stats.invalidOrderRows > 1) throw new Error("정렬순서 파싱 실패가 많아 migration을 중단합니다.");
  const planned = await planMigration(documents);
  console.log(JSON.stringify({
    mode: isApplyMode ? "apply" : "dry-run",
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
    preview: preview(documents),
  }, null, 2));
  if (planned.conflicts.length) throw new Error("Firestore 문서 ID 충돌이 있어 apply를 중단합니다.");
  if (isApplyMode) {
    await applyMigration(planned);
    console.log("Checkups migration apply completed.");
  } else {
    console.log("Dry-run only. Firestore 변경 없음. 실제 반영은 --apply를 사용하세요.");
  }
}

// no-excuse-ok: catch - CLI boundary prints concise migration failure.
main().catch((error) => {
  console.error("Checkups migration failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
