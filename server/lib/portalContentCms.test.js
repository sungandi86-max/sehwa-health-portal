import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { handlePortalCmsResource } from "./portalContentCmsApi.js";
import { CMS_SHEETS, planCmsMigration } from "./portalContentMigration.js";
import { CmsInputError, cmsCollection, cmsPublicItems, readCms, saveCmsItem, validateCmsInput } from "./portalContentCms.js";

const qa = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" };
const production = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" };

function row(type, cells) {
  const headers = CMS_SHEETS[type].headers;
  return headers.map((header) => cells[header] ?? "");
}

function source() {
  return {
    notice: [[...CMS_SHEETS.notice.headers],
      row("notice", { 사용여부: "TRUE", 제목: "지난 공지", 내용: "지난 안내", 일시: "8월 2일", 정렬순서: "1" }),
      row("notice", { 사용여부: "TRUE", 제목: "현재 공지", 제목1줄: "현재", 제목2줄: "공지", 내용: "안내", 일시: "10월 9일", 상태: "진행 중", 정렬순서: "2" })],
    faq: [[...CMS_SHEETS.faq.headers],
      row("faq", { 사용여부: "TRUE", 질문: "질문 1", 답변: "답변 1", 정렬순서: "2" }),
      row("faq", { 사용여부: "FALSE", 질문: "숨긴 질문", 답변: "숨긴 답변", 정렬순서: "1" })],
    health_event: [[...CMS_SHEETS.health_event.headers],
      row("health_event", { 사용여부: "TRUE", 제목: "건강 자료", 카테고리: "건강정보", 설명: "설명", 버튼명: "자료 열기", 링크: "https://example.org", 정렬순서: "3" })],
    education: [[...CMS_SHEETS.education.headers],
      row("education", { 사용여부: "TRUE", 교육명: "교육 A", 대상: "교직원", 설명: "설명", 일정: "10월 9일", 버튼명: "영상 보기", 링크: "https://example.org" }),
      row("education", { 사용여부: "FALSE", 교육명: "교육 B", 설명: "내용" })],
  };
}

function memoryDb(initial = []) {
  const collections = new Map();
  const changes = [];
  const seed = (name, records) => collections.set(name, new Map(records.map((record) => [record.id, { ...record }])));
  seed("portal_content_qa", initial);
  const snapshot = (data, id) => ({ id, exists: data.has(id), data: () => data.get(id) });
  return {
    collections, changes,
    collection(name) {
      if (!collections.has(name)) collections.set(name, new Map());
      const data = collections.get(name);
      return {
        get: async () => ({ docs: [...data.keys()].map((id) => snapshot(data, id)) }),
        doc: (id) => ({
          get: async () => snapshot(data, id),
          create: async (item) => { if (data.has(id)) throw new Error("duplicate"); data.set(id, item); changes.push({ name, id, op: "create" }); },
          update: async (patch) => { data.set(id, { ...data.get(id), ...patch }); changes.push({ name, id, op: "update" }); },
        }),
      };
    },
  };
}

