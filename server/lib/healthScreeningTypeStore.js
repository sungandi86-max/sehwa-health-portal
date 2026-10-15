import { trainingEnvironment } from "./trainingDeployment.js";

export const HEALTH_SCREENING_TYPES = new Set(["nhis", "employment", "individual", "none", "other"]);
export const HEALTH_SCREENING_TYPE_SOURCES = new Set(["self", "admin", "legacy_firestore_backfill"]);
export const HEALTH_SCREENING_TYPE_WRITE_SOURCES = new Set(["self", "admin"]);
export const HEALTH_SCREENING_TYPE_COLLECTION = "staff_health_screening_types_qa";
export const HEALTH_SCREENING_TYPE_PRODUCTION_COLLECTION = "staff_health_screening_types";

export class HealthScreeningTypeError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function validateScreeningYear(value) {
  const year = typeof value === "string" && /^\d{4}$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new HealthScreeningTypeError("학년도를 확인해 주세요.");
  }
  return year;
}

export function healthScreeningTypeCollection(context = process.env) {
  const environment = trainingEnvironment(context);
  if (!environment) throw new HealthScreeningTypeError("승인된 배포 환경이 필요합니다.", 503);
  return environment === "qa" ? HEALTH_SCREENING_TYPE_COLLECTION : HEALTH_SCREENING_TYPE_PRODUCTION_COLLECTION;
}

export function healthScreeningTypeDocumentId(staffId, schoolYear) {
  if (typeof staffId !== "string" || !staffId || staffId.includes("/")) {
    throw new HealthScreeningTypeError("교직원 정보를 확인해 주세요.");
  }
  validateScreeningYear(schoolYear);
  return `${staffId}_${schoolYear}`;
}

function reference(db, staffId, schoolYear, context) {
  const collection = healthScreeningTypeCollection(context);
  if (trainingEnvironment(context) === "production" && /^QA[-_]/i.test(String(staffId || ""))) {
    throw new HealthScreeningTypeError("교직원 권한이 필요합니다.", 403);
  }
  return db.collection(collection).doc(healthScreeningTypeDocumentId(staffId, schoolYear));
}

export function validHealthScreeningTypeRecord(item, staffId, schoolYear, environment = "qa") {
  return ["qa", "production"].includes(environment) && item?.staffId === staffId && item.schoolYear === schoolYear && item.environment === environment
    && (environment !== "production" || !/^QA[-_]/i.test(String(staffId || "")))
    && item.schemaVersion === 1 && Number.isInteger(item.revision) && item.revision > 0
    && item.screeningTypeConfirmed === true && HEALTH_SCREENING_TYPES.has(item.screeningType)
    && HEALTH_SCREENING_TYPE_SOURCES.has(item.source)
    && (item.source !== "legacy_firestore_backfill" || Boolean(item.selfChoice === null && item.confirmedBy === null
      && item.confirmedAt === null && item.migration?.id && item.migration?.importedAt
      && item.migration?.sourceCollection === "staff_submission_status"
      && item.migration?.sourceDocumentId === `${staffId}_tb-screening-${schoolYear}` && item.migration?.manifestHash));
}

export function unconfirmedScreeningType(staffId, schoolYear) {
  return { staffId, schoolYear, screeningType: null, screeningTypeConfirmed: false, revision: 0 };
}

export async function readHealthScreeningType(db, staffId, schoolYear, context = process.env) {
  const snapshot = await reference(db, staffId, schoolYear, context).get();
  const item = snapshot.exists ? snapshot.data() : null;
  return validHealthScreeningTypeRecord(item, staffId, schoolYear, trainingEnvironment(context)) ? item : unconfirmedScreeningType(staffId, schoolYear);
}

export async function listHealthScreeningTypes(db, schoolYear, context = process.env) {
  validateScreeningYear(schoolYear);
  const snapshot = await db.collection(healthScreeningTypeCollection(context)).where("schoolYear", "==", schoolYear).get();
  return snapshot.docs.map((doc) => doc.data()).filter((item) => validHealthScreeningTypeRecord(item, item.staffId, schoolYear, trainingEnvironment(context)));
}

export async function readHealthScreeningTypeHistory(db, staffId, schoolYear, context = process.env) {
  const snapshot = await reference(db, staffId, schoolYear, context).collection("history").orderBy("revision", "asc").get();
  return snapshot.docs.map((doc) => doc.data()).filter((item) => validHealthScreeningTypeRecord(item, staffId, schoolYear, trainingEnvironment(context)));
}

export async function saveHealthScreeningType(db, {
  staffId, schoolYear, screeningType, source, confirmedBy, expectedRevision, confirmedAt,
}, context = process.env) {
  if (!HEALTH_SCREENING_TYPES.has(screeningType)) throw new HealthScreeningTypeError("검진 유형을 선택해 주세요.");
  if (!HEALTH_SCREENING_TYPE_WRITE_SOURCES.has(source)) throw new HealthScreeningTypeError("요청 유형을 확인해 주세요.");
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new HealthScreeningTypeError("현재 변경 번호를 확인해 주세요.");
  validateScreeningYear(schoolYear);
  if (trainingEnvironment(context) === "production" && /^QA[-_]/i.test(String(confirmedBy || ""))) throw new HealthScreeningTypeError("교직원 권한이 필요합니다.", 403);
  const ref = reference(db, staffId, schoolYear, context);
  const environment = trainingEnvironment(context);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const previous = snapshot.exists ? snapshot.data() : null;
    if (previous && !validHealthScreeningTypeRecord(previous, staffId, schoolYear, environment)) {
      throw new HealthScreeningTypeError("저장된 검진 유형 정보를 확인할 수 없습니다.", 409);
    }
    const revision = previous?.revision || 0;
    if (expectedRevision !== revision) {
      throw new HealthScreeningTypeError("다른 변경이 저장되었습니다. 새로고침 후 다시 시도해 주세요.", 409);
    }
    const choice = { screeningType, confirmedAt, confirmedBy };
    const item = {
      staffId, schoolYear, screeningType, screeningTypeConfirmed: true, confirmedAt, confirmedBy,
      source, selfChoice: source === "self" ? choice : previous?.selfChoice || null,
      ...(previous?.migration ? { migration: previous.migration } : {}),
      createdAt: previous?.createdAt || confirmedAt, updatedAt: confirmedAt,
      environment, schemaVersion: 1, revision: revision + 1,
    };
    transaction.set(ref, item);
    transaction.create(ref.collection("history").doc(String(item.revision)), { ...item, previousScreeningType: previous?.screeningType || null });
    return item;
  });
}
