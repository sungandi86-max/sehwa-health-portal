import assert from "node:assert/strict";
import test from "node:test";
import { getAdminSubmissionFileUrl } from "./adminSubmissionFiles.js";

const user = { getIdToken: async () => "admin-token" };

test("admin file request sends authentication and never sends a client supplied Drive id", async () => {
  let request;
  const file = await getAdminSubmissionFileUrl("submission-1", 2, {
    user,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ ok: true, file: {
        fileName: "certificate.pdf",
        mimeType: "application/pdf",
        url: "https://drive.google.com/file/d/server-owned/preview",
      } }) };
    },
  });
  assert.equal(request.options.headers.Authorization, "Bearer admin-token");
  assert.match(request.url, /submissionId=submission-1/);
  assert.match(request.url, /fileIndex=2/);
  assert.doesNotMatch(request.url, /fileId|drive|url=/i);
  assert.equal(file.url, "https://drive.google.com/file/d/server-owned/preview");
});

test("admin file request maps authorization and missing-original failures to clear messages", async () => {
  for (const [status, expected] of [[403, /관리자 권한/], [404, /삭제/]]) {
    await assert.rejects(getAdminSubmissionFileUrl("submission-1", 0, {
      user,
      fetchImpl: async () => ({ ok: false, status, json: async () => ({ ok: false }) }),
    }), expected);
  }
});
