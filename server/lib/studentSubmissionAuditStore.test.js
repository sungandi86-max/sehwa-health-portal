import assert from "node:assert/strict";
import test from "node:test";
import { buildLegacyStudentSubmissionRecord, planLegacyStudentSubmissionMigration,
  StudentSubmissionAuditStore, studentEvidenceIdFromUrl } from "./studentSubmissionAuditStore.js";
import rawSubmitHandler from "../../api/submit.js";
import { submissionResourceContext } from "../../tests/fixtures/submissionResourceContext.js";

import { buildScriptSubmission, SUBMISSION_WORKFLOWS } from "./submissionWorkflows.js";
import { buildSubmissionProxyEnvelope, qaStudentSubmissionIdentity, submissionVisitor } from "./submissionProxyEnvelope.js";
import { createHash, createHmac } from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";

const headers = ["제출일시", "제출항목", "구분", "성명", "소속부서", "파일명", "파일URL", "처리상태",
  "비고", "제출ID", "제출항목ID", "파일ID", "파일MIME", "제출유형", "학년", "반", "번호", "학생명"];
const sourceRow = (rowNumber, values, evidence = { exists: true, mimeType: "application/pdf" }) =>
  ({ rowNumber, headers, values: headers.map((header) => values[header] || ""), evidence });
const legacy = sourceRow(2, { "제출일시": "2026-07-10 8:17:51", "제출유형": "student-file", "학년": "2",
  "반": "9", "번호": "28", "학생명": "[QA] student", "파일명": "QA-legacy.pdf",
  "파일URL": "https://drive.google.com/file/d/QA-LEGACY-FILE-001/view" });
const signed = sourceRow(3, { "제출일시": "2026-10-09 20:52:58", "구분": "student_tb_reply",
  "제출ID": "QA-SIGNED-ID", "성명": "[QA] synthetic", "파일명": "QA-signed.pdf",
  "파일URL": "https://drive.google.com/file/d/QA-SIGNED-FILE-001/view", "파일ID": "QA-SIGNED-FILE-001",
  "파일MIME": "application/pdf", "처리상태": "접수" });

test("legacy student reply retains raw fields and evidence without inferring canonical identity", () => {
  const record = buildLegacyStudentSubmissionRecord({ ...legacy, environment: "production" });
  assert.equal(record.canonicalStudentKey, null);
  assert.equal(record.matchStatus, "unmatched");
  assert.equal(record.manualReview, true);
  assert.equal(record.studentIdentity.name, "[QA] student");
  assert.equal(record.evidenceFiles[0].fileId, "QA-LEGACY-FILE-001");
  assert.equal(record.evidenceFiles[0].originalUrl, legacy.values[headers.indexOf("파일URL")]);
  assert.equal(record.originalFields["제출유형"], "student-file");
  assert.equal(record.migration.sourceRow, 2);
});

test("signed row remains manual review when student fields are incomplete", () => {
  const record = buildLegacyStudentSubmissionRecord({ ...signed, environment: "production" });
  assert.equal(record.source, "signed_sheet_migration");
  assert.equal(record.originalSubmissionId, "QA-SIGNED-ID");
  assert.equal(record.matchStatus, "incomplete");
  assert.equal(record.evidenceFiles[0].fileId, "QA-SIGNED-FILE-001");
  assert.equal(record.manualReviewReasons.includes("student_fields_incomplete"), true);
});

test("evidence mismatch or missing metadata preserves raw URL and blocks automatic canonical migration", () => {
  const mismatch = sourceRow(4, { "제출일시": "2026-10-09 20:52:58", "파일명": "QA.pdf",
    "파일URL": "https://drive.google.com/file/d/QA-URL-ID/view", "파일ID": "QA-EXPLICIT-ID" }, { exists: false });
  const record = buildLegacyStudentSubmissionRecord({ ...mismatch, environment: "production" });
  assert.equal(record.evidenceFiles[0].fileId, "QA-EXPLICIT-ID");
  assert.equal(record.evidenceFiles[0].originalUrl.includes("QA-URL-ID"), true);
  assert.equal(record.manualReviewReasons.includes("evidence_id_mismatch"), true);
  assert.equal(record.manualReviewReasons.includes("evidence_unverified"), true);
  assert.equal(studentEvidenceIdFromUrl("https://example.com/not-drive"), "");
});

