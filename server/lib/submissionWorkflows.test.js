import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createHash, createHmac } from "node:crypto";
import submitHandler from "../../api/submit.js";
import { buildSubmissionProxyEnvelope } from "./submissionProxyEnvelope.js";
import { buildScriptSubmission, publicSubmissionCard, resolveSubmissionWorkflow, SUBMISSION_WORKFLOWS, validateSubmissionPayload } from "./submissionWorkflows.js";

const png = Buffer.from("89504e470d0a1a0a00000000", "hex").toString("base64");
const file = { fields: { name: "QA", completionDate: "2026-10-09", checkupDate: "2026-10-09" }, fileBase64: png, fileMimeType: "image/png", fileName: "qa.png" };
const inbodyFields = { name: "QA", dept: "QA", preferredDate: "2026-10-09", preferredTime: "12:00" };
const destinationUrl = "https://script.google.com/macros/s/test/exec";
const proxySecret = "fixture-only-submission-secret-32bytes-minimum";

function response() {
  return { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
}

function request(payload) {
  return { method: "POST", headers: { "content-type": "application/json" }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(payload)); } };
}

test("canonical registry only enables current operating submit routes", () => {
  assert.deepEqual(Object.keys(SUBMISSION_WORKFLOWS), ["cpr", "tb", "tb_registration", "student_tb_reply", "inbody", "infection", "recruit", "other"]);
  assert.equal(resolveSubmissionWorkflow({ type: "student-file" }).id, "student_tb_reply");
  assert.equal(resolveSubmissionWorkflow({ type: "tb-registration" }).id, "tb_registration");
  assert.equal(resolveSubmissionWorkflow({ type: "unknown", sheetName: SUBMISSION_WORKFLOWS.cpr.auditSheet }), null);
  for (const id of ["infection", "recruit", "other"]) assert.equal(SUBMISSION_WORKFLOWS[id].enabled, false);
});

test("legacy TB registration modal sends an explicit canonical type", () => {
  const modal = fs.readFileSync(new URL("../../src/components/SubmitModal.jsx", import.meta.url), "utf8");
  assert.match(modal, /type: "tb_registration",\s*sheetName: "응답_교직원결핵검진유형선택"/);
});

test("server-owned payload strips destination and validates file contract", () => {
  for (const type of ["cpr", "tb"]) {
    const workflow = SUBMISSION_WORKFLOWS[type];
    const input = { ...file, type, sheetName: "Injected", folderId: "Injected" };
    assert.equal(validateSubmissionPayload(workflow, input).ok, true);
    const outbound = buildScriptSubmission(workflow, input);
    assert.equal(outbound.type, type);
    assert.equal("sheetName" in outbound, false);
    assert.equal("folderId" in outbound, false);
    assert.equal(JSON.stringify(outbound).includes("Injected"), false);
  }
  assert.equal(validateSubmissionPayload(SUBMISSION_WORKFLOWS.cpr, { ...file, fileMimeType: "text/html" }).ok, false);
  assert.equal(validateSubmissionPayload(SUBMISSION_WORKFLOWS.cpr, { ...file, fileBase64: "not-base64" }).ok, false);
  assert.equal(validateSubmissionPayload(SUBMISSION_WORKFLOWS.inbody, { ...file, type: "inbody" }).ok, false);
  assert.equal(validateSubmissionPayload(SUBMISSION_WORKFLOWS.cpr, { ...file, fields: { name: "QA" } }).ok, false);
  assert.equal(validateSubmissionPayload(SUBMISSION_WORKFLOWS.inbody, { type: "inbody", fields: { name: "QA", dept: "QA" } }).ok, false);
});