function response() {
  return { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("common migration preserves four source schemas and public legacy shapes", () => {
  const plan = planCmsMigration(source());
  assert.deepEqual(plan.counts, { notice: 2, faq: 2, health_event: 1, education: 2 });
  assert.deepEqual(plan.conflicts, []);
  assert.equal(plan.records.length, 8);
  assert.equal(planCmsMigration(source(), plan.records).alreadyMigrated, true);
  const now = new Date("2026-10-09T04:00:00Z");
  assert.deepEqual(cmsPublicItems(plan.records, "notice", now), [{
    title: "현재 공지", titleLines: ["현재", "공지"], date: "10월 9일", target: "",
    description: "안내", actionText: "", status: "진행 중", badgeType: "blue",
  }]);
  assert.deepEqual(cmsPublicItems(plan.records, "faq", now), [{ question: "질문 1", answer: "답변 1" }]);
  assert.deepEqual(cmsPublicItems(plan.records, "health_event", now)[0], {
    title: "건강 자료", category: "건강정보", description: "설명", buttonText: "자료 열기", url: "https://example.org",
  });
  assert.equal(cmsPublicItems(plan.records, "education", now).length, 1);
  assert.equal(plan.records.find((item) => item.title === "교육 A").sortOrder, 999);
  assert.equal(plan.records.find((item) => item.title === "현재 공지").legacy.sourceRow, 3);
});

test("duplicate title, bad header, or existing conflicting documents stop migration", () => {
  const duplicate = source();
  duplicate.faq.push(row("faq", { 사용여부: "TRUE", 질문: "질문 1", 답변: "새 답변" }));
  assert.equal(planCmsMigration(duplicate).conflicts[0].code, "duplicate_title");
  const malformed = source();
  malformed.education[0][0] = "잘못된 헤더";
  assert.equal(planCmsMigration(malformed).conflicts[0].code, "header_mismatch");
  assert.equal(planCmsMigration(source(), [{ id: "unexpected" }]).conflicts[0].code, "existing_firestore_docs");
});

test("deployment collections are isolated and unknown Preview fails closed", () => {
  assert.equal(cmsCollection(qa), "portal_content_qa");
  assert.equal(cmsCollection(production), "portal_content_production");
  assert.throws(() => cmsCollection({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature" }), CmsInputError);
});

test("admin edits, hides, deactivates and restores without hard delete", async () => {
  const plan = planCmsMigration(source());
  const db = memoryDb(plan.records);
  const item = { type: "faq", title: "새 질문", content: "새 답변", category: "", link: "", attachment: "",
    fields: {}, visible: true, sortOrder: 10, startAt: "", endAt: "" };
  const { id } = await saveCmsItem(db, { action: "add", input: item, actorUid: "admin", context: qa });
  await saveCmsItem(db, { action: "update", id, input: { ...item, content: "수정 답변" }, actorUid: "admin", context: qa });
  await saveCmsItem(db, { action: "hide", id, actorUid: "admin", context: qa });
  assert.equal(cmsPublicItems(await readCms(db, { context: qa }), "faq").some((entry) => entry.question === "새 질문"), false);
  await saveCmsItem(db, { action: "show", id, actorUid: "admin", context: qa });
  await saveCmsItem(db, { action: "deactivate", id, actorUid: "admin", context: qa });
  assert.equal(db.collections.get("portal_content_qa").get(id).active, false);
  await saveCmsItem(db, { action: "restore", id, actorUid: "admin", context: qa });
  assert.equal(db.collections.get("portal_content_qa").get(id).active, true);
  assert.equal(db.collections.get("portal_content_qa").get(id).content, "수정 답변");
  assert.equal(db.collections.get("portal_content_production"), undefined);
  assert.equal(db.changes.some((change) => change.op === "delete"), false);
  await saveCmsItem(db, { action: "hide", id, actorUid: "admin", context: qa });
  await saveCmsItem(db, { action: "deactivate", id, actorUid: "admin", context: qa });
  await saveCmsItem(db, { action: "restore", id, actorUid: "admin", context: qa });
  assert.equal(db.collections.get("portal_content_qa").get(id).visible, false);
});

test("invalid date and unsafe link are rejected at the admin boundary", () => {
  const item = { type: "health_event", title: "자료", content: "설명", sortOrder: 1, visible: true, fields: {} };
  assert.throws(() => validateCmsInput({ ...item, startAt: "2026-02-30" }), CmsInputError);
  assert.throws(() => validateCmsInput({ ...item, link: "javascript:alert(1)" }), CmsInputError);
  assert.throws(() => validateCmsInput({ ...item, link: "//outside" }), CmsInputError);
  assert.throws(() => validateCmsInput({ ...item, link: "http://outside.example" }), CmsInputError);
});

test("checkup administrator fields preserve safe pending and notice actions", async () => {
  const plan = planCmsMigration(source());
  const db = memoryDb(plan.records);
  const item = { type: "checkup", title: "검진 안내", content: "내용", category: "", link: "",
    attachment: "", visible: true, sortOrder: 2, startAt: "", endAt: "",
    fields: { target: "교직원", details: "6월 26일 검진\n준비 안내", buttonLabel: "안내 보기",
      linkText: "안내문 링크", status: "안내 중", displayMode: "pending", operationStatus: "업데이트 예정",
      imageUrl: "", downloadUrl: "", secondaryButtonLabel: "담임 협조사항", secondaryAction: "notice",
      copyText: "학급 대기 협조", updateNotice: "D-3 업데이트" } };
  const { id } = await saveCmsItem(db, { action: "add", input: item, actorUid: "admin", context: qa });
  const publicItem = cmsPublicItems(await readCms(db, { context: qa }), "checkup")[0];
  assert.equal(publicItem.schedule, "6월 26일 검진");
  assert.equal(publicItem.url, "안내문 링크");
  assert.equal(publicItem.secondaryAction, "notice");
  await saveCmsItem(db, { action: "hide", id, actorUid: "admin", context: qa });
  assert.equal(cmsPublicItems(await readCms(db, { context: qa }), "checkup").length, 0);
  await saveCmsItem(db, { action: "show", id, actorUid: "admin", context: qa });
  await saveCmsItem(db, { action: "deactivate", id, actorUid: "admin", context: qa });
  await saveCmsItem(db, { action: "restore", id, actorUid: "admin", context: qa });
  assert.equal(db.collections.get("portal_content_qa").get(id).active, true);
  assert.equal(db.collections.get("portal_content_production"), undefined);
  assert.throws(() => validateCmsInput({ ...item, fields: { ...item.fields, imageUrl: "javascript:alert(1)" } }), CmsInputError);
  assert.throws(() => validateCmsInput({ ...item, fields: { ...item.fields, displayMode: "unknown" } }), CmsInputError);
});

test("checkup public projection never exposes unsafe stored links", () => {
  const unsafe = { id: "checkup_unsafe", kind: "item", type: "checkup", title: "검진 안내", content: "내용",
    active: true, visible: true, sortOrder: 1, link: "javascript:alert(1)",
    fields: { imageUrl: "javascript:alert(2)", downloadUrl: "http://example.org/file", linkText: "javascript:alert(3)" } };
  const [publicItem] = cmsPublicItems([unsafe], "checkup");
  assert.equal(publicItem.url, "");
  assert.equal(publicItem.imageUrl, "");
  assert.equal(publicItem.downloadUrl, "");
});

test("unsafe legacy links cannot be imported active or restored without correction", async () => {
  const activeSource = source();
  activeSource.education[1][CMS_SHEETS.education.headers.indexOf("링크")] = "javascript:alert(1)";
  assert.equal(planCmsMigration(activeSource).conflicts[0].code, "invalid_row");
  const inactiveSource = source();
  inactiveSource.education[2][CMS_SHEETS.education.headers.indexOf("링크")] = "유튜브 링크";
  const plan = planCmsMigration(inactiveSource);
  assert.deepEqual(plan.conflicts, []);
  const db = memoryDb(plan.records);
  const item = plan.records.find((record) => record.title === "교육 B");
  await assert.rejects(saveCmsItem(db, { action: "restore", id: item.id, actorUid: "admin", context: qa }), CmsInputError);
  assert.equal(db.collections.get("portal_content_qa").get(item.id).active, false);
});

test("administrator CMS resource requires login and role before writes", async () => {
  const db = memoryDb(planCmsMigration(source()).records);
  const base = db.collection.bind(db);
  let roles = ["staff"];
  db.collection = (name) => name === "user_assignments"
    ? { doc: () => ({ get: async () => ({ exists: true, data: () => ({ active: true, roles }) }) }) }
    : base(name);
  const auth = { verifyIdToken: async () => ({ uid: "qa-user" }) };
  const unauthenticated = response();
  await handlePortalCmsResource({ method: "GET", headers: {} }, unauthenticated, { auth, db, context: qa });
  assert.equal(unauthenticated.statusCode, 401);
  const req = { method: "GET", headers: { authorization: "Bearer fixture" } };
  const staff = response();
  await handlePortalCmsResource(req, staff, { auth, db, context: qa });
  assert.equal(staff.statusCode, 403);
  assert.equal(db.changes.length, 0);
  roles = ["health_teacher"];
  const admin = response();
  await handlePortalCmsResource(req, admin, { auth, db, context: qa });
  assert.equal(admin.statusCode, 200);
  assert.equal(admin.body.items.length, 7);
  assert.equal(admin.headers["Cache-Control"], "private, no-store");
});

test("Apps Script home, full and fallback scopes never read migrated content or checkup tabs", () => {
  const accessed = [];
  const context = vm.createContext({
    Utilities: { formatDate: () => "2026-10-09 12:00:00" },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    __source: { getSheetByName: (name) => { accessed.push(name); throw new Error(`unexpected Sheet read: ${name}`); } },
  });
  vm.runInContext(fs.readFileSync("apps-script/Code.gs", "utf8"), context, { timeout: 2000 });
  vm.runInContext(`
    getSpreadsheet_ = () => __source;
    getPortalTbConfig_ = () => ({});
    getUploads_ = () => [];
    getStudentCare_ = () => [];
    getMessages_ = () => [];
  `, context);
  const read = (scope, type = "") => JSON.parse(vm.runInContext(
    `JSON.stringify(getPortalData_(${JSON.stringify({ scope, type })}))`, context,
  ));
  assert.equal("checkups" in read("home"), false);
  assert.equal("checkups" in read("full"), false);
  for (const type of ["today", "faq", "resources", "education", "checkups"]) {
    assert.equal(Object.keys(read("fallback", type)).length, 1);
  }
  assert.deepEqual(accessed, []);
});