test("dry-run is conflict-aware and idempotent, including manual-review legacy rows", () => {
  const input = { rows: [legacy, signed], environment: "production" };
  const first = planLegacyStudentSubmissionMigration(input);
  assert.deepEqual([first.canonicalCreate, first.manualReview, first.skip, first.conflict], [0, 2, 0, 0]);
  const second = planLegacyStudentSubmissionMigration({ ...input, existing: first.records });
  assert.deepEqual([second.canonicalCreate, second.manualReview, second.skip, second.conflict], [0, 0, 2, 0]);
  const changed = planLegacyStudentSubmissionMigration({ ...input, existing: [{ ...first.records[0], environment: "qa" }] });
  assert.equal(changed.conflict, 1);
  const reused = planLegacyStudentSubmissionMigration({ environment: "production", rows: [legacy, { ...legacy, rowNumber: 5 }] });
  assert.equal(reused.conflict, 1);
});

function database() {
  const collections = new Map();
  return { collections, collection(name) { return {
    doc(id) { return { async get() { const value = collections.get(name)?.get(id);
      return { exists: Boolean(value), data: () => value }; }, async create(value) {
      if (!collections.has(name)) collections.set(name, new Map());
      if (collections.get(name).has(id)) throw new Error("duplicate");
      collections.get(name).set(id, value);
    } }; },
    async get() { return { docs: [...(collections.get(name) || new Map())].map(([id, value]) =>
      ({ id, data: () => value })) }; },
    where(field, operator, expected) { assert.equal(operator, "=="); return { async get() {
      return { docs: [...(collections.get(name) || new Map())]
        .filter(([, value]) => value[field] === expected)
        .map(([id, value]) => ({ id, data: () => value })) };
    } }; },
  }; } };
}

test("QA signed and legacy fixtures read back in QA only without a Drive or Sheet write", async () => {
  const db = database();
  let sequence = 0;
  const store = new StudentSubmissionAuditStore({ database: () => db,
    context: () => ({ APP_ENV: "qa", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }),
    id: () => `QA-STUDENT-AUDIT-${++sequence}` });
  await store.createQaFixture({ pattern: "signed", evidenceFile: { fileId: "QA-EVIDENCE-001", fileName: "QA.pdf" } });
  await store.createQaFixture({ pattern: "legacy_manual_review", evidenceFile: { fileId: "QA-EVIDENCE-002", fileName: "QA.pdf" } });
  const records = await store.listQaRequests();
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((record) => record.manualReview), [false, true]);
  assert.equal(records.every((record) => record.evidenceFiles[0].lookupStatus === "synthetic_metadata_only"), true);
  assert.equal(db.collections.has("student_submission_audit_production"), false);
  const prod = new StudentSubmissionAuditStore({ database: () => db,
    context: () => ({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }) });
  await assert.rejects(prod.createQaFixture({ pattern: "signed", evidenceFile: { fileId: "QA-X", fileName: "QA.pdf" } }), /QA 감사/);
});

test("QA request create is isolated, create-only and rejects non-synthetic names", async () => {
  const db = database();
  const qa = new StudentSubmissionAuditStore({ database: () => db,
    context: () => ({ APP_ENV: "qa", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }) });
  const input = { requestId: "QA-REQUEST-001", evidenceSha256: "a".repeat(64),
    fields: { grade: "2", classNumber: "1", studentNumber: "99",
    studentName: "[QA] synthetic" }, evidenceFile: { fileId: "QA-FILE-001", fileName: "QA-test.pdf",
    mimeType: "application/pdf" } };
  const created = await qa.createQaRequest(input);
  assert.equal(created.environment, "qa");
  assert.equal(created.evidenceFiles[0].lookupStatus, "uploaded_private");
  assert.equal((await qa.getQaRequest(input.requestId)).submissionId, input.requestId);
  assert.equal((await qa.listQaRequests()).length, 1);
  await assert.rejects(qa.createQaRequest(input), /duplicate/);
  await assert.rejects(qa.createQaRequest({ ...input, requestId: "QA-REQUEST-002",
    fields: { ...input.fields, studentName: "[QA] actual person" } }), /QA 합성/);
  assert.equal(db.collections.has("student_submission_audit_production"), false);
});

test("QA evidence lookup recognizes additive v1 tag without copying or changing original audit", async () => {
  const db = database();
  const digest = createHash("sha256").update("same evidence").digest("hex");
  const v1 = { submissionId: "QA-STUDENT-TB-v1", environment: "qa", source: "qa_signed_submission",
    submissionType: "student_tb_reply", status: "recorded", evidenceSha256: digest,
    studentIdentity: { grade: "1", classNumber: "1", studentNumber: "99", name: "[QA] synthetic" },
    evidenceFiles: [{ fileId: "QA-DRIVE-V1", mimeType: "image/png", exists: true }] };
  db.collections.set("student_submission_audit_qa", new Map([[v1.submissionId, v1]]));
  const store = new StudentSubmissionAuditStore({ database: () => db,
    context: () => ({ APP_ENV: "qa", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }) });
  const matched = await store.getQaEvidenceMatch({ evidenceSha256: digest, fileMimeType: "image/png",
    fields: { grade: "1", classNumber: "1", studentNumber: "99", studentName: "[QA] synthetic" } });
  assert.equal(matched.submissionId, v1.submissionId);
  assert.equal(db.collections.get("student_submission_audit_qa").size, 1);
  assert.equal(await store.getQaEvidenceMatch({ evidenceSha256: digest, fileMimeType: "image/png",
    fields: { grade: "1", classNumber: "1", studentNumber: "100", studentName: "[QA] synthetic" } }), null);
});

