import test from "node:test";
import assert from "node:assert/strict";
import { handleAdminProxySubmissionsResource } from "./adminProxySubmissionApi.js";

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("proxy admin read rejects non-admins", async () => {
  const res = response();
  await handleAdminProxySubmissionsResource({ method: "GET" }, res, {
    verifyAdmin: async () => ({ ok: false, status: 403, message: "관리자 권한이 없습니다." }),
  });
  assert.equal(res.statusCode, 403);
});

test("proxy admin read uses QA-only collection", async () => {
  let collectionName = "";
  const res = response();
  await handleAdminProxySubmissionsResource({ method: "GET" }, res, {
    environment: () => "qa",
    verifyAdmin: async () => ({ ok: true, db: { collection(name) {
      collectionName = name;
      return { where: () => ({ limit: () => ({ get: async () => ({ docs: [{ id: "proxy-1", data: () => ({
        itemId: "tb", staffId: "T049", submissionMode: "admin_proxy",
        submittedAt: new Date("2026-10-14T01:02:03Z"),
      }) }] }) }) }) };
    } } }),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(collectionName, "staff_submissions_qa");
  assert.equal(res.body.items[0].submittedAt, "2026-10-14T01:02:03.000Z");
});
