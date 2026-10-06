import test from "node:test";
import assert from "node:assert/strict";
import { buildTrainingView, MATERIAL_HEADERS, TARGET_HEADERS, TRAINING_HEADERS, TrainingSourceNotReadyError } from "./trainingCenter.js";
import { createTrainingHandler } from "../../api/firebase/training.js";

const row = (headers, fields) => headers.map((header) => fields[header] ?? "");
const training = (eventId, extra = {}) => row(TRAINING_HEADERS, {
  eventId, eventGroupId: "group-1", 교육연도: "2026", 사용여부: "사용", 상태: "예정",
  교육명: "교직원 교육", 담당부서: "보건실", 일자: "2026-10-10", 시작시간: "15:00",
  종료시간: "16:00", 장소: "강당", 교육내용: "교육 안내", ...extra,
});
const target = (staffId, extra = {}) => row(TARGET_HEADERS, {
  eventId: "event-1", 교직원ID: staffId, 대상상태: "대상", 필수여부: "Y", 제외여부: "N", ...extra,
});
const source = {
  trainings: [TRAINING_HEADERS, training("event-1"), training("event-2", { 사용여부: "미사용" })],
  materials: [MATERIAL_HEADERS, row(MATERIAL_HEADERS, { materialId: "m-1", eventId: "event-1", 사용여부: "사용", 자료명: "안내문", 자료유형: "링크", "링크 또는 파일ID": "https://example.com/guide" })],
  targets: [TARGET_HEADERS, target("T001"), target("T002", { 대상상태: "비대상" })],
};

test("only enabled training and the authenticated staff target are returned", () => {
  const items = buildTrainingView(source, "T001");
  assert.equal(items.length, 1);
  assert.equal(items[0].targetStatus, "교육 대상");
  assert.equal(items[0].required, true);
  assert.equal(JSON.stringify(items).includes("T002"), false);
  assert.equal(JSON.stringify(items).includes("T001"), false);

  const detail = buildTrainingView(source, "T002", { eventId: "event-1" });
  assert.equal(detail.targetStatus, "대상 아님");
  assert.equal(detail.materials.length, 1);
  assert.equal(detail.description, "교육 안내");
  assert.equal(JSON.stringify(detail).includes("T001"), false);
  assert.equal(buildTrainingView(source, "T001", { eventId: "missing" }), null);
  assert.equal(buildTrainingView(source, "T001", { eventId: "event-2" }), null);
});

test("excluded and missing targets are distinct and unsafe source fails closed", () => {
  const excluded = { ...source, targets: [TARGET_HEADERS, target("T001", { 제외여부: "Y" })] };
  assert.equal(buildTrainingView(excluded, "T001")[0].targetStatus, "제외");
  assert.equal(buildTrainingView(excluded, "T099")[0].targetStatus, "대상 정보 없음");
  assert.throws(() => buildTrainingView({ ...source, trainings: [] }, "T001"), TrainingSourceNotReadyError);
});

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

function handlerFor({ assignment = { active: true, uid: "uid-1", schoolYear: 2026, semester: 2, staffId: "T001", roles: ["staff"] }, sourceValue = source } = {}) {
  return createTrainingHandler({
    auth: () => ({ verifyIdToken: async (token) => {
      if (token !== "valid") throw new Error("bad token");
      return { uid: "uid-1" };
    } }),
    db: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: Boolean(assignment), data: () => assignment }) }) }) }),
    directory: async () => ({ directory: [{ staffId: "T001", employmentStatus: "재직" }], stats: { duplicateStaffIds: 0 } }),
    sheets: async () => sourceValue,
  });
}

async function call(handler, query = { resource: "list" }, token = "valid") {
  const res = response();
  await handler({ method: "GET", headers: token ? { authorization: `Bearer ${token}` } : {}, query }, res);
  return res;
}

test("training API requires Firebase login and current assignment", async () => {
  assert.equal((await call(handlerFor(), undefined, "")).statusCode, 401);
  assert.equal((await call(handlerFor(), undefined, "invalid")).statusCode, 401);
  assert.equal((await call(handlerFor({ assignment: null }))).statusCode, 403);
  assert.equal((await call(handlerFor({ assignment: { active: false, uid: "uid-1", schoolYear: 2026, semester: 2, staffId: "T001", roles: ["staff"] } }))).statusCode, 403);
  assert.equal((await call(handlerFor({ assignment: { active: true, uid: "uid-1", schoolYear: 2026, semester: 2, staffId: "T001", roles: [] } }))).statusCode, 403);
  assert.equal((await call(handlerFor({ assignment: { active: true, uid: "other", schoolYear: 2026, semester: 2, staffId: "T001", roles: ["staff"] } }))).statusCode, 403);
});

test("training API returns list/detail without other staff data", async () => {
  const handler = handlerFor();
  const list = await call(handler);
  assert.equal(list.statusCode, 200);
  assert.equal(list.body.items.length, 1);
  assert.equal(JSON.stringify(list.body).includes("T002"), false);
  const detail = await call(handler, { resource: "detail", eventId: "event-1" });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.body.item.materials[0].title, "안내문");
  assert.equal(JSON.stringify(detail.body).includes("T002"), false);
  assert.equal((await call(handler, { resource: "detail", eventId: "missing" })).statusCode, 404);
});

test("training API reports absent sheets without exposing source data", async () => {
  const result = await call(handlerFor({ sourceValue: { trainings: [], materials: [], targets: [] } }));
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.code, "training-source-not-ready");
});