const request = (payload) => ({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.9",
  "x-vercel-forwarded-for": "192.0.2.9" },
  async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(payload)); } });
const response = () => ({ statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }, end() { return this; } });

test("QA visitor ignores spoofed XFF and rejects missing, chained, or malformed platform IP", () => {
  const secret = "fixture-only-submission-secret-32bytes-minimum";
  const trusted = request({});
  const visitor = submissionVisitor(trusted, secret, { trustedVercel: true });
  trusted.headers["x-forwarded-for"] = "203.0.113.11";
  assert.equal(submissionVisitor(trusted, secret, { trustedVercel: true }), visitor);
  for (const value of ["", "192.0.2.9, 203.0.113.11", "not-an-ip", "192.0.2.999"]) {
    trusted.headers["x-vercel-forwarded-for"] = value;
    assert.equal(submissionVisitor(trusted, secret, { trustedVercel: true }), "");
  }
});

test("QA student identity stays stable across generated date and display-name changes", () => {
  const secret = "fixture-only-submission-secret-32bytes-minimum";
  const payload = { type: "student_tb_reply", fields: { grade: "1", classNumber: "1", studentNumber: "99",
    studentName: "[QA] synthetic", visitDate: "", hospitalName: "", note: "QA first note" },
  fileName: "1학년_1반_99번_[QA] synthetic_결핵검진진료회신_20261012.png", fileMimeType: "image/png",
  fileBase64: Buffer.from("same evidence").toString("base64") };
  const first = qaStudentSubmissionIdentity(payload, secret);
  const nextDay = qaStudentSubmissionIdentity({ ...payload,
    fileName: payload.fileName.replace("20261012", "20261013"),
    fields: { ...payload.fields, note: "QA corrected display note" } }, secret);
  assert.equal(first.submissionId, nextDay.submissionId);
  assert.equal(first.requestFingerprint, nextDay.requestFingerprint);
  assert.match(first.evidenceSha256, /^[a-f0-9]{64}$/);
  assert.notEqual(first.submissionId, qaStudentSubmissionIdentity({ ...payload,
    fileBase64: Buffer.from("different evidence").toString("base64") }, secret).submissionId);
  assert.notEqual(first.submissionId, qaStudentSubmissionIdentity({ ...payload,
    fields: { ...payload.fields, studentNumber: "100" } }, secret).submissionId);
});

test("retired student API rejects new, replayed and malformed submissions before any storage access", async (t) => {
  const logs = [];
  for (const method of ["error", "warn", "log"]) t.mock.method(console, method, (...args) => logs.push(args));
  for (const environment of ["qa", "production"]) {
    for (const type of ["student_tb_reply", "student-file", "student_file"]) {
      for (const variant of [
        { fields: {}, fileBase64: "invalid" },
        { fields: { grade: "QA", classNumber: "QA", studentNumber: "QA", studentName: "[QA] synthetic" },
          fileName: "QA-reply.png", fileMimeType: "image/png", fileBase64: Buffer.from("89504e470d0a1a0a00000000", "hex").toString("base64") },
        { resumeReceiptId: "cpr-" + "a".repeat(32) },
      ]) {
        const calls = [];
        const touched = (name) => async () => { calls.push(name); throw new Error("unexpected side effect"); };
        const res = response();
        await submitHandler(request({ ...variant, type, submissionId: "legacy-replay" }), res, {
          environment: () => environment,
          studentAuditStore: { environment, getRequest: touched("read"), getEvidenceMatch: touched("lookup"), createRequest: touched("write") },
          postScript: touched("Apps Script"),
        });
        assert.equal(res.statusCode, 410);
        assert.equal(res.body.code, "STUDENT_TB_REPLY_RETIRED");
        assert.equal(res.body.success, false);
        assert.deepEqual(calls, []);
        assert.equal(JSON.stringify(res.body).includes("synthetic"), false);
      }
    }
  }
  assert.deepEqual(logs, []);
});

