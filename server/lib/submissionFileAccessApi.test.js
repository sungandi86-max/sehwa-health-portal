import assert from "node:assert/strict";
import test from "node:test";
import { handleSubmissionFileAccessResource } from "./submissionFileAccessApi.js";

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

function database(record) {
  return {
    app: { options: { projectId: "sehwa-health-portal-v2" } },
    projectId: "sehwa-health-portal-v2",
    collection(name) {
      return { doc(id) { return { async get() { return { exists: Boolean(record), id, data: () => record }; } }; } };
    },
  };
}

test("submission file access rejects non-admins before reading submission data", async () => {
  let read = false;
  const res = response();
  await handleSubmissionFileAccessResource({ method: "GET", query: { submissionId: "submission-1", fileIndex: "0" } }, res, {
    verifyAdmin: async () => ({ ok: false, status: 403, message: "denied" }),
    readSubmission: async () => { read = true; },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(read, false);
});

test("submission file access returns only the requested file from the authorized record", async () => {
  const db = database({ files: [
    { driveFileId: "first-file", name: "first.pdf", type: "application/pdf" },
    { driveFileId: "second-file", name: "second.png", type: "image/png" },
  ] });
  const res = response();
  await handleSubmissionFileAccessResource({ method: "GET", query: { submissionId: "submission-1", fileIndex: "1" } }, res, {
    verifyAdmin: async () => ({ ok: true, db }),
    context: { APP_ENV: "production", FIREBASE_PROJECT_ID: "sehwa-health-portal-v2" },
    readSubmission: async () => ({ files: [
      { driveFileId: "first-file", name: "first.pdf", type: "application/pdf" },
      { driveFileId: "second-file", name: "second.png", type: "image/png" },
    ] }),
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.file, {
    fileName: "second.png",
    mimeType: "image/png",
    url: "https://drive.google.com/file/d/second-file/preview",
  });
});

test("submission file access ignores forged file identifiers and URLs from the request", async () => {
  const res = response();
  await handleSubmissionFileAccessResource({ method: "GET", query: {
    submissionId: "submission-1",
    fileIndex: "0",
    fileId: "foreign-drive-file",
    url: "https://drive.google.com/file/d/foreign-drive-file/view",
  } }, res, {
    verifyAdmin: async () => ({ ok: true, db: database({}) }),
    readSubmission: async () => ({ file: {
      driveFileId: "owned-drive-file",
      fileName: "owned.pdf",
      mimeType: "application/pdf",
    } }),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.file.url, "https://drive.google.com/file/d/owned-drive-file/preview");
  assert.equal(JSON.stringify(res.body).includes("foreign-drive-file"), false);
});

test("submission file access reports missing records and file references clearly", async () => {
  for (const record of [null, { file: {} }]) {
    const res = response();
    await handleSubmissionFileAccessResource({ method: "GET", query: { submissionId: "submission-1", fileIndex: "0" } }, res, {
      verifyAdmin: async () => ({ ok: true, db: database(record) }),
      readSubmission: async () => record,
    });
    assert.equal(res.statusCode, 404);
    assert.match(res.body.message, record ? /첨부파일/ : /제출 기록/);
  }
});