test("server accepts a 3MiB PDF and rejects one byte over before forwarding", async () => {
  const pdf = Buffer.alloc(3 * 1024 * 1024);
  pdf.write("%PDF-", 0, "ascii");
  const valid = { ...file, type: "cpr", fileName: "certificate.pdf", fileMimeType: "application/pdf", fileBase64: pdf.toString("base64") };
  assert.equal(validateSubmissionPayload(SUBMISSION_WORKFLOWS.cpr, valid).ok, true);
  const invalid = { ...valid, fileBase64: Buffer.concat([pdf, Buffer.from([0])]).toString("base64") };
  const check = validateSubmissionPayload(SUBMISSION_WORKFLOWS.cpr, invalid);
  assert.equal(check.status, 413);
  assert.match(check.message, /3MiB/);
  let calls = 0;
  const result = response();
  await submitHandler(request(invalid), result, { destinationUrl, proxySecret,
    verifyStaff: async () => ({ ok: true, staffId: "T022", roles: ["staff"] }),
    postScript: async () => { calls++; throw new Error("unexpected upload"); } });
  assert.equal(result.statusCode, 413);
  assert.equal(calls, 0);
});

test("public card projection never exposes server-only destination", () => {
  const card = publicSubmissionCard({ title: "CPR", url: "19foLN446v5ggGN6hxLBuH8tNAQuSXgtM", folderId: "private", sheetName: "private", auditSheet: "private" });
  assert.equal(card.title, "CPR");
  assert.equal(card.url, "");
  assert.equal(JSON.stringify(card).includes("private"), false);
  assert.equal(publicSubmissionCard({ url: "https://drive.google.com/drive/folders/private" }).url, "");
  assert.equal(publicSubmissionCard({ url: "/upload?mode=public" }).url, "/upload?mode=public");
  assert.equal(publicSubmissionCard({ url: "https://school.example/guide" }).url, "https://school.example/guide");
});

test("API rejects unknown and unauthenticated staff types before script call", async () => {
  let calls = 0;
  const options = { destinationUrl, postScript: async () => { calls++; throw new Error("unexpected network"); },
    verifyStaff: async () => ({ ok: false, status: 401, message: "로그인이 필요합니다." }) };
  const unknown = response();
  await submitHandler(request({ ...file, type: "unknown", sheetName: "응답_심폐소생술이수증" }), unknown, options);
  assert.equal(unknown.statusCode, 422);
  const cpr = response();
  await submitHandler(request({ ...file, type: "cpr" }), cpr, options);
  assert.equal(cpr.statusCode, 401);
  const inbody = response();
  await submitHandler(request({ type: "inbody", fields: inbodyFields }), inbody, options);
  assert.equal(inbody.statusCode, 401);
  assert.equal(calls, 0);
});

test("submission API refuses cross-site simple form content types", async () => {
  const req = request({ type: "student-file", fields: {} });
  req.headers["content-type"] = "text/plain";
  const result = response();
  await submitHandler(req, result);
  assert.equal(result.statusCode, 415);
  assert.equal(result.headers["Access-Control-Allow-Origin"], undefined);
});

test("authorized CPR and TB use the canonical server workflow", async () => {
  const forwarded = [];
  const options = { destinationUrl,
    proxySecret,
    verifyStaff: async () => ({ ok: true, staffId: "T022", roles: ["staff"] }),
    verifyTb: async () => ({ ok: true, staffId: "T022", roles: ["staff"] }),
    postScript: async (_url, init) => { forwarded.push(JSON.parse(JSON.parse(init.body).payloadJson));
      return { text: async () => JSON.stringify({ status: "error", message: "fixture only" }) }; },
  };
  for (const type of ["cpr", "tb"]) {
    const result = response();
    await submitHandler(request({ ...file, type, sheetName: "Injected", folderId: "Injected" }), result, options);
    assert.equal(result.statusCode, 200);
  }
  assert.deepEqual(forwarded.map((item) => item.type), ["cpr", "tb"]);
  for (const item of forwarded) {
    assert.equal(item.sheetName, undefined);
    assert.equal(item.folderId, undefined);
  }
});

