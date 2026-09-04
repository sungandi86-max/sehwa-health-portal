import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "../lib/firebaseAdmin.js";

const AGGREGATE_COLLECTION = "student_care_monthly_aggregates";
const PRESENCE_PUBLIC_COLLECTION = "student_care_presence_public";
const EXPECTED_SOURCE_TYPE = "google_sheet";
const EXPECTED_SOURCE_SHEET = "학생 보건실 입실현황";
const AGGREGATE_FORBIDDEN_KEYS = new Set([
  "name",
  "maskedName",
  "number",
  "studentNo",
  "rowId",
  "symptom",
  "treatment",
  "resultDetail",
  "diseaseName",
  "diagnosis",
  "diagnosisName",
  "note",
  "memo",
  "contact",
  "phone",
  "guardian",
  "protectedStudent",
]);
const PRESENCE_PUBLIC_FORBIDDEN_KEYS = new Set([
  "name",
  "studentName",
  "realName",
  "symptom",
  "treatment",
  "resultDetail",
  "diseaseName",
  "diagnosis",
  "diagnosisName",
  "note",
  "memo",
  "contact",
  "phone",
  "guardian",
  "protectedStudent",
]);

function getProxySecret() {
  return process.env.STUDENT_CARE_PROXY_SECRET || "";
}

async function getRequestBody(req) {
  if (req.body && typeof req.body === "object") return req.body;

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return null;
    }
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const bodyText = Buffer.concat(chunks).toString("utf8");
  if (!bodyText) return {};

  try {
    return JSON.parse(bodyText);
  } catch {
    return null;
  }
}

function jsonError(res, status, message) {
  return res.status(status).json({ ok: false, message });
}

