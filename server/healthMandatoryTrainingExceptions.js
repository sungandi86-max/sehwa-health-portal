import { createHash } from "node:crypto";
import { requireTrainingEnvironment } from "./lib/trainingDeployment.js";

export const EXCEPTION_COLLECTION_PREFIX = "health_mandatory_training_exceptions";
export const HEALTH_TRAINING_TASK_ID = "health-mandatory-training-2026";
export const HEALTH_TRAINING_YEAR = 2026;
const VALID_REASONS = new Set(["퇴직", "전출", "기타"]);

export class ExceptionInputError extends Error {}

export function exceptionCollection(context = process.env) {
  return `${EXCEPTION_COLLECTION_PREFIX}_${requireTrainingEnvironment(context)}`;
}

export function exceptionText(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function exceptionIdentityKey(year, name, position) {
  return `${year}|${exceptionText(name)}|${exceptionText(position)}`;
}

export function exceptionDocumentId(year, name, position) {
  return createHash("sha256").update(exceptionIdentityKey(year, name, position)).digest("hex");
}

export function canonicalExceptionDocumentId(year, staffId) {
  return createHash("sha256").update(`${year}|staff|${exceptionText(staffId)}`).digest("hex");
}

export function sourceRowFingerprint(year, row) {
  const sourceRow = Number(row.sourceRow);
  if (!Number.isInteger(sourceRow) || sourceRow < 1) throw new ExceptionInputError("연구부 원본 행 번호를 확인할 수 없습니다.");
  const identity = [year, sourceRow, exceptionText(row.realName), exceptionText(row.position), exceptionText(row.department)].join("|");
  return createHash("sha256").update(identity).digest("hex");
}

export function summarizeStoredExceptions(records, taskYear = HEALTH_TRAINING_YEAR) {
  const rows = [];
  const confirmedKeys = new Set();
  let invalidRows = 0;
  let duplicateConfirmedRows = 0;

  for (const record of records) {
    if (record.active !== true) continue;
    const year = Number(record.year);
    const identityType = record.identityType;
    const realName = exceptionText(record.sourceName);
    const position = exceptionText(record.sourceTitle);
    const staffId = exceptionText(record.staffId);
    const reason = exceptionText(record.exceptionReason);
    const confirmationStatus = exceptionText(record.confirmationStatus);
    const isCurrentYear = year === Number(taskYear);
    const sourceOnlyValid = identityType === "source_only_exact" && record.legacySourceOnly === true
      && record.staffId == null && Boolean(realName) && Boolean(position)
      && Number.isInteger(record.sourceRow) && /^[a-f0-9]{64}$/.test(String(record.sourceFingerprint || ""));
    const canonicalValid = identityType === "canonical_staff" && record.legacySourceOnly === false
      && Boolean(staffId) && !realName && !position;
    const isValid = record.taskId === HEALTH_TRAINING_TASK_ID && Number.isInteger(year)
      && (sourceOnlyValid || canonicalValid)
      && VALID_REASONS.has(reason)
      && ["확인완료", "확인필요"].includes(confirmationStatus);
    const isConfirmed = isCurrentYear && isValid && confirmationStatus === "확인완료";
    const key = identityType === "canonical_staff" ? `${year}|staff|${staffId}` : exceptionIdentityKey(year, realName, position);
    if (isCurrentYear && !isValid) invalidRows += 1;
    if (isConfirmed && confirmedKeys.has(key)) duplicateConfirmedRows += 1;
    if (isConfirmed) confirmedKeys.add(key);
    rows.push({
      year, realName, position, reason, confirmationStatus, isCurrentYear, isValid, isConfirmed, key,
      identityType, staffId, sourceRow: record.sourceRow, sourceFingerprint: record.sourceFingerprint,
    });
  }

  return {
    headerInfo: { parseStatus: "success" },
    rows,
    stats: {
      sourceRows: rows.length,
      currentYearRows: rows.filter((row) => row.isCurrentYear).length,
      confirmedRows: rows.filter((row) => row.isConfirmed).length,
      invalidRows,
      duplicateConfirmedRows,
    },
  };
}

export async function readStoredExceptions(db, context = process.env) {
  if (!db) throw new Error("법정의무연수 예외 저장소가 필요합니다.");
  const snapshot = await db.collection(exceptionCollection(context)).get();
  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
}

export function validateSourceOnlyException({ year, sourceName, sourcePosition, reason, confirmationStatus = "확인완료", note = "" }, sourceRows, directory) {
  const normalized = {
    year: Number(year),
    sourceName: exceptionText(sourceName),
    sourcePosition: exceptionText(sourcePosition),
    reason: exceptionText(reason),
    confirmationStatus: exceptionText(confirmationStatus),
    note: exceptionText(note),
  };
  if (normalized.year !== HEALTH_TRAINING_YEAR || !normalized.sourceName || !normalized.sourcePosition
    || !VALID_REASONS.has(normalized.reason) || !["확인완료", "확인필요"].includes(normalized.confirmationStatus)
    || normalized.note.length > 200) {
    throw new ExceptionInputError("예외 정보의 연도·대상·사유·확인상태를 확인해 주세요.");
  }
  const matches = sourceRows.filter((row) => exceptionText(row.realName) === normalized.sourceName
    && exceptionText(row.position) === normalized.sourcePosition);
  if (matches.length !== 1) throw new ExceptionInputError("연구부 원본에서 예외 대상을 유일하게 확인할 수 없습니다.");
  const canonicalMatches = directory.filter((item) => exceptionText(item.name) === normalized.sourceName
    && exceptionText(item.position) === normalized.sourcePosition);
  if (canonicalMatches.length !== 0) {
    throw new ExceptionInputError("현행 교직원명단과 연결되는 대상은 source-only 예외로 등록할 수 없습니다.");
  }
  return {
    ...normalized,
    sourceRow: matches[0].sourceRow,
    sourceFingerprint: sourceRowFingerprint(normalized.year, matches[0]),
  };
}

export async function saveSourceOnlyException({ db, candidate, sourceRows, directory, actorUid, context = process.env }) {
  const validated = validateSourceOnlyException(candidate, sourceRows, directory);
  const id = exceptionDocumentId(validated.year, validated.sourceName, validated.sourcePosition);
  const ref = db.collection(exceptionCollection(context)).doc(id);
  const existing = await ref.get();
  if (existing.exists && existing.data()?.active !== false) throw new ExceptionInputError("이미 등록된 예외입니다.");
  const now = new Date().toISOString();
  await ref.set({
    taskId: HEALTH_TRAINING_TASK_ID,
    identityType: "source_only_exact",
    year: validated.year,
    sourceName: validated.sourceName,
    sourceTitle: validated.sourcePosition,
    exceptionReason: validated.reason,
    confirmationStatus: validated.confirmationStatus,
    note: validated.note,
    sourceRow: validated.sourceRow,
    sourceFingerprint: validated.sourceFingerprint,
    staffId: null,
    legacySourceOnly: true,
    active: true,
    legacy: existing.data()?.legacy || null,
    createdAt: existing.data()?.createdAt || now,
    updatedAt: now,
    reviewedBy: actorUid,
    releasedAt: null,
    releasedBy: null,
  });
  return { id };
}

export async function saveCanonicalStaffException({ db, candidate, directory, actorUid, context = process.env }) {
  const year = Number(candidate.year);
  const staffId = exceptionText(candidate.staffId);
  const reason = exceptionText(candidate.reason);
  const confirmationStatus = exceptionText(candidate.confirmationStatus || "확인완료");
  const note = exceptionText(candidate.note);
  if (year !== HEALTH_TRAINING_YEAR || !staffId || !VALID_REASONS.has(reason)
    || !["확인완료", "확인필요"].includes(confirmationStatus) || note.length > 200) {
    throw new ExceptionInputError("현행 교직원 예외의 staffId·연도·사유를 확인해 주세요.");
  }
  const matches = directory.filter((item) => item.staffId === staffId && item.employmentStatus === "재직");
  if (matches.length !== 1) throw new ExceptionInputError("현행 교직원명단에서 재직자 staffId를 유일하게 확인할 수 없습니다.");
  const id = canonicalExceptionDocumentId(year, staffId);
  const ref = db.collection(exceptionCollection(context)).doc(id);
  const existing = await ref.get();
  if (existing.exists && existing.data()?.active !== false) throw new ExceptionInputError("이미 등록된 예외입니다.");
  const now = new Date().toISOString();
  await ref.set({
    taskId: HEALTH_TRAINING_TASK_ID,
    identityType: "canonical_staff",
    legacySourceOnly: false,
    year,
    staffId,
    exceptionReason: reason,
    confirmationStatus,
    note,
    active: true,
    createdAt: existing.data()?.createdAt || now,
    updatedAt: now,
    reviewedBy: actorUid,
    releasedAt: null,
    releasedBy: null,
  });
  return { id };
}

export async function releaseSourceOnlyException({ db, id, actorUid, context = process.env }) {
  if (!/^[a-f0-9]{64}$/.test(String(id || ""))) throw new ExceptionInputError("예외 식별자가 올바르지 않습니다.");
  const ref = db.collection(exceptionCollection(context)).doc(id);
  const existing = await ref.get();
  if (!existing.exists || existing.data()?.taskId !== HEALTH_TRAINING_TASK_ID) throw new ExceptionInputError("예외 기록을 찾을 수 없습니다.");
  if (existing.data()?.active === false) return { id, alreadyReleased: true };
  const now = new Date().toISOString();
  await ref.update({ active: false, releasedAt: now, releasedBy: actorUid, updatedAt: now });
  return { id, alreadyReleased: false };
}