test("role mismatch rejects and authorized staff cannot override destinations", async () => {
  let calls = 0;
  const postScript = async (_url, init) => { calls++; const body = JSON.parse(JSON.parse(init.body).payloadJson);
    assert.equal(body.type, "inbody"); assert.equal(body.folderId, undefined); assert.equal(body.sheetName, undefined);
    return { text: async () => JSON.stringify({ status: "error", message: "fixture only" }) }; };
  const payload = { type: "inbody", fields: inbodyFields, sheetName: "secret", folderId: "secret" };
  const denied = response();
  await submitHandler(request(payload), denied, { destinationUrl, proxySecret, postScript, verifyStaff: async () => ({ ok: true, staffId: "T022", roles: ["student"] }) });
  assert.equal(denied.statusCode, 403);
  assert.equal(calls, 0);
  const allowed = response();
  await submitHandler(request(payload), allowed, { destinationUrl, proxySecret, postScript, verifyStaff: async () => ({ ok: true, staffId: "T022", roles: ["staff"] }) });
  assert.equal(allowed.statusCode, 200);
  assert.equal(calls, 1);
});

test("missing or unexpected Apps Script endpoint fails closed", async () => {
  let calls = 0;
  for (const url of ["", "https://example.com/exec"]) {
    const result = response();
    await submitHandler(request({ type: "inbody", fields: inbodyFields }), result,
      { destinationUrl: url, postScript: async () => { calls++; }, verifyStaff: async () => ({ ok: true, staffId: "T022", roles: ["staff"] }) });
    assert.equal(result.statusCode, 503);
  }
  assert.equal(calls, 0);
});

test("missing dedicated proxy secret fails before Apps Script upload", async () => {
  let calls = 0;
  const result = response();
  await submitHandler(request({ ...file, type: "cpr" }), result, {
    destinationUrl, proxySecret: "", verifyStaff: async () => ({ ok: true, staffId: "T022", roles: ["staff"] }),
    postScript: async () => { calls++; throw new Error("unexpected upload"); },
  });
  assert.equal(result.statusCode, 503);
  assert.equal(calls, 0);
});

test("anonymous student reply uses only fixed workflow and returns no storage destination", async () => {
  const result = response();
  const req = request({ ...file, type: "student-file", fields: { grade: "1", classNumber: "1", studentNumber: "1", studentName: "QA" }, folderId: "injected" });
  req.headers["x-forwarded-for"] = "192.0.2.1";
  await submitHandler(req, result,
    { destinationUrl, proxySecret, postScript: async (_url, init) => { const outbound = JSON.parse(JSON.parse(init.body).payloadJson);
      assert.equal(outbound.type, "student-file"); assert.equal(outbound.folderId, undefined);
      return { text: async () => JSON.stringify({ status: "success", folderId: "private", fileUrl: "private", submittedAt: "now" }) }; } });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { status: "success", submittedAt: "now" });
});