function hasValidSecret(req, body) {
  const expected = getProxySecret();
  if (!expected) return false;

  const headerSecret = req.headers["x-student-care-proxy-secret"];
  const provided = typeof headerSecret === "string" ? headerSecret : body?.proxySecret;
  return provided === expected;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function containsForbiddenKey(value, forbiddenKeys) {
  if (Array.isArray(value)) return value.some((item) => containsForbiddenKey(item, forbiddenKeys));
  if (!isPlainObject(value)) return false;

  return Object.entries(value).some(([key, nestedValue]) => (
    forbiddenKeys.has(key) || containsForbiddenKey(nestedValue, forbiddenKeys)
  ));
}

function hasOnlyKeys(value, allowedKeys) {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isStatsArray(value) {
  return Array.isArray(value) && value.every((item) => isPlainObject(item));
}

function parseAggregate(value) {
  if (!isPlainObject(value)) {
    return { ok: false, message: "동기화할 월별 통계 payload가 필요합니다." };
  }

  if (!hasOnlyKeys(value, ["schoolYear", "month", "summary", "gradeStats", "classStats", "source"])) {
    return { ok: false, message: "월별 통계 payload에 허용되지 않는 필드가 있습니다." };
  }

  if (containsForbiddenKey(value, AGGREGATE_FORBIDDEN_KEYS)) {
    return { ok: false, message: "월별 익명 통계에 학생 개인 식별 필드가 포함되어 있습니다." };
  }

  if (!Number.isInteger(value.schoolYear) || value.schoolYear < 2000 || value.schoolYear > 2100) {
    return { ok: false, message: "학년도 값이 올바르지 않습니다." };
  }

  if (typeof value.month !== "string" || !/^\d{4}-\d{2}$/.test(value.month)) {
    return { ok: false, message: "조회 월은 YYYY-MM 형식이어야 합니다." };
  }

  if (!isPlainObject(value.summary)) {
    return { ok: false, message: "summary는 객체여야 합니다." };
  }

  if (!isStatsArray(value.gradeStats) || !isStatsArray(value.classStats)) {
    return { ok: false, message: "gradeStats와 classStats는 배열이어야 합니다." };
  }

  if (
    !isPlainObject(value.source) ||
    value.source.type !== EXPECTED_SOURCE_TYPE ||
    value.source.sheetName !== EXPECTED_SOURCE_SHEET
  ) {
    return { ok: false, message: "원본 source 정보가 올바르지 않습니다." };
  }

  return {
    ok: true,
    aggregate: {
      schoolYear: value.schoolYear,
      month: value.month,
      summary: value.summary,
      gradeStats: value.gradeStats,
      classStats: value.classStats,
      source: {
        type: EXPECTED_SOURCE_TYPE,
        sheetName: EXPECTED_SOURCE_SHEET,
      },
    },
  };
}

function parsePresenceItem(value) {
  if (!isPlainObject(value)) {
    return { ok: false, message: "보건실 소재 projection 항목은 객체여야 합니다." };
  }

  if (!hasOnlyKeys(value, [
    "schoolYear",
    "semester",
    "date",
    "month",
    "grade",
    "classNo",
    "number",
    "studentNo",
    "maskedName",
    "enteredAt",
    "returnedAt",
    "status",
    "sourceRef",
  ])) {
    return { ok: false, message: "보건실 소재 projection 항목에 허용되지 않는 필드가 있습니다." };
  }

  if (containsForbiddenKey(value, PRESENCE_PUBLIC_FORBIDDEN_KEYS)) {
    return { ok: false, message: "보건실 소재 projection에 학생 건강 상세 필드가 포함되어 있습니다." };
  }

  if (!Number.isInteger(value.schoolYear) || value.schoolYear < 2000 || value.schoolYear > 2100) {
    return { ok: false, message: "학년도 값이 올바르지 않습니다." };
  }

  if (!Number.isInteger(value.semester) || ![1, 2].includes(value.semester)) {
    return { ok: false, message: "학기 값이 올바르지 않습니다." };
  }

  if (typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) {
    return { ok: false, message: "날짜는 YYYY-MM-DD 형식이어야 합니다." };
  }

  if (typeof value.month !== "string" || !/^\d{4}-\d{2}$/.test(value.month)) {
    return { ok: false, message: "월은 YYYY-MM 형식이어야 합니다." };
  }

  if (![value.grade, value.classNo, value.number].every(Number.isInteger)) {
    return { ok: false, message: "학년, 반, 번호는 숫자여야 합니다." };
  }

  if (typeof value.maskedName !== "string" || !value.maskedName.trim()) {
    return { ok: false, message: "마스킹된 학생 이름이 필요합니다." };
  }

  if (typeof value.studentNo !== "string" || !value.studentNo.trim()) {
    return { ok: false, message: "표시용 학번 정보가 필요합니다." };
  }

  if (![value.enteredAt, value.returnedAt, value.status].every((item) => typeof item === "string")) {
    return { ok: false, message: "입실/복귀/상태 값이 올바르지 않습니다." };
  }

  if (
    !isPlainObject(value.sourceRef) ||
    value.sourceRef.type !== EXPECTED_SOURCE_TYPE ||
    value.sourceRef.sheetName !== EXPECTED_SOURCE_SHEET ||
    !Number.isInteger(value.sourceRef.rowNumber)
  ) {
    return { ok: false, message: "원본 행 참조가 올바르지 않습니다." };
  }

  return {
    ok: true,
    item: {
      schoolYear: value.schoolYear,
      semester: value.semester,
      date: value.date,
      month: value.month,
      grade: value.grade,
      classNo: value.classNo,
      number: value.number,
      studentNo: value.studentNo,
      maskedName: value.maskedName.trim(),
      enteredAt: value.enteredAt,
      returnedAt: value.returnedAt,
      status: value.status,
      sourceRef: {
        type: EXPECTED_SOURCE_TYPE,
        sheetName: EXPECTED_SOURCE_SHEET,
        rowNumber: value.sourceRef.rowNumber,
      },
    },
  };
}

function parsePresencePublic(value) {
  if (!isPlainObject(value)) {
    return { ok: false, message: "동기화할 보건실 소재 payload가 필요합니다." };
  }

  if (!hasOnlyKeys(value, ["schoolYear", "semester", "date", "month", "items", "source"])) {
    return { ok: false, message: "보건실 소재 payload에 허용되지 않는 필드가 있습니다." };
  }

  if (containsForbiddenKey(value, PRESENCE_PUBLIC_FORBIDDEN_KEYS)) {
    return { ok: false, message: "보건실 소재 projection에 학생 건강 상세 필드가 포함되어 있습니다." };
  }

  if (!Number.isInteger(value.schoolYear) || value.schoolYear < 2000 || value.schoolYear > 2100) {
    return { ok: false, message: "학년도 값이 올바르지 않습니다." };
  }

  if (!Number.isInteger(value.semester) || ![1, 2].includes(value.semester)) {
    return { ok: false, message: "학기 값이 올바르지 않습니다." };
  }

  if (typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) {
    return { ok: false, message: "날짜는 YYYY-MM-DD 형식이어야 합니다." };
  }

  if (typeof value.month !== "string" || value.month !== value.date.slice(0, 7)) {
    return { ok: false, message: "월 값이 날짜와 일치하지 않습니다." };
  }

  if (
    !isPlainObject(value.source) ||
    value.source.type !== EXPECTED_SOURCE_TYPE ||
    value.source.sheetName !== EXPECTED_SOURCE_SHEET
  ) {
    return { ok: false, message: "원본 source 정보가 올바르지 않습니다." };
  }

  if (!Array.isArray(value.items)) {
    return { ok: false, message: "보건실 소재 items는 배열이어야 합니다." };
  }

  const items = [];
  const ids = new Set();
  for (const rawItem of value.items) {
    const parsed = parsePresenceItem(rawItem);
    if (!parsed.ok) return parsed;
    if (
      parsed.item.schoolYear !== value.schoolYear ||
      parsed.item.semester !== value.semester ||
      parsed.item.date !== value.date ||
      parsed.item.month !== value.month
    ) {
      return { ok: false, message: "보건실 소재 항목의 기준 날짜가 payload와 일치하지 않습니다." };
    }

    const id = getPresencePublicId(parsed.item);
    if (ids.has(id)) {
      return { ok: false, message: "중복된 보건실 소재 sourceRef가 있습니다." };
    }
    ids.add(id);
    items.push({ id, data: parsed.item });
  }

  return {
    ok: true,
    presence: {
      schoolYear: value.schoolYear,
      semester: value.semester,
      date: value.date,
      month: value.month,
      items,
      source: {
        type: EXPECTED_SOURCE_TYPE,
        sheetName: EXPECTED_SOURCE_SHEET,
      },
    },
  };
}

function getAggregateId(schoolYear, month) {
  return `${schoolYear}_${month.slice(5, 7)}`;
}

function getPresencePublicId(item) {
  return `${item.schoolYear}_${item.semester}_${item.date}_row_${item.sourceRef.rowNumber}`;
}

async function syncMonthlyAggregate(body, res) {
  const parsed = parseAggregate(body.aggregate);
  if (!parsed.ok) {
    return jsonError(res, 400, parsed.message);
  }

  const { aggregate } = parsed;
  const aggregateId = getAggregateId(aggregate.schoolYear, aggregate.month);

  await getFirebaseAdminDb()
    .collection(AGGREGATE_COLLECTION)
    .doc(aggregateId)
    .set({
      ...aggregate,
      syncedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

  return res.status(200).json({
    ok: true,
    id: aggregateId,
    collection: AGGREGATE_COLLECTION,
  });
}

async function syncPresencePublic(body, res) {
  const parsed = parsePresencePublic(body.presencePublic);
  if (!parsed.ok) {
    return jsonError(res, 400, parsed.message);
  }

  const { presence } = parsed;
  const db = getFirebaseAdminDb();
  const collectionRef = db.collection(PRESENCE_PUBLIC_COLLECTION);
  const existingSnapshot = await collectionRef
    .where("schoolYear", "==", presence.schoolYear)
    .where("semester", "==", presence.semester)
    .where("date", "==", presence.date)
    .get();
  const nextIds = new Set(presence.items.map((item) => item.id));
  const batch = db.batch();

  presence.items.forEach((item) => {
    batch.set(collectionRef.doc(item.id), {
      ...item.data,
      syncedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  existingSnapshot.docs.forEach((docSnapshot) => {
    if (!nextIds.has(docSnapshot.id)) {
      batch.delete(docSnapshot.ref);
    }
  });

  await batch.commit();

  return res.status(200).json({
    ok: true,
    collection: PRESENCE_PUBLIC_COLLECTION,
    date: presence.date,
    written: presence.items.length,
    removed: existingSnapshot.docs.filter((docSnapshot) => !nextIds.has(docSnapshot.id)).length,
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return jsonError(res, 405, "허용되지 않는 요청 방식입니다.");
  }

  const body = await getRequestBody(req);
  if (!body) {
    return jsonError(res, 400, "요청 본문을 JSON으로 해석할 수 없습니다.");
  }

  if (!hasValidSecret(req, body)) {
    return jsonError(res, 403, "학생 건강관리 동기화 권한을 확인할 수 없습니다.");
  }

  if (body.type === "presencePublic") {
    return syncPresencePublic(body, res);
  }

  return syncMonthlyAggregate(body, res);
}
