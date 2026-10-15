import assert from "node:assert/strict";
import test from "node:test";
import { qaTbSubmissionIdentity, receiveQaTbSubmission } from "./qaTbSubmission.js";

const input = { staffId: "QA-TB-001", actorStaffId: "QA-TB-001", schoolYear: 2026,
  submissionMode: "self", fields: { checkupDate: "2026-10-14", docType: "결핵검진 확인증", staffType: "교사" },
  fileBase64: Buffer.from("fixture evidence").toString("base64"), fileMimeType: "application/pdf", fileName: "generated-20261014.pdf" };
const secret = "fixture-only-secret-with-at-least-32-bytes";
function fixture() {
  const documents = new Map();
  const db = { collection(name) { assert.equal(name, "tb_upload_requests_qa"); return { doc(id) { return { id }; } }; },
    async runTransaction(fn) { return fn({ get: async (ref) => ({ exists: documents.has(ref.id), data: () => documents.get(ref.id) }),
      create: (ref, value) => documents.set(ref.id, value), set: (ref, value) => documents.set(ref.id, value) }); } };
  const files = new Map(); let uploads = 0; let audits = 0; let receipts = 0;
  return { db, documents, options: { db, secret, folderId: "qa-private-folder", currentSchoolYear: 2026,
    uploadContract: "qa-tb-idempotency-v1", upload: async (identity) => {
      if (!files.has(identity.submissionId)) { uploads++; files.set(identity.submissionId, "qa-file-1"); }
      return { fileId: files.get(identity.submissionId), submissionId: identity.submissionId,
        requestFingerprint: identity.requestFingerprint, folderId: "qa-private-folder", private: true };
    }, certificateStore: { environment: "qa", createRequest: async () => { audits++; } },
    recordReceipt: async (_db, submission) => { receipts++; return submission; } },
    counts: () => ({ uploads, audits, receipts }) };
}
test("QA TB identity ignores generated names and date but binds actor, year, content and metadata", () => {
  const identity = qaTbSubmissionIdentity(input, secret);
  assert.deepEqual(qaTbSubmissionIdentity({ ...input, fileName: "changed-tomorrow.pdf" }, secret), identity);
  for (const change of [{ actorStaffId: "QA-ADMIN" }, { schoolYear: 2027 }, { staffId: "QA-TB-002" },
    { fileBase64: Buffer.from("changed evidence").toString("base64") }, { fields: { ...input.fields, docType: "changed" } }]) {
    assert.notEqual(qaTbSubmissionIdentity({ ...input, ...change }, secret).submissionId, identity.submissionId);
  }
});
test("missing Apps Script TB recovery contract blocks before Firestore or Drive", async () => {
  const f = fixture();
  await assert.rejects(receiveQaTbSubmission(input, { ...f.options, uploadContract: null }), /계약/);
  assert.equal(f.documents.size, 0); assert.equal(f.counts().uploads, 0);
});
test("simulated configured 2027 accepts only 2027 receipts without live year changes", async () => {
  const f = fixture(); let audit; let submission;
  const future = { ...input, schoolYear: 2027 };
  const options = { ...f.options, currentSchoolYear: 2027,
    certificateStore: { environment: "qa", createRequest: async (value) => { audit = value; } },
    recordReceipt: async (_db, value) => { submission = value; return value; } };
  const result = await receiveQaTbSubmission(future, options);
  const stableId = qaTbSubmissionIdentity(future, secret).submissionId;
  assert.equal(result.submissionId, stableId); assert.equal(result.schoolYear, 2027);
  assert.equal(audit.submissionId, stableId); assert.equal(audit.schoolYear, 2027);
  assert.equal(submission.submissionId, stableId); assert.equal(submission.schoolYear, 2027);
  assert.equal(f.documents.get(stableId).schoolYear, 2027);
  await assert.rejects(receiveQaTbSubmission(input, options), (error) => error.status === 400);
  assert.equal(f.counts().uploads, 1); assert.equal(f.documents.size, 1);
});
test("Drive failure creates no audit or receipt; retry persists one file and same stable id", async () => {
  const f = fixture();
  await assert.rejects(receiveQaTbSubmission(input, { ...f.options, upload: async () => { throw new Error("Drive unavailable"); } }));
  assert.deepEqual(f.counts(), { uploads: 0, audits: 0, receipts: 0 });
  const result = await receiveQaTbSubmission(input, f.options);
  assert.equal(result.submissionId, qaTbSubmissionIdentity(input, secret).submissionId);
  assert.equal(result.schoolYear, 2026); assert.equal(result.environment, "qa");
});
test("Firestore receipt failure retries saved file without another upload", async () => {
  const f = fixture();
  await assert.rejects(receiveQaTbSubmission(input, { ...f.options, recordReceipt: async () => { throw new Error("Firestore failed"); } }));
  const result = await receiveQaTbSubmission(input, f.options);
  assert.equal(result.fileId, "qa-file-1"); assert.equal(f.counts().uploads, 1);
});
test("lost upload response and concurrent requests reuse the contract's single file", async () => {
  const f = fixture(); let loseResponse = true;
  const upload = async (...args) => { const result = await f.options.upload(...args);
    if (loseResponse) { loseResponse = false; throw new Error("response lost"); } return result; };
  await assert.rejects(receiveQaTbSubmission(input, { ...f.options, upload }));
  const results = await Promise.all([receiveQaTbSubmission(input, f.options), receiveQaTbSubmission(input, f.options)]);
  assert.equal(results[0].submissionId, results[1].submissionId); assert.equal(f.counts().uploads, 1);
});
test("changed fingerprint under reserved identity and wrong/private folder fail closed", async () => {
  const f = fixture(); const id = qaTbSubmissionIdentity(input, secret);
  f.documents.set(id.submissionId, { ...id, requestFingerprint: "changed" });
  await assert.rejects(receiveQaTbSubmission(input, f.options), (error) => error.status === 409);
  assert.equal(f.counts().uploads, 0);
  f.documents.clear();
  await assert.rejects(receiveQaTbSubmission(input, { ...f.options, upload: async () => ({ ...id, fileId: "wrong", folderId: "production", private: false }) }), /QA/);
  assert.equal(f.counts().receipts, 0);
});
