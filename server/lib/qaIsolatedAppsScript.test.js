import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createHash, createHmac } from "node:crypto";
import { buildSubmissionProxyEnvelope } from "./submissionProxyEnvelope.js";

const secret = "fixture-only-qa-secret-at-least-32-bytes";
const folderId = "QA-PRIVATE-FOLDER-001";
const hash = "a".repeat(64);
const png = Buffer.from("89504e470d0a1a0a00000000", "hex").toString("base64");
const base = { runtimeEnvironment: "qa", recordMode: "firestore", qaEvidenceFolderId: folderId,
  fileMimeType: "image/png", fileName: "generated.png", fileBase64: png };
const tb = { ...base, type: "tb", qaUploadContract: "qa-tb-idempotency-v1", schoolYear: 2026,
  qaSubmissionId: `QA-STAFF-TB-${hash.slice(0, 32)}`, qaRequestFingerprint: hash,
  fields: { name: "QA fixture", checkupDate: "2026-10-14" } };
const student = { ...base, type: "student-file", qaSubmissionId: `QA-STUDENT-TB-${hash.slice(0, 32)}`,
  qaRequestFingerprint: hash, fields: { grade: "QA", classNumber: "QA", studentNumber: "QA", studentName: "[QA] synthetic" } };
const capability = { type: "qa-tb-upload-capability", runtimeEnvironment: "qa", recordMode: "firestore", qaEvidenceFolderId: folderId };
function fixture(config = {}) {
  const files = new Map(); const properties = new Map([["QA_SUBMISSION_PROXY_SECRET", config.secret ?? secret]]);
  const counters = { uploads: 0, driveReads: 0, propertyWrites: 0, sheetCalls: 0, networkCalls: 0, productionReads: 0 };
  let privateFolder = true; let trashedFolder = false; let lostResponse = false;
  const iterator = (items) => { let index = 0; return { hasNext: () => index < items.length, next: () => items[index++] }; };
  const folder = { getId: () => folderId, getSharingAccess: () => privateFolder ? "PRIVATE" : "PUBLIC", isTrashed: () => trashedFolder,
    getFiles: () => iterator([...files.values()]),
    getFilesByName: (name) => iterator([...files.values()].filter((file) => file.name === name)),
    createFile(blob) { counters.uploads++; const id = `qa-file-${counters.uploads}`;
      const file = { name: blob.name, private: true, trashed: false, parent: folderId, mimeType: blob.getContentType(), bytes: [...blob.getBytes()],
        getId: () => id, getSharingAccess() { return this.private ? "PRIVATE" : "PUBLIC"; }, isTrashed() { return this.trashed; },
        getMimeType() { return this.mimeType; }, getSize() { return this.bytes.length; },
        getBlob() { return { getBytes: () => this.bytes }; }, getParents() { return iterator([{ getId: () => this.parent }]); } };
      files.set(id, file); if (lostResponse) { lostResponse = false; throw new Error("response lost after create"); } return file;
    } };
  const context = vm.createContext({
    LockService: { getScriptLock: () => ({ tryLock: () => true, hasLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty(key) {
      if (key !== "QA_SUBMISSION_PROXY_SECRET" && !key.startsWith("SUBMISSION_GUARD_")) { counters.productionReads++; throw new Error("forbidden property"); }
      return properties.get(key) ?? null;
    }, getKeys: () => [...properties.keys()], setProperty: (key, value) => { counters.propertyWrites++; properties.set(key, value); },
    deleteProperty: (key) => { counters.propertyWrites++; properties.delete(key); } }) },
    DriveApp: { Access: { PRIVATE: "PRIVATE" }, getFolderById(id) { counters.driveReads++; assert.equal(id, folderId); return folder; },
      getFileById(id) { counters.driveReads++; if (!files.has(id)) throw new Error("missing file"); return files.get(id); } },
    SpreadsheetApp: new Proxy({}, { get() { counters.sheetCalls++; throw new Error("forbidden Sheets"); } }),
    UrlFetchApp: new Proxy({}, { get() { counters.networkCalls++; throw new Error("forbidden network"); } }),
    Utilities: { DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
      base64Decode: (value) => [...Buffer.from(value, "base64")], base64Encode: (value) => Buffer.from(value).toString("base64"),
      base64EncodeWebSafe: (value) => Buffer.from(value).toString("base64url"),
      computeDigest: (_algorithm, value) => [...createHash("sha256").update(value).digest()],
      computeHmacSha256Signature: (value, key) => [...createHmac("sha256", key).update(value).digest()],
      newBlob: (bytes, mimeType, name) => ({ name, getContentType: () => mimeType,
        getBytes: () => typeof bytes === "string" ? [...Buffer.from(bytes)] : bytes, setName(value) { this.name = value; return this; } }),
      formatDate: () => "2026-10-15 09:00:00" },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (body) => ({ getContent: () => body, setMimeType() { return this; } }) },
  });
  vm.runInContext(fs.readFileSync(new URL("../../apps-script-qa/Code.gs", import.meta.url), "utf8"), context);
  const envelope = (payload, options = {}) => buildSubmissionProxyEnvelope(payload, config.secret ?? secret,
    { ...(payload.type === "student-file" ? { visitor: "v".repeat(43) } : {}), ...options });
  const send = (value) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(value) } }).getContent());
  return { files, counters, envelope, send, call: (payload) => send(envelope(payload)),
    get: (parameter = {}) => JSON.parse(context.doGet({ parameter }).getContent()),
    denyPrivacy: () => { privateFolder = false; }, trashFolder: () => { trashedFolder = true; }, loseResponse: () => { lostResponse = true; } };
}
test("isolated QA manifest and source expose only submission scope", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../../apps-script-qa/appsscript.json", import.meta.url), "utf8"));
  assert.equal(manifest.timeZone, "Asia/Seoul"); assert.equal(manifest.runtimeVersion, "V8");
  assert.deepEqual(manifest.oauthScopes, ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/script.storage"]);
  assert.deepEqual(manifest.webapp, { access: "ANYONE_ANONYMOUS", executeAs: "USER_DEPLOYING" });
  const source = fs.readFileSync(new URL("../../apps-script-qa/Code.gs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /SpreadsheetApp|UrlFetchApp|ScriptApp|ANYONE_ANONYMOUS|["']SUBMISSION_PROXY_SECRET["']|getProperty\(["']QA_.*FOLDER/);
});
test("QA health GET is non-sensitive and portal/healthroom requests fail closed", () => {
  const f = fixture(); assert.equal(f.get().environment, "qa");
  for (const mode of ["portal", "healthroom", "backup"]) assert.equal(f.get({ mode }).status, "error");
  assert.deepEqual(f.counters, { uploads: 0, driveReads: 0, propertyWrites: 0, sheetCalls: 0, networkCalls: 0, productionReads: 0 });
});
test("Production unknown legacy and action payloads reject before Drive or property writes", () => {
  const f = fixture();
  for (const value of [{ ...tb, runtimeEnvironment: "production" }, { ...tb, runtimeEnvironment: "preview" },
    { ...tb, type: "portal" }, { ...tb, recordMode: "sheet" }, { ...tb, action: "admin" }]) assert.equal(f.call(value).status, "error");
  for (const value of [{ type: "tb", ...base }, { action: "getAdminReceiptSummary" }, { ...f.envelope(tb), action: "admin" }]) assert.equal(f.send(value).status, "error");
  assert.equal(f.counters.driveReads, 0); assert.equal(f.counters.propertyWrites, 0); assert.equal(f.counters.productionReads, 0);
});
test("HMAC tampering freshness nonce and short-secret failures precede Drive", () => {
  const f = fixture(); const signed = f.envelope(tb);
  for (const value of [{ ...signed, signature: "invalid" }, { ...signed, payloadJson: signed.payloadJson.replace("2026", "2027") },
    f.envelope(tb, { now: Date.now() - 120001 }), { ...signed, requestId: "invalid" }]) assert.equal(f.send(value).status, "error");
  assert.equal(f.counters.driveReads, 0); assert.equal(f.counters.propertyWrites, 0);
  const short = fixture({ secret: "short" }); assert.equal(short.send(signed).status, "error"); assert.equal(short.counters.driveReads, 0);
});
test("signed capability and evidence metadata are readonly and verify private exact parent", () => {
  const f = fixture(); assert.equal(f.call(capability).contract, "qa-tb-idempotency-v1");
  assert.equal(f.counters.propertyWrites, 0); assert.equal(f.counters.uploads, 0);
  const uploaded = f.call(tb); assert.equal(uploaded.status, "success"); const writes = f.counters.propertyWrites;
  const metadata = { ...capability, type: "qa-tb-evidence-metadata", fileId: uploaded.fileId };
  assert.equal(f.call(metadata).verified, true); assert.equal(f.counters.propertyWrites, writes);
  const file = f.files.get(uploaded.fileId);
  for (const change of [{ parent: "wrong-folder" }, { private: false }, { trashed: true }]) {
    const before = { parent: file.parent, private: file.private, trashed: file.trashed };
    Object.assign(file, change); assert.equal(f.call(metadata).status, "error"); Object.assign(file, before);
  }
  assert.equal(f.counters.propertyWrites, writes); assert.equal(f.counters.uploads, 1);
});
test("same envelope replay is blocked while fresh-nonce TB retry recovers after lost response", () => {
  const f = fixture(); const signed = f.envelope(tb); f.loseResponse(); assert.equal(f.send(signed).status, "error");
  assert.equal(f.send(signed).status, "error");
  const result = f.call({ ...tb, fileName: "new-generated-date.png" });
  assert.equal(result.status, "success"); assert.equal(result.submissionId, tb.qaSubmissionId); assert.equal(result.private, true);
  assert.equal(f.counters.uploads, 1); assert.equal(result.fileUrl, undefined);
});
test("student retry reuses stable evidence and rejects MIME size or content conflicts", () => {
  for (const change of [{ mimeType: "image/jpeg" }, { bytes: [1, 2] }, { bytes: [...Buffer.from("89504e470d0a1a0a00000001", "hex")] }]) {
    const f = fixture(); const first = f.call(student); assert.equal(first.status, "success");
    assert.equal(f.call({ ...student, fileName: "new-name.png" }).fileId, first.fileId);
    Object.assign(f.files.get(first.fileId), change); assert.equal(f.call(student).status, "error"); assert.equal(f.counters.uploads, 1);
  }
});
test("CPR retains QA Drive-only upload contract without an invented stable identity", () => {
  const f = fixture(); const payload = { ...base, type: "cpr", fields: { name: "QA fixture", completionDate: "2026-10-14" } };
  const result = f.call(payload); assert.equal(result.status, "success"); assert.equal(result.fileId, "qa-file-1");
  assert.equal(result.submissionId, undefined); assert.equal(f.counters.uploads, 1);
});
test("known Production folders malformed/public/trashed folders and invalid file signatures deny safely", () => {
  const f = fixture();
  for (const id of ["1MfxNVL1muROzpi1ZbV7WDWr4SKMU7ghm", "19foLN446v5ggGN6hxLBuH8tNAQuSXgtM", "1hUmRQ8kK0OYx_h4IxzFy8GXv9Ilm1w63", "bad/path"]) {
    assert.equal(f.call({ ...tb, qaEvidenceFolderId: id }).status, "error");
  }
  assert.equal(f.counters.driveReads, 0); assert.equal(f.counters.propertyWrites, 0);
  assert.equal(f.call({ ...tb, fileBase64: Buffer.from("wrong file bytes").toString("base64") }).status, "error");
  assert.equal(f.counters.driveReads, 0);
  f.denyPrivacy(); assert.equal(f.call(tb).status, "error");
  const trashed = fixture(); trashed.trashFolder(); assert.equal(trashed.call(tb).status, "error");
  assert.equal(f.counters.uploads, 0); assert.equal(trashed.counters.uploads, 0);
  assert.equal(f.counters.sheetCalls + f.counters.networkCalls + f.counters.productionReads, 0);
});
test("oversized malformed encoding missing TB contract/year and student visitor fail before Drive or writes", () => {
  const f = fixture(); const oversized = Buffer.alloc(3 * 1024 * 1024 + 1); oversized.write("%PDF-");
  for (const payload of [{ ...tb, fileBase64: "%%%invalid%%%" }, { ...tb, fileMimeType: "application/pdf", fileBase64: oversized.toString("base64") },
    { ...tb, qaUploadContract: undefined }, { ...tb, schoolYear: undefined }, { ...tb, schoolYear: "2026" },
    { ...tb, qaRequestFingerprint: "bad" }, { ...student, qaSubmissionId: "bad" }]) assert.equal(f.call(payload).status, "error");
  assert.equal(f.send(f.envelope(student, { visitor: "" })).status, "error");
  assert.equal(f.counters.propertyWrites, 0); assert.equal(f.counters.uploads, 0);
  assert.equal(f.counters.sheetCalls + f.counters.networkCalls + f.counters.productionReads, 0);
});
test("actual 3MiB PDF succeeds and one byte over is denied before Drive", () => {
  const f = fixture(); const bytes = Buffer.alloc(3 * 1024 * 1024); bytes.write("%PDF-");
  const result = f.call({ ...tb, fileName: "max.pdf", fileMimeType: "application/pdf", fileBase64: bytes.toString("base64") });
  assert.equal(result.status, "success"); assert.equal(f.counters.uploads, 1);
  const over = fixture(); const tooLarge = Buffer.concat([bytes, Buffer.from([0])]);
  assert.equal(over.call({ ...tb, fileName: "over.pdf", fileMimeType: "application/pdf", fileBase64: tooLarge.toString("base64") }).status, "error");
  assert.equal(over.counters.driveReads, 0); assert.equal(over.counters.propertyWrites, 0);
});
