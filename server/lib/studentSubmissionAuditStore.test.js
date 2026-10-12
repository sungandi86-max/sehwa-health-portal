import assert from "node:assert/strict";
import test from "node:test";
import { buildLegacyStudentSubmissionRecord, planLegacyStudentSubmissionMigration,
  StudentSubmissionAuditStore, studentEvidenceIdFromUrl } from "./studentSubmissionAuditStore.js";
import submitHandler from "../../api/submit.js";
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
    context: () => ({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }),
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
    context: () => ({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }) });
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
    context: () => ({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }) });
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

test("QA anonymous submit signs a QA-only Drive payload, writes ledger, and never requests Sheet append", async () => {
  const payload = { type: "student_tb_reply", fields: { grade: "QA", classNumber: "QA", studentNumber: "QA",
    studentName: "[QA] synthetic" }, fileName: "QA-reply.png", fileMimeType: "image/png",
    fileBase64: Buffer.from("89504e470d0a1a0a00000000", "hex").toString("base64"),
    sheetName: "Injected", folderId: "Injected" };
  const writes = [];
  const res = response();
  await submitHandler(request(payload), res, { destinationUrl: "https://script.google.com/macros/s/test/exec",
    proxySecret: "fixture-only-submission-secret-32bytes-minimum", environment: () => "qa",
    qaStudentReplyFolderId: "QA-PRIVATE-FOLDER-001", now: new Date("2026-10-12T00:00:00Z"),
    studentAuditStore: { getQaRequest: async () => null, getQaEvidenceMatch: async () => null,
      createQaRequest: async (record) => writes.push(record) },
    postScript: async (_url, init) => {
      const envelope = JSON.parse(init.body);
      const forwarded = JSON.parse(envelope.payloadJson);
      assert.equal(forwarded.type, "student-file");
      assert.equal(forwarded.recordMode, "firestore");
      assert.equal(forwarded.runtimeEnvironment, "qa");
      assert.equal(forwarded.qaEvidenceFolderId, "QA-PRIVATE-FOLDER-001");
      assert.match(forwarded.qaSubmissionId, /^QA-STUDENT-TB-[a-f0-9]{32}$/);
      assert.match(forwarded.qaRequestFingerprint, /^[a-f0-9]{64}$/);
      assert.equal(JSON.stringify(forwarded).includes("Injected"), false);
      return { text: async () => JSON.stringify({ status: "success", fileId: "QA-DRIVE-FILE-001", submittedAt: "now" }) };
    } });
  assert.equal(res.statusCode, 200);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].evidenceFile.fileId, "QA-DRIVE-FILE-001");
  assert.match(writes[0].evidenceSha256, /^[a-f0-9]{64}$/);
  assert.equal(writes[0].idempotencyVersion, 2);
  assert.equal(res.body.fileId, undefined);
  assert.equal(res.body.submissionId, writes[0].requestId);
  const prodPayload = buildScriptSubmission(SUBMISSION_WORKFLOWS.student_tb_reply, payload);
  assert.equal(prodPayload.recordMode, undefined);
});

