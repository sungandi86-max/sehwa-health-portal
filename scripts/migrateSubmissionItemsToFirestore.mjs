import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { JWT } from "google-auth-library";
import { initializeFirebaseAdmin, loadLocalEnv, readServiceAccountJson } from "./lib/firebaseAdminCli.mjs";

const DEFAULT_SPREADSHEET_ID = "1ZCsztyIDuvcTzGdE4zZvexJmLuz8aNIIiuGuSyIBwbs";
const SHEET_NAME = "앱_제출센터";
const SHEET_RANGE = `${SHEET_NAME}!A1:R1000`;
const REQUIRED_HEADERS = [
  "사용여부", "제목", "제목1줄", "제목2줄", "설명", "대상", "제출자료", "마감", "안내문",
  "버튼명", "링크", "상태", "유형", "강조", "정렬순서", "노출시작일", "노출종료일", "노출상태",
];
const SUBMISSION_TYPES = new Map([
  ["심폐소생술 이수증 제출", "cpr"],
  ["결핵검진 확인증 제출", "tb"],
  ["채용검진 대체 인정 확인 요청", "recruit"],
  ["감염병 발생 보고", "infection"],
  ["결핵검진 진료회신 제출", "student_tb_reply"],
]);
const isApplyMode = process.argv.includes("--apply");

