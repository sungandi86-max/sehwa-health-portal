import { execFileSync } from "node:child_process";
import { DEFAULT_HEALTH_SPREADSHEET_ID } from "../server/lib/trainingDeployment.js";
import { planTrainingEventMigration, TRAINING_EVENT_SOURCE_SHEET } from "../server/lib/trainingEventMigration.js";

const PROJECT = "sehwa-health-portal-v2";
const COLLECTION = "training_events_production";
const DOCUMENTS_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${COLLECTION}`;
const sourceRange = `'${TRAINING_EVENT_SOURCE_SHEET}'!A1:Q2000`;
const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${DEFAULT_HEALTH_SPREADSHEET_ID}/values:batchGet?` +
  new URLSearchParams({ ranges: sourceRange, valueRenderOption: "FORMATTED_VALUE" });

const apply = process.argv.includes("--apply");
const expectedFingerprint = process.argv.find((arg) => arg.startsWith("--expected-fingerprint="))?.split("=")[1];
const expectedEventId = process.argv.find((arg) => arg.startsWith("--expected-event-id="))?.split("=")[1];
if (apply && (!/^[a-f0-9]{64}$/.test(expectedFingerprint || "") || !expectedEventId)) {
  throw new Error("적용 전 dry-run의 eventId와 source fingerprint를 지정해야 합니다.");
}

const token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();

async function googleRequest(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`,
    ...(options.body ? { "Content-Type": "application/json" } : {}) } });
  if (!response.ok) throw new Error(`Google API ${response.status}: ${(await response.text()).slice(0, 250)}`);
  return response.json();
}

function decode(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  throw new Error("지원하지 않는 Firestore 이벤트 필드가 있습니다.");
}

function encode(key, value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (["migratedAt", "firestoreCreatedAt", "firestoreUpdatedAt"].includes(key)) return { timestampValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isSafeInteger(value)) return { integerValue: String(value) };
  if (typeof value === "string") return { stringValue: value };
  throw new Error("지원하지 않는 이벤트 값이 있습니다.");
}

async function readDocuments() {
  const documents = [];
  let pageToken = "";
  do {
    const url = new URL(DOCUMENTS_URL);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const page = await googleRequest(url);
    for (const document of page.documents || []) documents.push({ id: document.name.split("/").at(-1),
      data: Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decode(value)])) });
    pageToken = page.nextPageToken || "";
  } while (pageToken);
  return documents;
}

const source = await googleRequest(sheetUrl);
const values = source.valueRanges?.[0]?.values;
if (!Array.isArray(values)) throw new Error("운영 교육 이벤트 원본을 읽지 못했습니다.");
const documents = await readDocuments();
const plan = planTrainingEventMigration(values, documents, "production");
const item = plan.items.find(({ action }) => action === "create" || action === "skip");
const report = { sourceCount: plan.sourceCount, existingCount: plan.existingCount, ...plan.counts,
  eventId: item?.eventId || null, sourceFingerprint: item?.incoming?.sourceFingerprint || null };
console.log(JSON.stringify({ phase: "dry-run", ...report }));

if (apply) {
  if (plan.sourceCount !== 1 || plan.counts.conflict || plan.counts.update || plan.existingCount > 1 ||
    item?.eventId !== expectedEventId || item?.incoming?.sourceFingerprint !== expectedFingerprint) {
    throw new Error("운영 이관 전제 또는 원본 fingerprint가 변경되어 적용을 중단했습니다.");
  }
  if (plan.counts.create === 1 && plan.existingCount === 0) {
    const now = new Date().toISOString();
    const data = { ...item.incoming, migratedAt: now, firestoreCreatedAt: now, firestoreUpdatedAt: now };
    await googleRequest(`${DOCUMENTS_URL}?${new URLSearchParams({ documentId: item.eventId })}`, { method: "POST",
      body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(key, value)])) }) });
  } else if (plan.counts.skip !== 1 || plan.counts.create !== 0) {
    throw new Error("이관 적용 가능 상태가 아닙니다.");
  }
  const verified = planTrainingEventMigration(values, await readDocuments(), "production");
  if (verified.sourceCount !== 1 || verified.existingCount !== 1 || verified.counts.skip !== 1 || verified.counts.conflict !== 0) {
    throw new Error("이관 후 read-back parity를 확인하지 못했습니다.");
  }
  console.log(JSON.stringify({ phase: "read-back", applied: plan.counts.create, ...verified.counts,
    documentCount: verified.existingCount, eventId: item.eventId }));
}
