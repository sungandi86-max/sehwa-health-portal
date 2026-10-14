import { trainingEnvironment } from "./trainingDeployment.js";

export const HEALTH_SCREENING_TYPES = new Set(["nhis", "employment", "none", "other"]);
export const HEALTH_SCREENING_TYPE_COLLECTION = "staff_health_screening_types_qa";

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
  if (trainingEnvironment(context) !== "qa") throw new HealthScreeningTypeError("QA 환경이 필요합니다.", 503);
  return HEALTH_SCREENING_TYPE_COLLECTION;
}

export function healthScreeningTypeDocumentId(staffId, schoolYear) {
  if (typeof staffId !== "string" || !staffId || staffId.includes("/")) {
    throw new HealthScreeningTypeError("교직원 정보를 확인해 주세요.");
  }
  validateScreeningYear(schoolYear);
  return `${staffId}_${schoolYear}`;
}

function reference(db, staffId, schoolYear) {
  return db.collection(HEALTH_SCREENING_TYPE_COLLECTION).doc(healthScreeningTypeDocumentId(staffId, schoolYear));
}

export function validHealthScreeningTypeRecord(item, staffId, schoolYear) {
  return item?.staffId === staffId && item.schoolYear === schoolYear && item.environment === "qa"
    && item.schemaVersion === 1 && Number.isInteger(item.revision) && item.revision > 0
    && item.screeningTypeConfirmed === true && HEALTH_SCREENING_TYPES.has(item.screeningType);
}

export function unconfirmedScreeningType(staffId, schoolYear) {
  return { staffId, schoolYear, screeningType: null, screeningTypeConfirmed: false, revision: 0 };
}

export async function readHealthScreeningType(db, staffId, schoolYear) {
  const snapshot = await reference(db, staffId, schoolYear).get();
  const item = snapshot.exists ? snapshot.data() : null;
  return validHealthScreeningTypeRecord(item, staffId, schoolYear) ? item : unconfirmedScreeningType(staffId, schoolYear);
}

export async function listHealthScreeningTypes(db, schoolYear) {
  const snapshot = await db.collection(HEALTH_SCREENING_TYPE_COLLECTION).where("schoolYear", "==", schoolYear).get();
  return snapshot.docs.map((doc) => doc.data()).filter((item) => validHealthScreeningTypeRecord(item, item.staffId, schoolYear));
}

export async function readHealthScreeningTypeHistory(db, staffId, schoolYear) {
  const snapshot = await reference(db, staffId, schoolYear).collection("history").orderBy("revision", "asc").get();
  return snapshot.docs.map((doc) => doc.data()).filter((item) => validHealthScreeningTypeRecord(item, staffId, schoolYear));
}

export async function saveHealthScreeningType(db, {
  staffId, schoolYear, screeningType, source, confirmedBy, expectedRevision, confirmedAt,
}) {
  if (!HEALTH_SCREENING_TYPES.has(screeningType)) throw new HealthScreeningTypeError("검진 유형을 선택해 주세요.");
  if (!["self", "admin"].includes(source)) throw new HealthScreeningTypeError("요청 유형을 확인해 주세요.");
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new HealthScreeningTypeError("현재 변경 번호를 확인해 주세요.");
  validateScreeningYear(schoolYear);
  const ref = reference(db, staffId, schoolYear);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const previous = snapshot.exists ? snapshot.data() : null;
    if (previous && !validHealthScreeningTypeRecord(previous, staffId, schoolYear)) {
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
      createdAt: previous?.createdAt || confirmedAt, updatedAt: confirmedAt,
      environment: "qa", schemaVersion: 1, revision: revision + 1,
    };
    transaction.set(ref, item);
    transaction.create(ref.collection("history").doc(String(item.revision)), { ...item, previousScreeningType: previous?.screeningType || null });
    return item;
  });
}
