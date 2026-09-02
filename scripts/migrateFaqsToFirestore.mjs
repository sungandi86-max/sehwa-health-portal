import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { JWT } from "google-auth-library";
import { initializeFirebaseAdmin, loadLocalEnv, readServiceAccountJson } from "./lib/firebaseAdminCli.mjs";

const DEFAULT_SPREADSHEET_ID = "1ZCsztyIDuvcTzGdE4zZvexJmLuz8aNIIiuGuSyIBwbs";
const FAQ_SHEET_NAME = "앱_FAQ";
const FAQ_RANGE = `${FAQ_SHEET_NAME}!A1:D1000`;
const REQUIRED_HEADERS = ["사용여부", "질문", "답변", "정렬순서"];

const isApplyMode = process.argv.includes("--apply");
const isDryRunMode = process.argv.includes("--dry-run") || !isApplyMode;

function getSpreadsheetId() {
  return process.env.FAQ_SOURCE_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
}

async function readFaqSheetRows() {
  if (process.env.FAQ_SOURCE_JSON_PATH) {
    return readFaqRowsFromJson(process.env.FAQ_SOURCE_JSON_PATH);
  }

  const serviceAccount = readServiceAccountJson();
  const auth = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const spreadsheetId = getSpreadsheetId();
  const encodedRange = encodeURIComponent(FAQ_RANGE);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`;
  const response = await auth.request({ url });
  const values = Array.isArray(response.data.values) ? response.data.values : [];

  if (values.length < 1) {
    throw new Error("앱_FAQ 헤더를 읽지 못했습니다.");
  }

  return values;
}

function readFaqRowsFromJson(sourcePath) {
  const parsed = JSON.parse(fs.readFileSync(path.resolve(sourcePath), "utf8"));
  if (!Array.isArray(parsed.values)) {
    throw new Error("FAQ_SOURCE_JSON_PATH 파일에는 values 배열이 필요합니다.");
  }

  return parsed.values;
}

function headerIndexes(headers) {
  const indexes = new Map();
  headers.forEach((header, index) => indexes.set(String(header || "").trim(), index));

  for (const header of REQUIRED_HEADERS) {
    if (!indexes.has(header)) {
      throw new Error(`앱_FAQ 필수 헤더가 없습니다: ${header}`);
    }
  }

  return indexes;
}

function isTrue(value) {
  const text = String(value || "").trim().toUpperCase();
  return text === "TRUE" || text === "사용" || text === "Y" || text === "YES" || text === "1";
}

function cell(row, indexes, header) {
  return String(row[indexes.get(header)] || "").trim();
}

function stableFaqId(question) {
  const normalizedQuestion = question.replace(/\s+/g, " ").trim();
  const hash = crypto.createHash("sha256").update(normalizedQuestion).digest("hex").slice(0, 16);
  return `faq-${hash}`;
}

function normalizeOrder(value, fallbackOrder) {
  const order = Number(value);
  return Number.isFinite(order) ? order : fallbackOrder;
}

function toFaqDocuments(values) {
  const [headers, ...rows] = values;
  const indexes = headerIndexes(headers);
  const stats = { sourceRows: rows.length, validRows: 0, emptyRows: 0, disabledRows: 0, incompleteRows: 0 };
  const documents = [];

  rows.forEach((row, index) => {
    const rowValues = REQUIRED_HEADERS.map((header) => cell(row, indexes, header));
    const isEmpty = rowValues.every((value) => value === "");
    if (isEmpty) {
      stats.emptyRows += 1;
      return;
    }

    const enabled = isTrue(cell(row, indexes, "사용여부"));
    const question = cell(row, indexes, "질문");
    const answer = cell(row, indexes, "답변");
    if (!enabled) {
      stats.disabledRows += 1;
      return;
    }
    if (!question || !answer) {
      stats.incompleteRows += 1;
      return;
    }

    stats.validRows += 1;
    documents.push({
      id: stableFaqId(question),
      data: {
        question,
        answer,
        category: null,
        keywords: [],
        enabled: true,
        order: normalizeOrder(cell(row, indexes, "정렬순서"), index + 1),
        source: "google-sheet:앱_FAQ",
      },
    });
  });

  return { documents, stats };
}

function comparable(data) {
  return JSON.stringify({
    answer: data.answer || "",
    category: data.category || null,
    enabled: data.enabled === true,
    keywords: Array.isArray(data.keywords) ? data.keywords : [],
    order: Number(data.order || 999),
    question: data.question || "",
    source: data.source || "",
  });
}

async function planMigration(documents) {
  const db = getFirestore();
  const refs = documents.map((document) => db.collection("faqs").doc(document.id));
  const snapshots = refs.length ? await db.getAll(...refs) : [];
  const planned = { create: [], update: [], unchanged: [], conflicts: [] };

  documents.forEach((document, index) => {
    const snapshot = snapshots[index];
    if (!snapshot.exists) {
      planned.create.push(document);
      return;
    }

    const existing = snapshot.data();
    if (existing.question && existing.question !== document.data.question) {
      planned.conflicts.push(document);
      return;
    }

    if (comparable(existing) === comparable(document.data)) {
      planned.unchanged.push(document);
      return;
    }

    planned.update.push(document);
  });

  return planned;
}

async function applyMigration(planned) {
  const db = getFirestore();
  const batch = db.batch();

  planned.create.forEach((document) => {
    batch.set(db.collection("faqs").doc(document.id), {
      ...document.data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  planned.update.forEach((document) => {
    batch.set(
      db.collection("faqs").doc(document.id),
      {
        ...document.data,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  await batch.commit();
}

function previewDocuments(documents) {
  return documents.slice(0, 3).map((document) => ({
    id: document.id,
    question: document.data.question.slice(0, 60),
    answerPreview: document.data.answer.slice(0, 80),
    order: document.data.order,
  }));
}

async function main() {
  loadLocalEnv();
  initializeFirebaseAdmin();

  const values = await readFaqSheetRows();
  const { documents, stats } = toFaqDocuments(values);

  if (stats.validRows === 0) {
    throw new Error("유효 FAQ가 0개라서 migration을 중단합니다.");
  }
  if (stats.incompleteRows > stats.validRows) {
    throw new Error("질문/답변 누락 행이 과도하게 많아 migration을 중단합니다.");
  }

  const planned = await planMigration(documents);
  const summary = {
    mode: isDryRunMode ? "dry-run" : "apply",
    sourceRows: stats.sourceRows,
    validFaqs: stats.validRows,
    excludedEmptyRows: stats.emptyRows,
    excludedDisabledRows: stats.disabledRows,
    excludedIncompleteRows: stats.incompleteRows,
    plannedCreates: planned.create.length,
    plannedUpdates: planned.update.length,
    unchanged: planned.unchanged.length,
    conflicts: planned.conflicts.length,
    preview: previewDocuments(documents),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (planned.conflicts.length) {
    throw new Error("Firestore 문서 ID 충돌이 있어 apply를 중단합니다.");
  }

  if (isApplyMode) {
    await applyMigration(planned);
    console.log("FAQ migration apply completed.");
  } else {
    console.log("Dry-run only. Firestore 변경 없음. 실제 반영은 --apply를 사용하세요.");
  }
}

// no-excuse-ok: catch - CLI boundary prints concise migration failure.
main().catch((error) => {
  console.error("FAQ migration failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