test("Apps Script rejects retired student preflight before Drive, Sheets or guard writes", () => {
  const code = fs.readFileSync(new URL("../../apps-script/Code.gs", import.meta.url), "utf8");
  const calls = [];
  const context = vm.createContext({
    SpreadsheetApp: { openById: () => { calls.push("Sheet"); throw new Error("unexpected Sheet"); } },
    DriveApp: { getFolderById: () => { calls.push("Drive"); throw new Error("unexpected Drive"); } },
    PropertiesService: { getScriptProperties: () => { calls.push("properties"); throw new Error("unexpected properties"); } },
  });
  vm.runInContext(code + String.fromCharCode(10) + "this.preflight = preflightSubmission_;", context);
  for (const runtimeEnvironment of ["qa", "production"]) {
    assert.throws(() => context.preflight({ type: "student-file", recordMode: "firestore", runtimeEnvironment,
      fields: { studentName: "[QA] synthetic" }, fileBase64: "fixture", fileMimeType: "image/png" }), /STUDENT_TB_REPLY_RETIRED/);
  }
  assert.deepEqual(calls, []);
});

test("Apps Script rejects raw and signed retired aliases before locks, secrets and storage", () => {
  const code = fs.readFileSync(new URL("../../apps-script/Code.gs", import.meta.url), "utf8");
  const calls = [];
  const unexpected = (name) => () => { calls.push(name); throw new Error("unexpected " + name); };
  const context = vm.createContext({
    LockService: { getScriptLock: unexpected("lock") },
    PropertiesService: { getScriptProperties: unexpected("properties") },
    DriveApp: { getFolderById: unexpected("Drive") },
    SpreadsheetApp: { openById: unexpected("Sheet") },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (body) => ({
      getContent: () => body, setMimeType() { return this; },
    }) },
  });
  vm.runInContext(code + String.fromCharCode(10) + "this.submit = doPost;", context);
  for (const type of ["student-file", "student_tb_reply", "student_file"]) {
    const payload = { type, fields: { studentName: "[QA] synthetic" }, fileBase64: "fixture" };
    for (const body of [payload, buildSubmissionProxyEnvelope(payload, "fixture-only-signing-secret-32bytes")]) {
      const result = JSON.parse(context.submit({ postData: { contents: JSON.stringify(body) } }).getContent());
      assert.equal(result.status, "error");
      assert.equal(result.code, "STUDENT_TB_REPLY_RETIRED");
      assert.equal(JSON.stringify(result).includes("synthetic"), false);
      assert.deepEqual(calls, []);
    }
  }
});

test("Vercel QA student envelope verifies with QA key but not Production key", () => {
  const code = fs.readFileSync(new URL("../../apps-script/Code.gs", import.meta.url), "utf8");
  const selected = [];
  const qaSecret = "fixture-only-qa-signing-secret-32bytes";
  const productionSecret = "fixture-only-production-signing-secret-32bytes";
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty(key) {
      selected.push(key);
      return key === "QA_SUBMISSION_PROXY_SECRET" ? qaSecret : productionSecret;
    } }) },
    Utilities: { Charset: { UTF_8: "utf8" }, DigestAlgorithm: { SHA_256: "sha256" },
      newBlob: (value) => ({ getBytes: () => [...Buffer.from(value)] }),
      base64EncodeWebSafe: (value) => Buffer.from(value).toString("base64url"),
      computeDigest: (_algorithm, value) => [...createHash("sha256").update(value).digest()],
      computeHmacSha256Signature: (value, secret) => [...createHmac("sha256", secret).update(value).digest()] },
  });
  vm.runInContext(`${code}\nthis.verify = verifySubmissionProxy_;`, context);
  const payload = buildScriptSubmission(SUBMISSION_WORKFLOWS.student_tb_reply, { fields: { grade: "2",
    classNumber: "1", studentNumber: "99", studentName: "[QA] synthetic" }, fileName: "QA-test.pdf",
    fileMimeType: "application/pdf", fileBase64: "fixture" }, { firestoreAudit: true,
    runtimeEnvironment: "qa", qaEvidenceFolderId: "QA-PRIVATE-FOLDER-001" });
  const options = { requestId: "11111111-1111-4111-8111-111111111111", visitor: "A".repeat(43) };
  const valid = buildSubmissionProxyEnvelope(payload, qaSecret, options);
  assert.equal(context.verify(valid).type, "student-file");
  assert.throws(() => context.verify(buildSubmissionProxyEnvelope(payload, productionSecret, options)), /인증/);
  assert.deepEqual(selected, ["QA_SUBMISSION_PROXY_SECRET", "QA_SUBMISSION_PROXY_SECRET"]);
});

function submitHandler(req, res, options = {}) {
  const environment = options.environment ? options.environment() : (process.env.APP_ENV || "production");
  const context = options.context || submissionResourceContext(environment, options);
  return rawSubmitHandler(req, res, { ...options, context });
}
