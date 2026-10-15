import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createHash, createHmac } from "node:crypto";
import { buildSubmissionProxyEnvelope } from "./submissionProxyEnvelope.js";
const secret = "fixture-only-secret-with-at-least-32-bytes";
const folderId = "QA-PRIVATE-FOLDER-001";
const fingerprint = "a".repeat(64);
const payload = { type: "tb", runtimeEnvironment: "qa", recordMode: "firestore", qaEvidenceFolderId: folderId,
  qaUploadContract: "qa-tb-idempotency-v1", qaSubmissionId: `QA-STAFF-TB-${fingerprint.slice(0, 32)}`,
  qaRequestFingerprint: fingerprint, schoolYear: 2026, fields: { name: "QA fixture", checkupDate: "2026-10-14" },
  fileMimeType: "image/png", fileName: "generated.png", fileBase64: Buffer.from("89504e470d0a1a0a00000000", "hex").toString("base64") };
function fixture() {
  const files = new Map(); const properties = new Map([["QA_SUBMISSION_PROXY_SECRET", secret]]);
  let uploads = 0; let propertyWrites = 0;
  let privateFolder = true; let failAfterCreate = false;
  const folder = { getId: () => folderId, isTrashed: () => false, getSharingAccess: () => privateFolder ? "PRIVATE" : "PUBLIC",
    getFilesByName: (name) => { let read = false; return { hasNext: () => !read && files.has(name), next: () => { read = true; return files.get(name); } }; },
    createFile(blob) { uploads++; const file = { getId: () => "qa-file", getUrl: () => "private", isTrashed: () => false,
      getSharingAccess: () => "PRIVATE", getMimeType: () => blob.getContentType(), getBlob: () => blob };
      files.set(blob.name, file); if (failAfterCreate) { failAfterCreate = false; throw new Error("lost response"); } return file; } };
  const context = vm.createContext({
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties.get(key) ?? null,
      setProperty: (key, value) => { propertyWrites++; properties.set(key, value); }, getKeys: () => [...properties.keys()], deleteProperty: (key) => properties.delete(key) }) },
    SpreadsheetApp: { openById: () => { throw new Error("QA TB must never read a Sheet"); } },
    DriveApp: { Access: { PRIVATE: "PRIVATE" }, getFolderById: (id) => { assert.equal(id, folderId); return folder; },
      getFileById: (id) => { assert.equal(id, "qa-file"); const file = [...files.values()][0];
        if (!file) throw new Error("file missing");
        let read = false; return { ...file, getParents: () => ({ hasNext: () => !read,
          next: () => { read = true; return { getId: () => folderId }; } }) }; } },
    Utilities: { DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
      base64Decode: (value) => [...Buffer.from(value, "base64")], base64Encode: (value) => Buffer.from(value).toString("base64"),
      base64EncodeWebSafe: (value) => Buffer.from(value).toString("base64url"),
      computeDigest: (_algorithm, value) => [...createHash("sha256").update(value).digest()],
      computeHmacSha256Signature: (value, key) => [...createHmac("sha256", key).update(value).digest()],
      newBlob: (bytes, mimeType, name) => ({ name, getContentType: () => mimeType,
        getBytes: () => typeof bytes === "string" ? [...Buffer.from(bytes)] : bytes, setName(value) { this.name = value; } }), formatDate: () => "now" },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (body) => ({ getContent: () => body, setMimeType() { return this; } }) },
  });
  vm.runInContext(fs.readFileSync(new URL("../../apps-script/Code.gs", import.meta.url), "utf8"), context);
  const call = (value) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(buildSubmissionProxyEnvelope(value, secret)) } }).getContent());
  return { call, counts: () => ({ uploads, propertyWrites }), denyPrivacy: () => { privateFolder = false; }, loseResponse: () => { failAfterCreate = true; } };
}
test("signed QA TB capability handshake is read-only and touches no Sheet", () => {
  const f = fixture(); const result = f.call({ type: "qa-tb-upload-capability", runtimeEnvironment: "qa", recordMode: "firestore", qaEvidenceFolderId: folderId });
  assert.equal(result.contract, "qa-tb-idempotency-v1"); assert.equal(result.private, true);
  assert.deepEqual(f.counts(), { uploads: 0, propertyWrites: 0 });
});
test("Apps Script lost response retry uses stable private file and retains replay protection", () => {
  const f = fixture(); f.loseResponse(); assert.equal(f.call(payload).status, "error");
  const result = f.call({ ...payload, fileName: "tomorrow-generated.png" });
  assert.equal(result.status, "success"); assert.equal(result.fileId, "qa-file"); assert.equal(result.submissionId, payload.qaSubmissionId);
  assert.equal(f.call(payload).status, "success"); assert.equal(f.counts().uploads, 1);
  assert.equal(f.call({ ...payload, fileBase64: Buffer.from("changed").toString("base64") }).status, "error");
});
test("missing contract and public QA folder fail before upload", () => {
  const f = fixture(); assert.equal(f.call({ ...payload, qaUploadContract: undefined }).status, "error");
  f.denyPrivacy(); assert.equal(f.call(payload).status, "error"); assert.equal(f.counts().uploads, 0);
});
test("signed QA metadata checks existing private folder membership without mutations", () => {
  const f = fixture(); const metadata = { type: "qa-tb-evidence-metadata", runtimeEnvironment: "qa",
    recordMode: "firestore", qaEvidenceFolderId: folderId, fileId: "qa-file" };
  assert.equal(f.call(metadata).status, "error"); assert.equal(f.counts().uploads, 0);
  assert.equal(f.call(payload).status, "success"); const before = f.counts();
  const result = f.call(metadata); assert.equal(result.verified, true); assert.equal(result.folderId, folderId);
  assert.deepEqual(f.counts(), before);
  f.denyPrivacy(); assert.equal(f.call(metadata).status, "error"); assert.deepEqual(f.counts(), before);
});