test("Apps Script refuses missing sheets and management reader is not a destination source", () => {
  const code = fs.readFileSync(new URL("../../apps-script/Code.gs", import.meta.url), "utf8");
  let driveReads = 0;
  const context = vm.createContext({
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => null }) },
    DriveApp: { getFolderById: () => { driveReads++; throw new Error("Drive reached"); } },
  });
  vm.runInContext(`${code}\nthis.sheetLookup = getSubmitSheet_; this.managedFolder = getSubmissionManagedFolderId_; this.safeCardUrl = safeSubmissionCardUrl_; this.validateBlob = validateSubmissionBlob_; this.studentSubmit = appendStudentFileSubmission_;`, context);
  const sheet = { getSheetByName: () => null, insertSheet: () => { throw new Error("auto-create called"); } };
  assert.throws(() => context.sheetLookup(sheet, "missing"), /준비되지 않았습니다/);
  const management = { getDataRange: () => ({ getDisplayValues: () => [["제출명", "저장폴더ID"], ["결핵검진 진료회신 제출", "legacy-id"]] }) };
  assert.equal(context.managedFolder({ getSheetByName: () => management }, "결핵검진 진료회신 제출"), "");
  assert.equal(code.includes("managedFolderId || payload.folderId"), false);
  assert.equal(context.safeCardUrl("https://drive.google.com/drive/folders/private"), "");
  assert.equal(context.safeCardUrl("https://school.example/guide"), "https://school.example/guide");
  assert.throws(() => context.validateBlob({ getContentType: () => "text/html", getBytes: () => [1] }), /PDF, JPG, PNG/);
  assert.throws(() => context.studentSubmit({ fields: { grade: "1", classNumber: "1", studentNumber: "1", studentName: "QA" }, fileName: "qa.png", fileBase64: png, fileMimeType: "image/png" }), /제출 기록 시트가 준비되지 않았습니다/);
  assert.equal(driveReads, 0);
  context.SpreadsheetApp.openById = () => ({ getSheetByName: () => ({ getLastColumn: () => 1, getRange: () => ({ getDisplayValues: () => [["제출일시"]] }) }) });
  assert.throws(() => context.studentSubmit({ fields: { grade: "1", classNumber: "1", studentNumber: "1", studentName: "QA" }, fileName: "qa.png", fileBase64: png, fileMimeType: "image/png" }), /제출 기록 시트 헤더가 올바르지 않습니다/);
  assert.equal(driveReads, 0);
});

