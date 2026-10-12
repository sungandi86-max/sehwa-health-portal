import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { buildLegacyStudentSubmissionRecord, planLegacyStudentSubmissionMigration } from
  "../server/lib/studentSubmissionAuditStore.js";

const PROJECT = "sehwa-health-portal-v2";
const COLLECTION = "student_submission_audit_production";
const SOURCE_SHEET_ID = 310103;
const EXPECTED_FINGERPRINTS = Object.freeze({
  2: "4035a153128c9408e08a66147aff1b5cd38807868449f199651ae7751d0d1991",
  3: "d7e256609dd3db987523df5f7d2d20f0aea65a04472937c009eb81fbfa2f134e",
  4: "1c3f301c5bbee32476b38815069e6782d374f7170b398f8309f90b20682cac76",
});
const args = process.argv.slice(2);
const sourcePath = args.find((arg) => arg.startsWith("--source="))?.slice("--source=".length);
const apply = args.includes("--apply");
if (!sourcePath || args.some((arg) => !arg.startsWith("--source=") && arg !== "--apply")) {
  throw new Error("사용법: node scripts/migrateStudentSubmissionAuditProduction.mjs --source=<검증한 원본 JSON> [--apply]");
}

const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const expectedHeaders = ["제출일시", "제출항목", "구분", "성명", "소속부서", "이수일자", "파일명", "파일URL",
  "처리상태", "비고", "제출ID", "제출항목ID", "제출명_정규화", "교직원ID", "파일ID", "파일MIME",
  "AI처리상태", "AI_이수번호", "AI_기관명", "AI_이수일자", "AI_연수명", "AI_연수시간", "AI검증결과",
  "관리자확인", "AI추출메모", "최종수정일", "제출항목명", "제출유형", "학년", "반", "번호",
  "학생명", "진료일", "의료기관명", "저장폴더ID"];
assert.deepEqual(source.headers, expectedHeaders, "운영 원본 35개 헤더가 변경됐습니다.");
assert.equal(source.sheetId, SOURCE_SHEET_ID, "원본 탭 ID가 일치하지 않습니다.");
assert.equal(source.rows?.length, 3, "운영 원본 행 수가 변경됐습니다.");
const rows = source.rows.map((row) => {
  assert.ok([2, 3, 4].includes(row.rowNumber), "예상하지 않은 원본 행입니다.");
  assert.equal(row.values.length, 35, "원본 열 수가 변경됐습니다.");
  assert.equal(row.evidence?.exists, true, "Drive 증빙 메타데이터를 확인해야 합니다.");
  return { ...row, headers: source.headers };
});
assert.deepEqual(rows.map((row) => row.rowNumber), [2, 3, 4], "원본 행 순서가 변경됐습니다.");
const sourceRecords = rows.map((row) => buildLegacyStudentSubmissionRecord({
  ...row, environment: "production", now: new Date(),
}));
for (const record of sourceRecords) {
  assert.equal(record.originalRowFingerprint, EXPECTED_FINGERPRINTS[record.originalRowNumber],
    `원본 ${record.originalRowNumber}행 지문이 변경됐습니다.`);
  assert.equal(record.canonicalStudentKey, null);
  assert.equal(record.manualReview, true);
  assert.equal(record.evidenceFiles[0].exists, true);
}

const token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();
const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${COLLECTION}`;
const headers = { Authorization: `Bearer ${token}` };
const decode = (value) => {
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decode);
  if ("mapValue" in value) return Object.fromEntries(
    Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)]));
  throw new Error("지원하지 않는 Firestore 필드 유형입니다.");
};
const encode = (value) => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value)
    ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === "object") return { mapValue: { fields: Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
  throw new Error("지원하지 않는 원본 필드 유형입니다.");
};
async function list() {
  const response = await fetch(`${base}?pageSize=100`, { headers });
  if (!response.ok) throw new Error(`Firestore 조회 실패: HTTP ${response.status}`);
  const body = await response.json();
  if (body.nextPageToken) throw new Error("원장에 예상보다 많은 문서가 있습니다.");
  return (body.documents || []).map((document) => ({
    id: document.name.split("/").at(-1),
    data: Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decode(value)])),
  }));
}
function classify(documents) {
  if (documents.some(({ id, data }) => id !== data.submissionId || data.environment !== "production" ||
    data.submissionId !== sourceRecords.find((record) => record.submissionId === data.submissionId)?.submissionId)) {
    throw new Error("운영 원장에 출처 불명 또는 환경이 다른 문서가 있습니다.");
  }
  const plan = planLegacyStudentSubmissionMigration({
    rows, environment: "production", existing: documents.map(({ data }) => data), now: new Date(),
  });
  if (plan.conflict || documents.length !== plan.skip) throw new Error("원장 충돌 또는 출처 불명 문서가 있습니다.");
  return plan;
}
const before = await list();
const plan = classify(before);
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", existing: before.length,
  canonicalCreate: plan.canonicalCreate, manualReviewCreate: plan.manualReview,
  skip: plan.skip, conflict: plan.conflict }));
if (apply) {
  for (const record of plan.records) {
    const response = await fetch(`${base}?documentId=${encodeURIComponent(record.submissionId)}`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: Object.fromEntries(
        Object.entries(record).map(([key, value]) => [key, encode(value)])) }),
    });
    if (!response.ok) throw new Error(`create-only 이관 실패: ${record.originalRowNumber}행 HTTP ${response.status}`);
  }
  const after = await list();
  assert.equal(after.length, 3, "운영 감사 원장 3건이 아닙니다.");
  for (const original of sourceRecords) {
    const saved = after.find(({ id }) => id === original.submissionId)?.data;
    assert.ok(saved, `${original.originalRowNumber}행 이관 문서가 없습니다.`);
    for (const key of ["originalRowNumber", "originalRowFingerprint", "originalFields", "studentIdentity",
      "submissionType", "submittedAt", "source", "environment", "canonicalStudentKey", "manualReview",
      "manualReviewReasons", "signedPath", "legacy", "evidenceFiles"]) {
      assert.deepEqual(saved[key], original[key], `${original.originalRowNumber}행 ${key} 불일치`);
    }
  }
  const rerun = classify(after);
  assert.deepEqual([rerun.canonicalCreate, rerun.manualReview, rerun.skip, rerun.conflict], [0, 0, 3, 0]);
  console.log(JSON.stringify({ applied: plan.records.length, readBack: after.length, manualReview: 3,
    canonicalStudentKeys: after.filter(({ data }) => data.canonicalStudentKey !== null).length,
    rerun: { create: 0, update: 0, skip: rerun.skip, conflict: rerun.conflict }, parity: "PASS" }));
}