test("same QA evidence across midnight rejects before a second Drive upload", async () => {
  const payload = { type: "student_tb_reply", fields: { grade: "1", classNumber: "1", studentNumber: "99",
    studentName: "[QA] synthetic" }, fileName: "QA-20261012.png", fileMimeType: "image/png",
    fileBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl9mN8AAAAASUVORK5CYII=" };
  const existing = { submissionId: "QA-STUDENT-TB-v1", evidenceFiles: [{ fileId: "QA-DRIVE-V1", exists: true }] };
  let uploads = 0;
  const res = response();
  await submitHandler(request({ ...payload, fileName: "QA-20261013.png" }), res, {
    destinationUrl: "https://script.google.com/macros/s/test/exec",
    proxySecret: "fixture-only-submission-secret-32bytes-minimum", environment: () => "qa",
    qaStudentReplyFolderId: "QA-PRIVATE-FOLDER-001",
    studentAuditStore: { getQaRequest: async () => null, getQaEvidenceMatch: async () => existing },
    postScript: async () => { uploads++; throw new Error("duplicate must not upload"); },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.submissionId, existing.submissionId);
  assert.equal(uploads, 0);
});

test("QA missing evidence destination and arbitrary Preview fail before Apps Script", async () => {
  const payload = { type: "student_tb_reply", fields: { grade: "QA", classNumber: "QA", studentNumber: "QA",
    studentName: "[QA] synthetic" }, fileName: "QA-reply.png", fileMimeType: "image/png",
    fileBase64: Buffer.from("89504e470d0a1a0a00000000", "hex").toString("base64") };
  let calls = 0;
  const options = { destinationUrl: "https://script.google.com/macros/s/test/exec",
    proxySecret: "fixture-only-submission-secret-32bytes-minimum", environment: () => "qa",
    postScript: async () => { calls++; throw new Error("Apps Script must not be called"); } };
  const missing = response();
  await submitHandler(request(payload), missing, options);
  assert.equal(missing.statusCode, 503);
  const arbitrary = response();
  await submitHandler(request(payload), arbitrary, { ...options, environment: () => null });
  assert.equal(arbitrary.statusCode, 403);
  assert.equal(calls, 0);
});

test("QA Drive failure does not write audit; Firestore failure reports recoverable submission ID", async () => {
  const payload = { type: "student_tb_reply", fields: { grade: "QA", classNumber: "QA", studentNumber: "001",
    studentName: "[QA] synthetic" }, fileName: "QA-reply.png", fileMimeType: "image/png",
    fileBase64: Buffer.from("89504e470d0a1a0a00000000", "hex").toString("base64") };
  const options = { destinationUrl: "https://script.google.com/macros/s/test/exec",
    proxySecret: "fixture-only-submission-secret-32bytes-minimum", environment: () => "qa",
    qaStudentReplyFolderId: "QA-PRIVATE-FOLDER-001", now: new Date("2026-10-12T00:00:00Z") };
  let auditWrites = 0;
  const driveFailed = response();
  await submitHandler(request(payload), driveFailed, { ...options,
    studentAuditStore: { getQaRequest: async () => null, getQaEvidenceMatch: async () => null,
      createQaRequest: async () => { auditWrites++; } },
    postScript: async () => ({ text: async () => JSON.stringify({ status: "error" }) }) });
  assert.equal(driveFailed.body.success, false);
  assert.equal(auditWrites, 0);
  const auditFailed = response();
  const originalError = console.error;
  console.error = () => {};
  try {
    await submitHandler(request(payload), auditFailed, { ...options,
      studentAuditStore: { getQaRequest: async () => null, getQaEvidenceMatch: async () => null,
        createQaRequest: async () => { throw new Error("QA Firestore unavailable"); } },
      postScript: async () => ({ text: async () => JSON.stringify({ status: "success", fileId: "QA-DRIVE-FILE-001" }) }) });
  } finally { console.error = originalError; }
  assert.equal(auditFailed.statusCode, 503);
  assert.match(auditFailed.body.submissionId, /^QA-STUDENT-TB-[a-f0-9]{32}$/);
  assert.equal(auditFailed.body.fileId, undefined);
});

test("Apps Script QA student preflight uses only QA folder, skips Sheet, and returns fileId", () => {
  const code = fs.readFileSync(new URL("../../apps-script/Code.gs", import.meta.url), "utf8");
  let sheetReads = 0;
  let folderId = "";
  let appends = 0;
  const file = { getUrl: () => "https://drive.google.com/file/d/QA-DRIVE-FILE-001/view",
    getId: () => "QA-DRIVE-FILE-001" };
  const context = vm.createContext({
    SpreadsheetApp: { openById: () => { sheetReads++; throw new Error("Workbook access"); } },
    DriveApp: { getFolderById(id) { folderId = id; return { getId: () => id,
      getFilesByName: () => ({ hasNext: () => false }), createFile: () => file }; } },
    Utilities: { base64Decode: () => [137, 80, 78, 71, 13, 10, 26, 10],
      newBlob: () => ({ getContentType: () => "image/png", getBytes: () => [137, 80, 78, 71, 13, 10, 26, 10],
        setName() {} }),
      formatDate: () => "2026-10-12 10:00:00" },
  });
  vm.runInContext(`${code}\nthis.preflight = preflightSubmission_; this.append = appendStudentFileSubmission_;`, context);
  const prepared = context.preflight({ type: "student-file", recordMode: "firestore", runtimeEnvironment: "qa",
    qaEvidenceFolderId: "QA-PRIVATE-FOLDER-001", qaSubmissionId: `QA-STUDENT-TB-${"a".repeat(32)}`,
    qaRequestFingerprint: "a".repeat(64), fields: { grade: "QA", classNumber: "QA", studentNumber: "QA",
      studentName: "[QA] synthetic" }, fileName: "QA-reply.png", fileBase64: "fixture", fileMimeType: "image/png" });
  context.appendSubmissionRecord_ = () => { appends++; };
  const result = context.append({ fields: { studentName: "[QA] synthetic" }, fileName: "QA-reply.png",
    fileMimeType: "image/png" }, prepared, "QA-REQUEST-001");
  assert.equal(sheetReads, 0);
  assert.equal(appends, 0);
  assert.equal(folderId, "QA-PRIVATE-FOLDER-001");
  assert.equal(result.fileId, "QA-DRIVE-FILE-001");
});

test("QA evidence reuse survives audit failure without duplicate Drive upload or ledger record", async () => {
  const code = fs.readFileSync(new URL("../../apps-script/Code.gs", import.meta.url), "utf8");
  const secret = "fixture-only-submission-secret-32bytes-minimum";
  const payload = { type: "student_tb_reply", fields: { grade: "QA", classNumber: "QA", studentNumber: "001",
    studentName: "[QA] synthetic" }, fileName: "QA-reply.png", fileMimeType: "image/png",
    fileBase64: Buffer.from("89504e470d0a1a0a00000000", "hex").toString("base64") };
  const id = qaStudentSubmissionIdentity(payload, secret);
  const properties = new Map();
  let file = null;
  let uploads = 0;
  let ledgerWrites = 0;
  const context = vm.createContext({
    STUDENT_FILE_DEFAULT_FOLDER_ID: "PRODUCTION-FOLDER",
    PropertiesService: { getScriptProperties: () => ({ getKeys: () => [...properties.keys()],
      getProperty: (key) => properties.get(key) ?? null, setProperty: (key, value) => properties.set(key, value),
      deleteProperty: (key) => properties.delete(key) }) },
    DriveApp: { getFolderById(folderId) { assert.equal(folderId, "QA-PRIVATE-FOLDER-001"); return {
      getId: () => folderId, getFilesByName: () => { let consumed = false; return {
        hasNext: () => Boolean(file) && !consumed, next: () => { consumed = true; return file; } }; },
      createFile(blob) { uploads++; file = { getId: () => "QA-DRIVE-FILE-001", getUrl: () => "private-url",
        getMimeType: () => "image/png", getSize: () => 12 }; return file; } }; } },
    Utilities: { base64Decode: (value) => [...Buffer.from(value, "base64")],
      newBlob: (bytes) => ({ getContentType: () => "image/png", getBytes: () => bytes,
        setName() {} }), formatDate: () => "2026-10-12 10:00:00" },
  });
  vm.runInContext(`${code}\nthis.preflight = preflightSubmission_; this.reserve = reserveSubmissionProxy_;
    this.append = appendStudentFileSubmission_;`, context);
  const scriptPayload = { type: "student-file", recordMode: "firestore", runtimeEnvironment: "qa",
    qaEvidenceFolderId: "QA-PRIVATE-FOLDER-001", qaSubmissionId: id.submissionId,
    qaRequestFingerprint: id.requestFingerprint, fields: payload.fields, fileName: payload.fileName,
    fileMimeType: payload.fileMimeType, fileBase64: payload.fileBase64 };
  const first = context.preflight(scriptPayload);
  const signed1 = buildSubmissionProxyEnvelope(scriptPayload, secret, { requestId: "QA-REQUEST-ONE", visitor: "visitor" });
  context.reserve(signed1, scriptPayload, first);
  const uploaded = context.append(scriptPayload, first, signed1.requestId);
  assert.equal(uploaded.fileId, "QA-DRIVE-FILE-001");
  assert.equal(uploads, 1);
  const nextDayPayload = { ...payload, fileName: "QA-reply-20261013.png" };
  assert.equal(qaStudentSubmissionIdentity(nextDayPayload, secret).submissionId, id.submissionId);
  const nextDayScriptPayload = { ...scriptPayload, fileName: nextDayPayload.fileName };
  const second = context.preflight(nextDayScriptPayload);
  assert.equal(second.existingEvidence.getId(), uploaded.fileId);
  const signed2 = buildSubmissionProxyEnvelope(nextDayScriptPayload, secret, { requestId: "QA-REQUEST-TWO", visitor: "visitor" });
  context.reserve(signed2, nextDayScriptPayload, second);
  context.append(nextDayScriptPayload, second, signed2.requestId);
  assert.equal(uploads, 1);
  const db = database();
  const store = new StudentSubmissionAuditStore({ database: () => db,
    context: () => ({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }) });
  await store.createQaRequest({ requestId: id.submissionId, requestFingerprint: id.requestFingerprint,
    evidenceSha256: id.evidenceSha256,
    fields: payload.fields, evidenceFile: { fileId: uploaded.fileId, fileName: payload.fileName,
      mimeType: payload.fileMimeType } });
  ledgerWrites++;
  await assert.rejects(store.createQaRequest({ requestId: id.submissionId, evidenceSha256: id.evidenceSha256,
    fields: payload.fields,
    evidenceFile: { fileId: uploaded.fileId, fileName: payload.fileName } }), /duplicate/);
  assert.equal(ledgerWrites, 1);
  assert.throws(() => context.reserve(signed1, scriptPayload, second), /중복 제출/);
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
