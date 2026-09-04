import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "../lib/firebaseAdmin.js";

const AGGREGATE_COLLECTION = "student_care_monthly_aggregates";
const EXPECTED_SOURCE_TYPE = "google_sheet";
const EXPECTED_SOURCE_SHEET = "학생 보건실 입실현황";
const FORBIDDEN_KEYS = new Set([
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

function containsForbiddenKey(value) {
  if (Array.isArray(value)) return value.some((item) => containsForbiddenKey(item));
  if (!isPlainObject(value)) return false;

  return Object.entries(value).some(([key, nestedValue]) => (
    FORBIDDEN_KEYS.has(key) || containsForbiddenKey(nestedValue)
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

  if (containsForbiddenKey(value)) {
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

function getAggregateId(schoolYear, month) {
  return `${schoolYear}_${month.slice(5, 7)}`;
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
