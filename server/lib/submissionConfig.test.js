import assert from "node:assert/strict";
import test from "node:test";
import { assertRegistrationOpen, publicSubmissionConfig, readSubmissionConfig, submissionCollections,
  saveSubmissionCard, validatePublicCard } from "./submissionConfig.js";
import { planSubmissionConfigMigration, submissionConfigMigrationRecords } from "./submissionConfigMigration.js";

const qa = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" };
const production = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" };
const uploadHeaders = ["사용여부", "제목", "제목1줄", "제목2줄", "설명", "대상", "제출자료", "마감", "안내문",
  "버튼명", "링크", "상태", "유형", "강조", "정렬순서", "노출시작일", "노출종료일", "노출상태"];
const itemHeaders = ["제출항목ID", "사용여부", "홈노출", "표시순서", "상태", "제출명", "담당부서", "대상",
  "연수시간/기준", "연수내용", "마감일", "저장폴더ID", "AI추출여부", "필수추출항목", "링크", "비고",
  "노출시작일", "노출종료일", "최종수정일"];
const uploadRows = [uploadHeaders,
  ["TRUE", "심폐소생술 이수증 제출", "심폐소생술", "이수증 제출", "CPR 설명", "교직원", "PDF", "11월", "안내", "제출", "private-folder-id", "접수 중", "file", "TRUE", "1"],
  ["TRUE", "개별 건강검진 확인서 제출", "결핵검진", "확인증 제출", "TB 설명", "교직원", "PDF", "12월", "안내", "제출", "private-folder-id", "접수 중", "file", "TRUE", "2"],
  ["FALSE", "채용검진 대체 인정 확인 요청", "채용검진", "확인 요청", "요청 설명", "교직원", "없음", "11월", "안내", "요청", "", "보류", "request", "FALSE", "3"],
  ["TRUE", "감염병 발생 보고", "감염병", "보고", "보고 설명", "담임", "보고", "수시", "안내", "보고", "", "접수 중", "infection", "TRUE", "4"],
  ["TRUE", "결핵검진 진료회신 제출", "결핵검진", "진료회신 제출", "학생 설명", "학생", "PDF", "8월", "안내", "제출", "private-folder-id", "접수 중", "file", "TRUE", "5"],
  ["TRUE", "교직원 결핵검진 단체검진 신청", "결핵검진", "단체검진 신청", "신청 설명", "교직원", "없음", "9월", "안내", "신청", "", "신청 준비", "tb_group_request", "TRUE", "6", "2026-09-11", "2026-09-14", "접수 중"]];
const itemRows = [itemHeaders,
  ["CERT-2026-009", "보류", "숨김", "", "보류", "연수 A", "보건실", "교직원", "1회", "", "", "", "사용", "", "not-public", ""],
  ["CERT-2026-010", "보류", "숨김", "", "보류", "연수 B", "보건실", "교직원", "1회", "", "", "", "사용", "", "not-public", ""],
  ["TB-REPLY-2026-001", "사용", "노출", "5", "접수 중", "결핵검진 진료회신 제출", "보건실", "학생", "", "", "", "", "미사용", "", "not-public", ""]];

test("submission config environment is separated and arbitrary Preview fails closed", () => {
  assert.deepEqual(submissionCollections(qa), { public: "submission_public_config_qa", admin: "submission_admin_config_qa" });
  assert.deepEqual(submissionCollections(production), { public: "submission_public_config_production", admin: "submission_admin_config_production" });
  assert.throws(() => submissionCollections({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature" }));
});

test("six cards and three legacy items migrate without publishing destinations", () => {
  const result = submissionConfigMigrationRecords(uploadRows, itemRows);
  assert.equal(result.public.length, 7);
  assert.equal(result.admin.length, 5);
  assert.deepEqual(result.public.slice(1).map((record) => record.id), ["cpr", "tb", "recruit", "infection", "student_tb_reply", "tb_registration"]);
  assert.equal(result.public[1].publicUrl, "");
  assert.equal(JSON.stringify(result.public).includes("private-folder-id"), false);
  assert.equal(JSON.stringify(result.admin).includes("not-public"), false);
  assert.equal(result.admin[4].canonicalType, "student_tb_reply");
  assert.equal(result.admin[2].active, false);
  assert.equal(result.admin[1].endAt, "2026-09-14");
  assert.deepEqual(planSubmissionConfigMigration(result, { public: [], admin: [] }).actions,
    { create: 12, update: 0, skip: 0, conflict: 0 });
  assert.deepEqual(planSubmissionConfigMigration(result, result).actions,
    { create: 0, update: 0, skip: 12, conflict: 0 });
});

test("migration rejects schema drift and existing mismatched records", () => {
  assert.throws(() => submissionConfigMigrationRecords([["wrong"], ...uploadRows.slice(1)], itemRows));
  const result = submissionConfigMigrationRecords(uploadRows, itemRows);
  const existing = { public: [{ ...result.public[1], title: "다른 카드" }], admin: [] };
  assert.equal(planSubmissionConfigMigration(result, existing).actions.conflict, 1);
});

test("public projection keeps four current cards and server-only registration", () => {
  const expected = submissionConfigMigrationRecords(uploadRows, itemRows);
  const config = { cards: expected.public.slice(1), registration: expected.admin[1] };
  const result = publicSubmissionConfig(config, new Date("2026-10-09T03:00:00Z"));
  assert.deepEqual(result.uploads.map((item) => item.canonicalType), ["cpr", "tb", "infection", "student_tb_reply"]);
  assert.equal(result.tbConfig.enabled, "TRUE");
  assert.equal(JSON.stringify(result).includes("private-folder-id"), false);
  assert.throws(() => assertRegistrationOpen(config, new Date("2026-10-09T03:00:00Z")));
  assert.doesNotThrow(() => assertRegistrationOpen(config, new Date("2026-09-12T03:00:00Z")));
});

test("public card validation drops server-only keys and rejects unsafe links", () => {
  const card = validatePublicCard({ canonicalType: "cpr", title: "테스트", description: "", sortOrder: 1,
    visible: true, active: true, folderId: "private", auditSheet: "secret" });
  assert.equal(Object.hasOwn(card, "folderId"), false);
  assert.equal(Object.hasOwn(card, "auditSheet"), false);
  assert.throws(() => validatePublicCard({ ...card, publicUrl: "https://drive.google.com/private" }));
  for (const canonicalType of ["inbody", "other"]) {
    assert.throws(() => validatePublicCard({ ...card, canonicalType }));
  }
});

test("Firestore reader requires both migration markers", async () => {
  const expected = submissionConfigMigrationRecords(uploadRows, itemRows);
  const db = { collection(name) { const group = name.endsWith("_qa") && name.startsWith("submission_public") ? expected.public : expected.admin;
    return { get: async () => ({ docs: group.map((item) => ({ id: item.id, data: () => item })) }) }; } };
  const result = await readSubmissionConfig(db, { context: qa });
  assert.equal(result.cards.length, 6);
  assert.equal(result.registration.kind, "registration");
});

test("administrator cannot create a card before migration marker exists", async () => {
  let writes = 0;
  const db = { collection() { return { get: async () => ({ docs: [] }), doc() { writes += 1; throw new Error("unexpected write"); } }; } };
  await assert.rejects(saveSubmissionCard(db, { context: qa, action: "add", input: { canonicalType: "cpr",
    title: "[QA] 테스트", sortOrder: 1, active: true, visible: false }, actorUid: "test" }), /준비되지 않았습니다/);
  assert.equal(writes, 0);
});
