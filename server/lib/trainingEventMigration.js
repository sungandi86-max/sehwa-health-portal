import { TRAINING_HEADERS, trainingEventFingerprint, trainingEventFromSheetRow, trainingEventToSheetRow } from "./trainingEventSchema.js";

export const TRAINING_EVENT_SOURCE_SHEET = "앱_교직원교육";
export class TrainingEventMigrationConflictError extends Error {}

export function parseTrainingEventSheet(values) {
  const headers = (values?.[0] || []).map((cell) => String(cell ?? "").normalize("NFKC").trim());
  if (TRAINING_HEADERS.some((header) => headers.filter((value) => value === header).length !== 1)) {
    throw new Error("교육 이벤트 원본 헤더가 올바르지 않습니다.");
  }
  const rows = values.slice(1).map((cells, index) => ({ rowNumber: index + 2,
    ...Object.fromEntries(TRAINING_HEADERS.map((header) => [header, String(cells[headers.indexOf(header)] ?? "").normalize("NFKC").trim()])) }))
    .filter((row) => row.eventId);
  if (new Set(rows.map((row) => row.eventId)).size !== rows.length) throw new TrainingEventMigrationConflictError("원본 교육 ID가 중복되었습니다.");
  return rows;
}

export function planTrainingEventMigration(values, documents, environment) {
  if (!["qa", "production"].includes(environment)) throw new Error("승인된 교육 환경이 필요합니다.");
  const rows = parseTrainingEventSheet(values);
  const existing = new Map(documents.map(({ id, data }) => [id, data]));
  const sourceIds = new Set(rows.map((row) => row.eventId));
  const items = rows.map((row) => {
    const incoming = { ...trainingEventFromSheetRow(row), environment, sourceType: "sheet-mirror",
      sourceSheet: TRAINING_EVENT_SOURCE_SHEET, sourceRow: row.rowNumber, sourceFingerprint: trainingEventFingerprint(row) };
    const current = existing.get(incoming.eventId);
    const action = !current ? "create" : current.eventId === incoming.eventId && current.environment === environment &&
      current.sourceType === incoming.sourceType && current.sourceSheet === incoming.sourceSheet &&
      current.sourceRow === incoming.sourceRow && current.sourceFingerprint === incoming.sourceFingerprint &&
      JSON.stringify(trainingEventToSheetRow(current)) === JSON.stringify(trainingEventToSheetRow(incoming)) ? "skip" : "conflict";
    return { eventId: incoming.eventId, action, incoming };
  });
  for (const { id, data } of documents) {
    if (!sourceIds.has(id) && (data.eventId !== id || data.environment !== environment || data.sourceType !== "admin")) {
      items.push({ eventId: id, action: "conflict" });
    }
  }
  const counts = Object.fromEntries(["create", "update", "skip", "conflict"].map((key) => [key, items.filter((item) => item.action === key).length]));
  return { items, counts, sourceCount: rows.length, existingCount: documents.length };
}

export async function applyTrainingEventMigration(plan, collection, now = new Date()) {
  if (plan.counts.conflict || plan.counts.update) throw new TrainingEventMigrationConflictError("교육 이벤트 이관 충돌을 먼저 해결해야 합니다.");
  const creates = plan.items.filter((item) => item.action === "create");
  if (creates.length > 500) throw new Error("교육 이벤트 이관 한도를 초과했습니다.");
  if (!creates.length) return { ...plan.counts, applied: 0 };
  const batch = collection.firestore.batch();
  for (const item of creates) batch.create(collection.doc(item.eventId), {
    ...item.incoming, migratedAt: now, firestoreCreatedAt: now, firestoreUpdatedAt: now,
  });
  await batch.commit();
  return { ...plan.counts, applied: creates.length };
}