test("Apps Script dispatches valid types to fixed Sheets and folders in a VM", () => {
  const code = fs.readFileSync(new URL("../../apps-script/Code.gs", import.meta.url), "utf8");
  const sheets = [];
  const folders = [];
  const properties = new Map([["SUBMISSION_PROXY_SECRET", proxySecret]]);
  const recordHeaders = ["제출일시", "제출항목명", "제출유형", "학년", "반", "번호", "학생명", "진료일", "의료기관명", "비고", "파일명", "파일URL", "저장폴더ID"];
  let appended = 0;
  const sheet = { appendRow: (row) => { assert.ok(row.length > 0); appended++; },
    getLastColumn: () => recordHeaders.length, getRange: () => ({ getDisplayValues: () => [recordHeaders] }) };
  const context = vm.createContext({
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties.get(key) ?? null,
      setProperty: (key, value) => properties.set(key, value), deleteProperty: (key) => properties.delete(key), getKeys: () => [...properties.keys()] }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (name) => { sheets.push(name); return sheet; } }) },
    DriveApp: { getFolderById: (id) => { folders.push(id); return { createFile: () => ({ getUrl: () => "private", getId: () => "private" }) }; } },
    Utilities: { DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
      base64Decode: (value) => [...Buffer.from(value, "base64")],
      base64EncodeWebSafe: (value) => Buffer.from(value).toString("base64url"),
      computeDigest: (_algorithm, value) => [...createHash("sha256").update(value).digest()],
      computeHmacSha256Signature: (value, secret) => [...createHmac("sha256", secret).update(value).digest()],
      newBlob: (bytes, mimeType) => ({ getContentType: () => mimeType, getBytes: () => typeof bytes === "string" ? [...Buffer.from(bytes)] : bytes }),
      formatDate: () => "now" },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (body) => ({ getContent: () => body, setMimeType() { return this; } }) },
  });
  vm.runInContext(`${code}\nthis.submit = doPost;`, context);
  assert.throws(() => context.validateSubmissionBlob_({
    getContentType: () => "application/pdf",
    getBytes: () => new Uint8Array(3 * 1024 * 1024 + 1),
  }), /3MiB/);
  const callEnvelope = (envelope) => JSON.parse(context.submit({ postData: { contents: JSON.stringify(envelope) } }).getContent());
  const call = (payload) => callEnvelope(buildSubmissionProxyEnvelope(payload, proxySecret));
  assert.equal(callEnvelope({ type: "cpr", ...file }).status, "error");
  assert.equal(sheets.length, 0);
  const signed = buildSubmissionProxyEnvelope({ ...file, type: "cpr" }, proxySecret);
  assert.equal(callEnvelope({ ...signed, signature: "bad" }).status, "error");
  assert.equal(callEnvelope(buildSubmissionProxyEnvelope({ ...file, type: "cpr" }, proxySecret, { now: Date.now() - 180000 })).status, "error");
  assert.equal(callEnvelope({ ...signed, payloadJson: signed.payloadJson.replace("qa.png", "changed.png") }).status, "error");
  assert.equal(sheets.length, 0);
  for (const type of ["cpr", "tb"]) {
    const result = call({ ...file, type, sheetName: "Injected", folderId: "Injected" });
    assert.equal(result.status, "success");
    assert.equal(sheets.at(-1), SUBMISSION_WORKFLOWS[type].auditSheet);
    assert.notEqual(folders.at(-1), "Injected");
  }
  assert.equal(call({ type: "inbody", fields: inbodyFields, sheetName: "Injected", folderId: "Injected" }).status, "success");
  assert.equal(sheets.at(-1), SUBMISSION_WORKFLOWS.inbody.auditSheet);
  assert.equal(call({ type: "unknown", fields: {}, sheetName: "Injected" }).status, "error");
  assert.equal(sheets.includes("Injected"), false);
  const replay = buildSubmissionProxyEnvelope({ type: "inbody", fields: inbodyFields }, proxySecret);
  assert.equal(callEnvelope(replay).status, "success");
  assert.equal(callEnvelope(replay).status, "error");
  const visitor = createHmac("sha256", proxySecret).update("visitor").digest("base64url");
  const student = (studentName) => ({ ...file, type: "student-file", fields: { grade: "1", classNumber: "1", studentNumber: "1", studentName } });
  const studentCall = (studentName) => callEnvelope(buildSubmissionProxyEnvelope(student(studentName), proxySecret, { visitor }));
  const beforeStudent = appended;
  assert.equal(studentCall("QA1").status, "success");
  assert.equal(studentCall("QA1").status, "error");
  assert.equal(studentCall("QA2").status, "success");
  assert.equal(studentCall("QA3").status, "success");
  assert.equal(studentCall("QA4").status, "error");
  assert.equal(appended - beforeStudent, 3);
  assert.equal(callEnvelope({ ...buildSubmissionProxyEnvelope(student("QA5"), proxySecret, { visitor }), visitor: "altered" }).status, "error");
  assert.equal(appended - beforeStudent, 3);
  properties.set("SUBMISSION_PROXY_TRANSITION_UNTIL", String(Date.now() + 10 * 60 * 1000));
  const legacyCpr = { ...file, type: "cpr", sheetName: SUBMISSION_WORKFLOWS.cpr.auditSheet, folderId: "Injected" };
  assert.equal(callEnvelope(legacyCpr).status, "success");
  assert.equal(sheets.at(-1), SUBMISSION_WORKFLOWS.cpr.auditSheet);
  assert.notEqual(folders.at(-1), "Injected");
  context.getTbRegistrationConfig_ = () => ({ enabled: "TRUE", startDate: "2020-01-01", endDate: "2030-01-01" });
  assert.equal(callEnvelope({ fields: inbodyFields, sheetName: SUBMISSION_WORKFLOWS.tb_registration.auditSheet }).status, "success");
  assert.equal(sheets.at(-1), SUBMISSION_WORKFLOWS.tb_registration.auditSheet);
  assert.equal(callEnvelope({ ...legacyCpr, sheetName: "Injected" }).status, "error");
  assert.equal(callEnvelope({ ...legacyCpr, signature: "bad" }).status, "error");
  properties.set("SUBMISSION_PROXY_TRANSITION_UNTIL", String(Date.now() - 1));
  assert.equal(callEnvelope(legacyCpr).status, "error");
  properties.set("SUBMISSION_PROXY_TRANSITION_UNTIL", String(Date.now() + 20 * 60 * 1000));
  assert.equal(callEnvelope(legacyCpr).status, "error");
});
