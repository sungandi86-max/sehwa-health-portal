import test from "node:test";
import assert from "node:assert/strict";
import { buildTrainingView, MATERIAL_HEADERS, TARGET_HEADERS, TRAINING_HEADERS, TrainingSourceNotReadyError } from "./trainingCenter.js";
import { createTrainingHandler } from "./trainingCenterApi.js";
import { trainingCenterSpreadsheetId } from "./trainingDeployment.js";
import { staffDirectoryHandler } from "../../api/firebase/staff-directory.js";
import { expectedTrainingDetail, expectedTrainingList, trainingCenterSheetFixture } from "../../tests/fixtures/trainingCenterFixture.js";

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

function handlerFor({ assignment = { active: true, uid: "uid-1", schoolYear: 2026, semester: 2, staffId: "T001", roles: ["staff"] }, sourceValue = source, directoryValue = [{ staffId: "T001", employmentStatus: "재직" }] } = {}) {
  return createTrainingHandler({
    auth: () => ({ verifyIdToken: async (token) => {
      if (token !== "valid") throw new Error("bad token");
      return { uid: "uid-1" };
    } }),
    db: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: Boolean(assignment), data: () => assignment }) }) }) }),
    directory: async () => ({ directory: directoryValue, stats: { duplicateStaffIds: 0 } }),
    sheets: async () => sourceValue,
    workbook: () => "QA_WORKBOOK_TEST_ONLY",
  });
}

async function call(handler, query = { resource: "training-list" }, token = "valid") {
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
  assert.equal((await call(handlerFor({ assignment: { active: true, uid: "uid-1", schoolYear: 2026, semester: 2, staffId: "", roles: ["staff"] } }))).statusCode, 403);
  assert.equal((await call(handlerFor({ directoryValue: [] }))).statusCode, 403);
  assert.equal((await call(handlerFor({ directoryValue: [{ staffId: "T001", employmentStatus: "휴직" }] }))).statusCode, 403);
});

test("training API returns list/detail without other staff data", async () => {
  const handler = handlerFor();
  const list = await call(handler);
  assert.equal(list.statusCode, 200);
  assert.equal(list.body.items.length, 1);
  assert.equal(JSON.stringify(list.body).includes("T002"), false);
  const detail = await call(handler, { resource: "training-detail", eventId: "event-1" });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.body.item.materials[0].title, "안내문");
  assert.equal(JSON.stringify(detail.body).includes("T002"), false);
  assert.equal((await call(handler, { resource: "training-detail", eventId: "missing" })).statusCode, 404);
  assert.equal((await call(handler, { resource: "training-detail" })).statusCode, 404);
  assert.equal((await call(handler, { resource: "invalid" })).statusCode, 400);
});

test("data-filled QA fixture returns only current staff fields in list and detail", async () => {
  const assignment = { active: true, uid: "uid-1", schoolYear: 2026, semester: 2, staffId: "QA001", roles: ["staff"] };
  const handler = handlerFor({
    assignment,
    directoryValue: [{ staffId: "QA001", employmentStatus: "재직" }],
    sourceValue: trainingCenterSheetFixture,
  });
  const list = await call(handler);
  assert.equal(list.statusCode, 200);
  assert.deepEqual(list.body, { ok: true, items: expectedTrainingList });

  const detail = await call(handler, { resource: "training-detail", eventId: "QA-TRAINING-001" });
  assert.equal(detail.statusCode, 200);
  assert.deepEqual(detail.body, { ok: true, item: expectedTrainingDetail });

  for (const payload of [list.body, detail.body]) {
    const serialized = JSON.stringify(payload);
    for (const privateValue of ["QA001", "QA002", "테스트 타인", "타인 출석", "타인 제출", "타인 이수", "미사용 QA 교육"]) {
      assert.equal(serialized.includes(privateValue), false, `${privateValue} must not appear in the response`);
    }
    assert.equal(serialized.includes("targets"), false);
  }
});

test("valid staff receives an empty list from header-only sheets", async () => {
  const empty = { trainings: [TRAINING_HEADERS], materials: [MATERIAL_HEADERS], targets: [TARGET_HEADERS] };
  const result = await call(handlerFor({ sourceValue: empty }));
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { ok: true, items: [] });
});

test("staff-directory dispatches training before admin gate and preserves admin gate", async () => {
  const training = handlerFor();
  const router = (req, res) => staffDirectoryHandler(req, res, { trainingHandler: training });
  assert.equal((await call(router)).statusCode, 200);
  assert.equal((await call(router, { resource: "training-detail", eventId: "event-1" })).statusCode, 200);
  assert.equal((await call(router, { resource: "staff-identity" }, "")).statusCode, 401);
  assert.equal((await call(router, { resource: "health-mandatory-training-sync" }, "")).statusCode, 401);
  assert.equal((await call(router, { resource: "health-mandatory-training-current-targets" }, "")).statusCode, 401);
  assert.equal((await call(router, { resource: "health-mandatory-training-exceptions" }, "")).statusCode, 401);
  assert.equal((await call(router, {}, "")).statusCode, 401);
});

test("training API reports absent sheets without exposing source data", async () => {
  const result = await call(handlerFor({ sourceValue: { trainings: [], materials: [], targets: [] } }));
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.code, "training-source-not-ready");
});

test("training list and detail reject unapproved Preview before authentication or Sheet reads", async () => {
  const context = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/other" };
  const calls = { auth: 0, directory: 0, sheets: 0 };
  const handler = createTrainingHandler({
    workbook: () => trainingCenterSpreadsheetId(context),
    auth: () => { calls.auth += 1; return { verifyIdToken: async () => ({ uid: "uid-1" }) }; },
    directory: async () => { calls.directory += 1; return { directory: [], stats: { duplicateStaffIds: 0 } }; },
    sheets: async () => { calls.sheets += 1; return source; },
  });
  for (const query of [{ resource: "training-list" }, { resource: "training-detail", eventId: "event-1" }]) {
    const result = await call(handler, query);
    assert.equal(result.statusCode, 503);
    assert.equal(result.body.code, "training-environment-not-allowed");
  }
  assert.deepEqual(calls, { auth: 0, directory: 0, sheets: 0 });
});
