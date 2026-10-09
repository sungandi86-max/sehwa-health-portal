import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import submitHandler from "../../api/submit.js";
import { buildScriptSubmission, publicSubmissionCard, resolveSubmissionWorkflow, SUBMISSION_WORKFLOWS, validateSubmissionPayload } from "./submissionWorkflows.js";

const png = Buffer.from("89504e470d0a1a0a00000000", "hex").toString("base64");
const file = { fields: { name: "QA", completionDate: "2026-10-09", checkupDate: "2026-10-09" }, fileBase64: png, fileMimeType: "image/png", fileName: "qa.png" };
const inbodyFields = { name: "QA", dept: "QA", preferredDate: "2026-10-09", preferredTime: "12:00" };
const destinationUrl = "https://script.google.com/macros/s/test/exec";

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
    verifyStaff: async () => ({ ok: true, staffId: "T022", roles: ["staff"] }),
    verifyTb: async () => ({ ok: true, staffId: "T022", roles: ["staff"] }),
    postScript: async (_url, init) => { forwarded.push(JSON.parse(init.body));
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
  const postScript = async (_url, init) => { calls++; const body = JSON.parse(init.body);
    assert.equal(body.type, "inbody"); assert.equal(body.folderId, undefined); assert.equal(body.sheetName, undefined);
    return { text: async () => JSON.stringify({ status: "error", message: "fixture only" }) }; };
  const payload = { type: "inbody", fields: inbodyFields, sheetName: "secret", folderId: "secret" };
  const denied = response();
  await submitHandler(request(payload), denied, { destinationUrl, postScript, verifyStaff: async () => ({ ok: true, staffId: "T022", roles: ["student"] }) });
  assert.equal(denied.statusCode, 403);
  assert.equal(calls, 0);
  const allowed = response();
  await submitHandler(request(payload), allowed, { destinationUrl, postScript, verifyStaff: async () => ({ ok: true, staffId: "T022", roles: ["staff"] }) });
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

test("anonymous student reply uses only fixed workflow and returns no storage destination", async () => {
  const result = response();
  await submitHandler(request({ ...file, type: "student-file", fields: { grade: "1", classNumber: "1", studentNumber: "1", studentName: "QA" }, folderId: "injected" }), result,
    { destinationUrl, postScript: async (_url, init) => { const outbound = JSON.parse(init.body);
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
  const sheet = { appendRow: (row) => { assert.ok(row.length > 0); } };
  const context = vm.createContext({
    LockService: { getScriptLock: () => ({ tryLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (name) => { sheets.push(name); return sheet; } }) },
    DriveApp: { getFolderById: (id) => { folders.push(id); return { createFile: () => ({ getUrl: () => "private", getId: () => "private" }) }; } },
    Utilities: { base64Decode: (value) => [...Buffer.from(value, "base64")], newBlob: (bytes, mimeType) => ({ getContentType: () => mimeType, getBytes: () => bytes }), formatDate: () => "now" },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (body) => ({ getContent: () => body, setMimeType() { return this; } }) },
  });
  vm.runInContext(`${code}\nthis.submit = doPost;`, context);
  const call = (payload) => JSON.parse(context.submit({ postData: { contents: JSON.stringify(payload) } }).getContent());
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
});