function sourceSpreadsheetId() {
  return process.env.SUBMISSION_ITEMS_SOURCE_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
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

function indexesFor(headers) {
  const indexes = new Map();
  headers.forEach((header, index) => indexes.set(String(header || "").trim(), index));
  for (const header of REQUIRED_HEADERS) {
    if (!indexes.has(header)) throw new Error(`앱_제출센터 필수 헤더가 없습니다: ${header}`);
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
  if (!Array.isArray(parsed.values)) throw new Error("SUBMISSION_ITEMS_SOURCE_JSON_PATH 파일에는 values 배열이 필요합니다.");
  return parsed.values;
}

async function readSourceRows() {
  if (process.env.SUBMISSION_ITEMS_SOURCE_JSON_PATH) return readRowsFromJson(process.env.SUBMISSION_ITEMS_SOURCE_JSON_PATH);
  return readRowsFromSheetsApi();
}

function parseDate(value) {
  if (!value) return null;
  const normalized = value.replace(/\.\s*/g, "-").replace(/\//g, "-").trim();
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseOrder(value, fallbackOrder) {
  const order = Number(value);
  return Number.isFinite(order) ? order : fallbackOrder;
}

function toDocuments(values) {
  const [headers, ...rows] = values;
  if (!headers) throw new Error("앱_제출센터 헤더를 읽지 못했습니다.");
  const indexes = indexesFor(headers);
  const stats = { sourceRows: rows.length, trueRows: 0, falseRows: 0, emptyRows: 0, titleMissingRows: 0, unknownTypeRows: 0 };
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
    const submissionType = SUBMISSION_TYPES.get(title);
    if (!submissionType) {
      stats.unknownTypeRows += 1;
      return;
    }

    stats.trueRows += 1;
    documents.push({
      id: submissionType,
      data: {
        title,
        titleLine1: cell(row, indexes, "제목1줄"),
        titleLine2: cell(row, indexes, "제목2줄"),
        description: cell(row, indexes, "설명"),
        target: cell(row, indexes, "대상"),
        documentType: cell(row, indexes, "제출자료"),
        deadlineLabel: cell(row, indexes, "마감"),
        guideText: cell(row, indexes, "안내문"),
        buttonLabel: cell(row, indexes, "버튼명"),
        legacyLink: cell(row, indexes, "링크"),
        status: cell(row, indexes, "상태"),
        legacyType: cell(row, indexes, "유형"),
        submissionType,
        highlight: isTrue(cell(row, indexes, "강조")),
        order: parseOrder(cell(row, indexes, "정렬순서"), index + 1),
        startAt: parseDate(cell(row, indexes, "노출시작일")),
        endAt: parseDate(cell(row, indexes, "노출종료일")),
        displayStatus: cell(row, indexes, "노출상태"),
        enabled: true,
        source: "google-sheet:앱_제출센터",
      },
    });
  });

  return { documents, stats };
}

function comparable(data) {
  return JSON.stringify({
    buttonLabel: data.buttonLabel || null,
    deadlineLabel: data.deadlineLabel || null,
    description: data.description || null,
    displayStatus: data.displayStatus || null,
    documentType: data.documentType || null,
    enabled: data.enabled === true,
    endAt: data.endAt || null,
    guideText: data.guideText || null,
    highlight: data.highlight === true,
    legacyLink: data.legacyLink || null,
    legacyType: data.legacyType || null,
    order: Number(data.order || 999),
    source: data.source || null,
    startAt: data.startAt || null,
    status: data.status || null,
    submissionType: data.submissionType || "",
    target: data.target || null,
    title: data.title || "",
    titleLine1: data.titleLine1 || null,
    titleLine2: data.titleLine2 || null,
  });
}

async function planMigration(documents) {
  const db = getFirestore();
  const refs = documents.map((document) => db.collection("submission_items").doc(document.id));
  const snapshots = refs.length ? await db.getAll(...refs) : [];
  const planned = { create: [], update: [], unchanged: [], conflicts: [] };
  documents.forEach((document, index) => {
    const snapshot = snapshots[index];
    if (!snapshot.exists) planned.create.push(document);
    else if (snapshot.data().submissionType && snapshot.data().submissionType !== document.data.submissionType) planned.conflicts.push(document);
    else if (comparable(snapshot.data()) === comparable(document.data)) planned.unchanged.push(document);
    else planned.update.push(document);
  });
  return planned;
}

async function applyMigration(planned) {
  const db = getFirestore();
  const batch = db.batch();
  planned.create.forEach((document) => {
    batch.set(db.collection("submission_items").doc(document.id), {
      ...document.data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  planned.update.forEach((document) => {
    batch.set(db.collection("submission_items").doc(document.id), { ...document.data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  await batch.commit();
}

function preview(documents) {
  return documents.slice(0, 2).map((document) => ({
    id: document.id,
    title: document.data.title,
    submissionType: document.data.submissionType,
    order: document.data.order,
  }));
}

async function main() {
  loadLocalEnv();
  initializeFirebaseAdmin();
  const { documents, stats } = toDocuments(await readSourceRows());
  if (stats.trueRows === 0) throw new Error("TRUE 제출 항목이 0개라서 migration을 중단합니다.");
  if (stats.titleMissingRows > 0) throw new Error("제목 누락 행이 있어 migration을 중단합니다.");
  if (stats.unknownTypeRows > 0) throw new Error("submissionType 매핑이 없는 행이 있어 migration을 중단합니다.");
  const planned = await planMigration(documents);
  console.log(JSON.stringify({
    mode: isApplyMode ? "apply" : "dry-run",
    sourceRows: stats.sourceRows,
    trueRows: stats.trueRows,
    excludedFalseRows: stats.falseRows,
    excludedEmptyRows: stats.emptyRows,
    titleMissingRows: stats.titleMissingRows,
    unknownTypeRows: stats.unknownTypeRows,
    plannedCreates: planned.create.length,
    plannedUpdates: planned.update.length,
    unchanged: planned.unchanged.length,
    conflicts: planned.conflicts.length,
    preview: preview(documents),
  }, null, 2));
  if (planned.conflicts.length) throw new Error("Firestore 문서 ID 충돌이 있어 apply를 중단합니다.");
  if (isApplyMode) {
    await applyMigration(planned);
    console.log("Submission items migration apply completed.");
  } else {
    console.log("Dry-run only. Firestore 변경 없음. 실제 반영은 --apply를 사용하세요.");
  }
}

// no-excuse-ok: catch - CLI boundary prints concise migration failure.
main().catch((error) => {
  console.error("Submission items migration failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
