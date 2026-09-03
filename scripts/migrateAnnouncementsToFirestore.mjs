import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { JWT } from "google-auth-library";
import { initializeFirebaseAdmin, loadLocalEnv, readServiceAccountJson } from "./lib/firebaseAdminCli.mjs";

const DEFAULT_SPREADSHEET_ID = "1ZCsztyIDuvcTzGdE4zZvexJmLuz8aNIIiuGuSyIBwbs";
const SHEET_NAME = "앱_공지";
const SHEET_RANGE = `${SHEET_NAME}!A1:N1000`;
const REQUIRED_HEADERS = [
  "사용여부",
  "제목",
  "제목1줄",
  "제목2줄",
  "일시",
  "대상",
  "내용",
  "이동안내",
  "상태",
  "배지색",
  "정렬순서",
  "노출시작일",
  "노출종료일",
  "노출상태",
];
const isApplyMode = process.argv.includes("--apply");

function sourceSpreadsheetId() {
  return process.env.ANNOUNCEMENTS_SOURCE_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
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

function stableAnnouncementId(title) {
  const normalizedTitle = title.replace(/\s+/g, " ").trim();
  const hash = crypto.createHash("sha256").update(normalizedTitle).digest("hex").slice(0, 16);
  return `announcement-${hash}`;
}

function indexesFor(headers) {
  const indexes = new Map();
  headers.forEach((header, index) => indexes.set(String(header || "").trim(), index));
  for (const header of REQUIRED_HEADERS) {
    if (!indexes.has(header)) throw new Error(`앱_공지 필수 헤더가 없습니다: ${header}`);
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
  if (!Array.isArray(parsed.values)) throw new Error("ANNOUNCEMENTS_SOURCE_JSON_PATH 파일에는 values 배열이 필요합니다.");
  return parsed.values;
}

async function readSourceRows() {
  if (process.env.ANNOUNCEMENTS_SOURCE_JSON_PATH) return readRowsFromJson(process.env.ANNOUNCEMENTS_SOURCE_JSON_PATH);
  return readRowsFromSheetsApi();
}

function parseOrder(value, fallbackOrder) {
  const order = Number(value);
  return Number.isFinite(order) ? order : fallbackOrder;
}

function parseDate(value) {
  if (!value) return null;
  const normalized = value.replace(/\.\s*/g, "-").replace(/\//g, "-").trim();
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toAnnouncementDocuments(values) {
  const [headers, ...rows] = values;
  if (!headers) throw new Error("앱_공지 헤더를 읽지 못했습니다.");
  const indexes = indexesFor(headers);
  const stats = { sourceRows: rows.length, trueRows: 0, falseRows: 0, emptyRows: 0, titleMissingRows: 0, invalidOrderRows: 0 };
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
      stats.titleMissingRows += 1;
      return;
    }

    const orderText = cell(row, indexes, "정렬순서");
    if (orderText !== null && !Number.isFinite(Number(orderText))) stats.invalidOrderRows += 1;
    stats.trueRows += 1;
    documents.push({
      id: stableAnnouncementId(title),
      data: {
        title,
        titleLine1: cell(row, indexes, "제목1줄"),
        titleLine2: cell(row, indexes, "제목2줄"),
        dateLabel: cell(row, indexes, "일시"),
        target: cell(row, indexes, "대상"),
        description: cell(row, indexes, "내용"),
        actionText: cell(row, indexes, "이동안내"),
        status: cell(row, indexes, "상태"),
        badgeType: cell(row, indexes, "배지색"),
        order: parseOrder(orderText, index + 1),
        startAt: parseDate(cell(row, indexes, "노출시작일")),
        endAt: parseDate(cell(row, indexes, "노출종료일")),
        displayStatus: cell(row, indexes, "노출상태"),
        enabled: true,
        source: "google-sheet:앱_공지",
      },
    });
  });

  return { documents, stats };
}

function comparable(data) {
  return JSON.stringify({
    actionText: data.actionText || null,
    badgeType: data.badgeType || null,
    dateLabel: data.dateLabel || null,
    description: data.description || null,
    displayStatus: data.displayStatus || null,
    enabled: data.enabled === true,
    endAt: data.endAt || null,
    order: Number(data.order || 999),
    source: data.source || null,
    startAt: data.startAt || null,
    status: data.status || null,
    target: data.target || null,
    title: data.title || "",
    titleLine1: data.titleLine1 || null,
    titleLine2: data.titleLine2 || null,
  });
}

async function planMigration(documents) {
  const db = getFirestore();
  const refs = documents.map((document) => db.collection("announcements").doc(document.id));
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
    batch.set(db.collection("announcements").doc(document.id), {
      ...document.data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  planned.update.forEach((document) => {
    batch.set(
      db.collection("announcements").doc(document.id),
      { ...document.data, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  });
  await batch.commit();
}

function preview(documents) {
  return documents.slice(0, 2).map((document) => ({
    id: document.id,
    title: document.data.title,
    dateLabel: document.data.dateLabel,
    status: document.data.status,
    order: document.data.order,
  }));
}

async function main() {
  loadLocalEnv();
  initializeFirebaseAdmin();
  const { documents, stats } = toAnnouncementDocuments(await readSourceRows());
  if (stats.trueRows === 0) throw new Error("TRUE 공지 데이터가 0개라서 migration을 중단합니다.");
  if (stats.titleMissingRows > 0) throw new Error("제목 누락 행이 있어 migration을 중단합니다.");
  if (stats.invalidOrderRows > 0) throw new Error("정렬순서 파싱 실패가 있어 migration을 중단합니다.");
  const planned = await planMigration(documents);
  console.log(JSON.stringify({
    mode: isApplyMode ? "apply" : "dry-run",
    sourceRows: stats.sourceRows,
    trueRows: stats.trueRows,
    excludedFalseRows: stats.falseRows,
    excludedEmptyRows: stats.emptyRows,
    titleMissingRows: stats.titleMissingRows,
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
    console.log("Announcements migration apply completed.");
  } else {
    console.log("Dry-run only. Firestore 변경 없음. 실제 반영은 --apply를 사용하세요.");
  }
}

// no-excuse-ok: catch - CLI boundary prints concise migration failure.
main().catch((error) => {
  console.error("Announcements migration failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
