import assert from "node:assert/strict";
import test from "node:test";
import handler from "../../api/portal.js";

const qa = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" };
const records = [
  { id: "_config", kind: "config", migrationComplete: true, counts: { checkup: 1 } },
  { id: "checkup_one", kind: "item", type: "checkup", active: true, visible: true, title: "검진 안내",
    content: "검진 설명", sortOrder: 1, link: "", fields: { target: "교직원", details: "10월 22일 검진",
      buttonLabel: "안내 보기", linkText: "안내문 링크", status: "안내 중", displayMode: "pending",
      operationStatus: "업데이트 예정", imageUrl: "", downloadUrl: "", secondaryButtonLabel: "",
      secondaryAction: "", copyText: "", updateNotice: "곧 업데이트" } },
];
const db = { collection(name) { assert.equal(name, "portal_content_qa"); return {
  get: async () => ({ docs: records.map((record) => ({ id: record.id, data: () => record })) }),
}; } };
function response() { return { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; },
  status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; },
  end() { return this; } }; }

test("home obtains checkup schedules from CMS without Apps Script", async () => {
  const res = response();
  await handler({ method: "GET", query: { scope: "home" } }, res,
    { db, context: qa, now: new Date("2026-10-09T03:00:00Z"), loadTbConfig: () => { throw new Error("must not call GAS"); } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.schedules.some((item) => item.sourceType === "checkup"), true);
});

test("checkup fallback keeps legacy response keys and separate registration config", async () => {
  const res = response();
  let configReads = 0;
  await handler({ method: "GET", query: { scope: "fallback", type: "checkups" } }, res,
    { db, context: qa, loadTbConfig: async () => { configReads += 1; return { enabled: "FALSE" }; } });
  assert.equal(res.statusCode, 200);
  assert.equal(configReads, 1);
  assert.deepEqual(Object.keys(res.body).sort(), ["checkups", "tbConfig", "updatedAt"]);
  assert.equal(res.body.checkups[0].url, "안내문 링크");
  assert.deepEqual(res.body.tbConfig, { enabled: "FALSE" });
});

test("missing registration config keeps CMS checkups visible but closes application card", async () => {
  const res = response();
  await handler({ method: "GET", query: { scope: "fallback", type: "checkups" } }, res,
    { db, context: qa, loadTbConfig: async () => { throw new Error("not configured"); } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.checkups.length, 1);
  assert.equal(res.body.tbConfig.enabled, "FALSE");
  assert.equal(JSON.stringify(res.body).includes("not configured"), false);
});
