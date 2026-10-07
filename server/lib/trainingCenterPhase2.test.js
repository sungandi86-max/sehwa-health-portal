import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { PNG } from "pngjs";
import { staffDirectoryHandler } from "../../api/firebase/staff-directory.js";
import { MATERIAL_HEADERS, TARGET_HEADERS, TRAINING_HEADERS, TrainingSourceNotReadyError } from "./trainingCenter.js";
import { createTrainingPhase2Handler } from "./trainingCenterPhase2Api.js";
import { AttendanceConflictError, cancelAttendanceLock, finishAttendance, markAttendanceAppendStarted, reserveAttendance } from "./trainingAttendanceCoordinator.js";
import { hasSignatureSheetSchema, managedCellUpdates, TrainingCenterStore } from "./trainingCenterStore.js";
import { attendanceEligibility, decodeInkSignature, finalSheetModel, issueQrChallenge, parseTrainingSource, SIGNATURE_HEADERS, validateTrainingInput, verifyQrChallenge } from "./trainingCenterPhase2.js";
import { makeTrainingRosterXlsx } from "./trainingFinalSheet.js";
import { SignatureStorageError } from "./trainingSignatureStorage.js";

const row = (headers, values) => headers.map((header) => values[header] ?? "");
const open = "2026-10-06T08:00:00+09:00";
const close = "2026-10-06T20:00:00+09:00";
const event = (eventId, extra = {}) => row(TRAINING_HEADERS, {
  eventId, eventGroupId: "GROUP-1", 교육연도: "2026", 사용여부: "사용", 상태: "진행중", 교육명: `교육 ${eventId}`,
  담당부서: "보건실", 일자: "2026-10-06", 시작시간: "10:00", 종료시간: "11:00", 장소: "강당",
  signatureOpenAt: open, signatureCloseAt: close, ...extra,
});
const target = (eventId, staffId, extra = {}) => row(TARGET_HEADERS, { eventId, 교직원ID: staffId, 대상상태: "대상", 필수여부: "Y", 제외여부: "N", ...extra });
const source = () => ({
  trainings: [TRAINING_HEADERS, event("EVENT-1"), event("EVENT-2")],
  materials: [MATERIAL_HEADERS],
  targets: [TARGET_HEADERS, target("EVENT-1", "QA001"), target("EVENT-2", "QA001"), target("EVENT-1", "QA002")],
  signatures: [SIGNATURE_HEADERS],
});
const directory = [{ staffId: "QA001", name: "테스트 교직원", department: "보건실", position: "교사", employmentStatus: "재직" },
  { staffId: "QA002", name: "다른 교직원", department: "교무실", position: "교사", employmentStatus: "재직" }];
const now = () => new Date("2026-10-06T04:00:00.000Z");
const secret = "test-only-phase2-challenge-secret";

function inkPng(ink = true) {
  const image = new PNG({ width: 300, height: 100, colorType: 6 });
  image.data.fill(0);
  if (ink) for (let x = 10; x < 100; x += 1) {
    const offset = (25 * image.width + x) * 4;
    image.data[offset] = 20; image.data[offset + 1] = 20; image.data[offset + 2] = 20; image.data[offset + 3] = 255;
  }
  return PNG.sync.write(image);
}

function fakeDb() {
  const records = new Map();
  const assignments = {
    "uid-admin_2026_2": { active: true, uid: "uid-admin", schoolYear: 2026, semester: 2, staffId: "QA001", roles: ["health_teacher"] },
    "uid-admin2_2026_2": { active: true, uid: "uid-admin2", schoolYear: 2026, semester: 2, staffId: "QA001", roles: ["admin"] },
    "uid-staff_2026_2": { active: true, uid: "uid-staff", schoolYear: 2026, semester: 2, staffId: "QA001", roles: ["staff"] },
    "uid-homeroom_2026_2": { active: true, uid: "uid-homeroom", schoolYear: 2026, semester: 2, staffId: "QA001", roles: ["homeroom"] },
  };
  let chain = Promise.resolve();
  return {
    records,
    collection(name) {
      return { where(field, operator, value) {
        assert.equal(operator, "==");
        return { limit(count) { return { get: async () => ({ docs: [...records.entries()]
          .filter(([key, data]) => key.startsWith(`${name}/`) && data[field] === value)
          .slice(0, count).map(([key, data]) => ({ id: key.slice(name.length + 1), data: () => data })) }) }; } };
      }, doc(id) {
        const key = `${name}/${id}`;
        return { get: async () => {
          const data = name === "user_assignments" ? assignments[id] : records.get(key);
          return { exists: Boolean(data), data: () => data };
        }, set: async (data, options) => { records.set(key, options?.merge ? { ...records.get(key), ...data } : data); } };
      } };
    },
    async runTransaction(callback) {
      const prior = chain;
      let release;
      chain = new Promise((resolve) => { release = resolve; });
      await prior;
      try {
        const changes = [];
        const transaction = { get: (ref) => ref.get(), set: (ref, data, options) => changes.push([ref, data, options]) };
        const result = await callback(transaction);
        for (const [ref, data, options] of changes) await ref.set(data, options);
        return result;
      } finally { release(); }
    },
  };
}

function fakeStore({ appendMode = "success" } = {}) {
  const values = source();
  const calls = { uploads: 0, appended: 0, saved: 0 };
  return {
    calls, values,
    signatureStorageConfigured: true,
    assertSignatureStorageConfigured: () => {},
    inspectSignatureStorage: async () => ({ bucketReady: true, readReady: true, writeReady: null }),
    isSignatureSheetReady: async () => true,
    listSignatureFilesByRequest: async () => [],
    readBase: async () => values,
    readSource: async () => values,
    saveRow: async (name, headers, fields, rowNumber) => {
      const table = name === "앱_교직원교육" ? values.trainings : name === "교직원교육전자서명" ? values.signatures : values.targets;
      if (rowNumber) table[rowNumber - 1] = row(headers, fields); else table.push(row(headers, fields));
      calls.saved += 1;
    },
    uploadSignature: async () => { calls.uploads += 1; return "PRIVATE_FILE_1"; },
    appendSignatures: async (records) => {
      calls.appended += 1;
      if (appendMode !== "before") records.forEach((record) => values.signatures.push(row(SIGNATURE_HEADERS, record)));
      if (appendMode !== "success") throw new Error("simulated Sheets failure");
    },
    downloadSignature: async () => inkPng(),
  };
}

function response() {
  return { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, send(bytes) { this.bytes = bytes; return this; }, end() { return this; } };
}

function harness(options = {}) {
  const db = fakeDb();
  const store = options.store || fakeStore(options);
  const handler = createTrainingPhase2Handler({
    auth: () => ({ verifyIdToken: async (token) => {
      if (token === "admin") return { uid: "uid-admin" };
      if (token === "admin2") return { uid: "uid-admin2" };
      if (token === "staff") return { uid: "uid-staff" };
      if (token === "homeroom") return { uid: "uid-homeroom" };
      throw new Error("invalid token");
    } }),
    db: () => db,
    directory: async () => ({ directory, stats: { duplicateStaffIds: 0 } }),
    store, rosterPdf: options.rosterPdf || { render: async () => Buffer.from("%PDF-test") },
    secret: () => options.secret ?? secret, now: options.now || now,
  });
  async function call(resource, { token = "admin", method = "GET", query = {}, body = null } = {}) {
    const res = response();
    await handler({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, query: { resource, ...query }, body }, res);
    return res;
  }
  return { call, db, store, handler };
}

test("QR challenge is scoped, short lived, and tamper resistant", () => {
  const token = issueQrChallenge({ eventId: "EVENT-1", secret, now: now().getTime() });
  assert.equal(verifyQrChallenge(token, { eventId: "EVENT-1", secret, now: now().getTime() }), true);
  assert.equal(verifyQrChallenge(token, { eventId: "EVENT-2", secret, now: now().getTime() }), false);
  assert.equal(verifyQrChallenge(`${token}x`, { eventId: "EVENT-1", secret, now: now().getTime() }), false);
  assert.equal(verifyQrChallenge(token, { eventId: "EVENT-1", secret, now: now().getTime() + 16 * 60 * 1000 }), false);
});

test("eligibility checks target, exclusion, duplicate, and time per group event", () => {
  const parsed = parseTrainingSource(source());
  assert.deepEqual(attendanceEligibility(parsed, parsed.trainings, "QA001", now()).map((item) => item.eligible), [true, true]);
  assert.deepEqual(attendanceEligibility(parsed, parsed.trainings, "QA002", now()).map((item) => item.eligible), [true, false]);
  parsed.targets.find((row) => row.eventId === "EVENT-2")["제외여부"] = "Y";
  assert.equal(attendanceEligibility(parsed, parsed.trainings, "QA001", now())[1].eligible, false);
  assert.equal(attendanceEligibility(parsed, parsed.trainings, "QA001", new Date("2026-10-07T04:00:00Z"))[0].eligible, false);
});

test("blank signature fails server validation; real PNG ink passes", () => {
  assert.throws(() => decodeInkSignature(`data:image/png;base64,${inkPng(false).toString("base64")}`), /빈 서명/);
  assert.deepEqual(decodeInkSignature(`data:image/png;base64,${inkPng().toString("base64")}`), inkPng());
});

test("staff cannot access administrator education resources", async () => {
  const { call } = harness();
  assert.equal((await call("training-admin-list", { token: "" })).statusCode, 401);
  assert.equal((await call("training-admin-list", { token: "bad" })).statusCode, 401);
  assert.equal((await call("training-admin-list", { token: "staff" })).statusCode, 403);
  assert.equal((await call("training-admin-list", { token: "homeroom" })).statusCode, 403);
  assert.equal((await call("training-admin-list")).statusCode, 200);
  assert.equal((await call("training-admin-list", { token: "admin2" })).statusCode, 200);
  assert.equal((await call("training-targets", { token: "staff", query: { eventId: "EVENT-1" } })).statusCode, 403);
  assert.equal((await call("training-final-sheet", { token: "staff", query: { eventId: "EVENT-1" } })).statusCode, 403);
});

test("admin education and canonical target management use existing Sheet schema", async () => {
  const { call, store } = harness();
  assert.equal((await call("training-admin-list")).body.items.length, 2);
  const saved = await call("training-admin-save", { method: "POST", body: Object.fromEntries(TRAINING_HEADERS.map((header, index) => [header, source().trainings[1][index]])) });
  assert.equal(saved.statusCode, 200);
  assert.equal(store.calls.saved, 1);
  const targetResult = await call("training-target-save", { method: "POST", body: { eventId: "EVENT-1", staffId: "QA002", targetStatus: "제외", required: true, excludedReason: "테스트 제외" } });
  assert.equal(targetResult.statusCode, 200);
  const excluded = (await call("training-targets", { query: { eventId: "EVENT-1" } })).body.items.find((item) => item["교직원ID"] === "QA002");
  assert.equal(excluded["대상상태"], "제외");
  assert.equal(excluded["필수여부"], "N");
});

test("group submission validates every target and creates one private image plus two atomic rows", async () => {
  const { call, store } = harness();
  const challenge = issueQrChallenge({ eventGroupId: "GROUP-1", secret, now: now().getTime() });
  const check = await call("training-attendance-check", { token: "staff", query: { eventGroupId: "GROUP-1", challenge, staffId: "QA002" } });
  assert.equal(check.statusCode, 200);
  assert.equal((await call("training-attendance-check", { token: "homeroom", query: { eventGroupId: "GROUP-1", challenge } })).statusCode, 200);
  assert.equal(check.body.canSubmit, true);
  assert.equal(JSON.stringify(check.body).includes("QA002"), false);
  const signed = await call("training-attendance-submit", { token: "staff", method: "POST", body: { eventGroupId: "GROUP-1", challenge, staffId: "QA002", signature: `data:image/png;base64,${inkPng().toString("base64")}` } });
  assert.equal(signed.statusCode, 200);
  assert.equal(signed.body.eventIds.length, 2);
  assert.equal(store.calls.uploads, 1);
  assert.equal(store.calls.appended, 1);
  assert.equal(store.values.signatures.length, 3);
  assert.equal((await call("training-attendance-submit", { token: "staff", method: "POST", body: { eventGroupId: "GROUP-1", challenge, signature: `data:image/png;base64,${inkPng().toString("base64")}` } })).statusCode, 409);
});

test("group submission blocks all rows when one event is not targeted", async () => {
  const { call, store } = harness();
  const challenge = issueQrChallenge({ eventGroupId: "GROUP-1", secret, now: now().getTime() });
  store.values.targets = store.values.targets.filter((row) => row[0] !== "EVENT-2");
  const result = await call("training-attendance-submit", { token: "staff", method: "POST", body: { eventGroupId: "GROUP-1", challenge, signature: `data:image/png;base64,${inkPng().toString("base64")}` } });
  assert.equal(result.statusCode, 409);
  assert.equal(store.calls.uploads, 0);
  assert.equal(store.calls.appended, 0);
});

test("concurrent submissions reserve the same event and staff only once", async () => {
  const { call, store } = harness();
  const challenge = issueQrChallenge({ eventId: "EVENT-1", secret, now: now().getTime() });
  const body = { eventId: "EVENT-1", challenge, signature: `data:image/png;base64,${inkPng().toString("base64")}` };
  const results = await Promise.all([call("training-attendance-submit", { token: "staff", method: "POST", body }), call("training-attendance-submit", { token: "staff", method: "POST", body })]);
  assert.deepEqual(results.map((result) => result.statusCode).sort(), [200, 409]);
  assert.equal(store.calls.appended, 1);
  assert.equal(store.values.signatures.length, 2);
});

test("pending lock cannot be replaced after lease time and a retry cannot cancel it", async () => {
  const db = fakeDb();
  const first = await reserveAttendance(db, ["EVENT-1"], "QA001", 0);
  await assert.rejects(reserveAttendance(db, ["EVENT-1"], "QA001", 16 * 60 * 1000), AttendanceConflictError);
  await assert.rejects(cancelAttendanceLock(db, "EVENT-1", "QA001", "ADMIN"), AttendanceConflictError);
  await finishAttendance(first, "completed");
  await assert.rejects(reserveAttendance(db, ["EVENT-1"], "QA001", 17 * 60 * 1000), AttendanceConflictError);
});

test("a delayed upload cannot overlap a second attendance submission", async () => {
  let clock = now();
  const store = fakeStore();
  const originalUpload = store.uploadSignature;
  let releaseUpload;
  let enteredUpload;
  const started = new Promise((resolve) => { enteredUpload = resolve; });
  const blocked = new Promise((resolve) => { releaseUpload = resolve; });
  store.uploadSignature = async (...args) => { enteredUpload(); await blocked; return originalUpload(...args); };
  const { call } = harness({ store, now: () => clock });
  const signature = `data:image/png;base64,${inkPng().toString("base64")}`;
  const firstChallenge = issueQrChallenge({ eventId: "EVENT-1", secret, now: clock.getTime() });
  const first = call("training-attendance-submit", { token: "staff", method: "POST", body: { eventId: "EVENT-1", challenge: firstChallenge, signature } });
  await started;
  clock = new Date(clock.getTime() + 16 * 60 * 1000);
  const secondChallenge = issueQrChallenge({ eventId: "EVENT-1", secret, now: clock.getTime() });
  const second = await call("training-attendance-submit", { token: "staff", method: "POST", body: { eventId: "EVENT-1", challenge: secondChallenge, signature } });
  assert.equal(second.statusCode, 409);
  releaseUpload();
  assert.equal((await first).statusCode, 200);
  assert.equal(store.calls.appended, 1);
});

test("existing Sheet updates touch only managed columns", () => {
  const changes = managedCellUpdates(17, 4, ["eventId", "교육명"], { eventId: "EVENT-1", "교육명": "수정" }, ["eventId", "운영 수식", "교육명"]);
  assert.deepEqual(changes.map((change) => change.updateCells.start.columnIndex), [0, 2]);
  assert.equal(changes.every((change) => change.updateCells.rows[0].values.length === 1), true);
});

test("training input rejects impossible dates and clock times", () => {
  const fields = Object.fromEntries(TRAINING_HEADERS.map((header, index) => [header, source().trainings[1][index]]));
  assert.throws(() => validateTrainingInput({ ...fields, "일자": "2026-02-31" }), RangeError);
  assert.throws(() => validateTrainingInput({ ...fields, "시작시간": "25:00" }), RangeError);
  assert.throws(() => validateTrainingInput({ ...fields, "종료시간": "09:00" }), RangeError);
});

test("stale pending without a Sheet row becomes retryable only for an administrator", async () => {
  const { call, db, store } = harness();
  const reservation = await reserveAttendance(db, ["EVENT-1"], "QA001", now().getTime() - 16 * 60 * 1000);
  store.listSignatureFilesByRequest = async () => [{ id: "PRIVATE_FILE_1" }];
  const query = { eventId: "EVENT-1", staffId: "QA001" };
  assert.equal((await call("training-attendance-recovery-candidates", { token: "staff" })).statusCode, 403);
  assert.deepEqual((await call("training-attendance-recovery-candidates")).body.items.map((item) => item.eventId), ["EVENT-1"]);
  assert.equal((await call("training-attendance-recovery-check", { token: "staff", query })).statusCode, 403);
  const checked = await call("training-attendance-recovery-check", { query });
  assert.deepEqual([checked.statusCode, checked.body.status, checked.body.orphanFileCount], [200, "retryable", 1]);
  const applied = await call("training-attendance-recovery-apply", { method: "POST", body: query });
  assert.deepEqual([applied.statusCode, applied.body.status], [200, "retryable"]);
  assert.equal((await reservation.refs[0].get()).data().state, "failed");
  assert.deepEqual((await reservation.refs[0].get()).data().orphanFileIds, ["PRIVATE_FILE_1"]);
  await reserveAttendance(db, ["EVENT-1"], "QA001", now().getTime());
});

test("stale pending with exactly one active Sheet row becomes completed", async () => {
  const { call, db, store } = harness();
  const reservation = await reserveAttendance(db, ["EVENT-1"], "QA001", now().getTime() - 16 * 60 * 1000);
  store.values.signatures.push(row(SIGNATURE_HEADERS, { signatureId: "SIG-1", eventId: "EVENT-1", "교직원ID": "QA001", "상태": "완료", "취소여부": "N" }));
  const applied = await call("training-attendance-recovery-apply", { method: "POST", body: { eventId: "EVENT-1", staffId: "QA001" } });
  assert.deepEqual([applied.statusCode, applied.body.status], [200, "completed"]);
  assert.deepEqual((await reservation.refs[0].get()).data().signatureIds, ["SIG-1"]);
});

test("duplicate or partially recorded group stays in manual review", async () => {
  const duplicated = harness();
  await reserveAttendance(duplicated.db, ["EVENT-1"], "QA001", now().getTime() - 16 * 60 * 1000);
  duplicated.store.values.signatures.push(row(SIGNATURE_HEADERS, { signatureId: "SIG-1", eventId: "EVENT-1", "교직원ID": "QA001", "상태": "완료" }));
  duplicated.store.values.signatures.push(row(SIGNATURE_HEADERS, { signatureId: "SIG-2", eventId: "EVENT-1", "교직원ID": "QA001", "상태": "완료" }));
  const query = { eventId: "EVENT-1", staffId: "QA001" };
  assert.equal((await duplicated.call("training-attendance-recovery-check", { query })).body.status, "manual-review-required");
  assert.equal((await duplicated.call("training-attendance-recovery-apply", { method: "POST", body: query })).statusCode, 409);
  const grouped = harness();
  await reserveAttendance(grouped.db, ["EVENT-1", "EVENT-2"], "QA001", now().getTime() - 16 * 60 * 1000);
  grouped.store.values.signatures.push(row(SIGNATURE_HEADERS, { signatureId: "SIG-3", eventId: "EVENT-1", "교직원ID": "QA001", "상태": "완료" }));
  assert.equal((await grouped.call("training-attendance-recovery-check", { query })).body.status, "manual-review-required");
  assert.equal((await grouped.call("training-attendance-recovery-apply", { method: "POST", body: query })).statusCode, 409);
});

test("a fully recorded group is reconciled together, while a public orphan is blocked", async () => {
  const grouped = harness();
  const reservation = await reserveAttendance(grouped.db, ["EVENT-1", "EVENT-2"], "QA001", now().getTime() - 16 * 60 * 1000);
  for (const [index, eventId] of ["EVENT-1", "EVENT-2"].entries()) {
    grouped.store.values.signatures.push(row(SIGNATURE_HEADERS, { signatureId: `SIG-${index}`, eventId, "교직원ID": "QA001", "상태": "완료" }));
  }
  const query = { eventId: "EVENT-1", staffId: "QA001" };
  assert.equal((await grouped.call("training-attendance-recovery-apply", { method: "POST", body: query })).body.status, "completed");
  assert.equal((await reservation.refs[0].get()).data().state, "completed");
  assert.equal((await reservation.refs[1].get()).data().state, "completed");
  assert.deepEqual((await reservation.refs[0].get()).data().signatureIds, ["SIG-0"]);
  assert.deepEqual((await reservation.refs[1].get()).data().signatureIds, ["SIG-1"]);
  const exposed = harness();
  await reserveAttendance(exposed.db, ["EVENT-1"], "QA001", now().getTime() - 16 * 60 * 1000);
  exposed.store.listSignatureFilesByRequest = async () => [{ id: "FILE123", private: false }];
  assert.equal((await exposed.call("training-attendance-recovery-check", { query })).body.status, "manual-review-required");
  assert.equal((await exposed.call("training-attendance-recovery-apply", { method: "POST", body: query })).statusCode, 409);
});

test("a stale request that entered Sheet append cannot be unlocked from a zero-row read", async () => {
  const { call, db } = harness();
  const started = now().getTime() - 17 * 60 * 1000;
  const reservation = await reserveAttendance(db, ["EVENT-1"], "QA001", started);
  await markAttendanceAppendStarted(reservation, started + 60 * 1000);
  const query = { eventId: "EVENT-1", staffId: "QA001" };
  assert.equal((await call("training-attendance-recovery-check", { query })).body.status, "manual-review-required");
  assert.equal((await call("training-attendance-recovery-apply", { method: "POST", body: query })).statusCode, 409);
  assert.equal((await reservation.refs[0].get()).data().state, "pending");
});

test("administrator-reviewed release of an uncertain zero-row append requires age and reason", async () => {
  const { call, db } = harness();
  const started = now().getTime() - 32 * 60 * 1000;
  const reservation = await reserveAttendance(db, ["EVENT-1"], "QA001", started);
  await markAttendanceAppendStarted(reservation, started + 60 * 1000);
  const body = { eventId: "EVENT-1", staffId: "QA001" };
  const checked = await call("training-attendance-recovery-check", { query: body });
  assert.deepEqual([checked.body.status, checked.body.canReviewedRetry], ["manual-review-required", true]);
  assert.equal((await call("training-attendance-recovery-apply", { method: "POST", body })).statusCode, 409);
  const applied = await call("training-attendance-recovery-apply", { method: "POST", body: {
    ...body, confirmedNoInflight: true, reason: "함수 종료와 Sheet 반영 여부 확인",
  } });
  assert.deepEqual([applied.statusCode, applied.body.status, applied.body.reviewedRelease], [200, "retryable", true]);
  assert.equal((await reservation.refs[0].get()).data().state, "failed");
});

test("fresh and completed reservations cannot be recovered", async () => {
  const fresh = harness();
  await reserveAttendance(fresh.db, ["EVENT-1"], "QA001", now().getTime() - 60 * 1000);
  const query = { eventId: "EVENT-1", staffId: "QA001" };
  assert.equal((await fresh.call("training-attendance-recovery-check", { query })).body.status, "not-stale");
  assert.equal((await fresh.call("training-attendance-recovery-apply", { method: "POST", body: query })).statusCode, 409);
  const done = harness();
  const reservation = await reserveAttendance(done.db, ["EVENT-1"], "QA001", now().getTime() - 16 * 60 * 1000);
  await finishAttendance(reservation, "completed");
  assert.equal((await done.call("training-attendance-recovery-check", { query })).body.status, "not-pending");
  assert.equal((await done.call("training-attendance-recovery-apply", { method: "POST", body: query })).statusCode, 409);
});

test("TrainingCenterStore delegates private signature storage to the provider adapter", async () => {
  const requestId = "7b377431-4dc3-4bac-acf0-cbe7c8ea3346";
  const calls = [];
  const storage = {
    configured: true,
    healthCheck: async () => ({ bucketReady: true, readReady: true, writeReady: null }),
    saveSignature: async (input) => { calls.push(["save", input]); return "training-signatures/2026/requests/" + requestId + ".png"; },
    readSignature: async (storageKey) => { calls.push(["read", storageKey]); return inkPng(); },
    findByRequestId: async (id) => { calls.push(["find", id]); return [{ id: "training-signatures/2026/requests/" + id + ".png", private: true }]; },
  };
  const store = new TrainingCenterStore({ storage });
  assert.deepEqual(await store.inspectSignatureStorage(), { bucketReady: true, readReady: true, writeReady: null });
  assert.equal(await store.uploadSignature(inkPng(), "EVENT-1", now(), requestId), "training-signatures/2026/requests/" + requestId + ".png");
  assert.equal((await store.downloadSignature("training-signatures/2026/requests/" + requestId + ".png")).length > 100, true);
  assert.equal((await store.listSignatureFilesByRequest(requestId))[0].private, true);
  assert.deepEqual(calls.map(([action]) => action), ["save", "read", "find"]);
});
test("short QR secret and missing signature storage fail as configuration errors", async () => {
  const short = harness({ secret: "short" });
  assert.equal((await short.call("training-qr", { query: { eventId: "EVENT-1" } })).statusCode, 503);
  const missing = harness();
  missing.store.assertSignatureStorageConfigured = () => { throw new TrainingSourceNotReadyError(); };
  assert.equal((await missing.call("training-qr", { query: { eventId: "EVENT-1" } })).statusCode, 503);
});

test("Sheet append uncertainty keeps the lock pending; committed response reconciles", async () => {
  const challenge = issueQrChallenge({ eventId: "EVENT-1", secret, now: now().getTime() });
  const body = { eventId: "EVENT-1", challenge, signature: `data:image/png;base64,${inkPng().toString("base64")}` };
  const before = harness({ appendMode: "before" });
  assert.equal((await before.call("training-attendance-submit", { token: "staff", method: "POST", body })).statusCode, 503);
  assert.equal([...before.db.records.values()].some((item) => item.state === "pending" && item.appendStartedAt && item.uploadedFileId === "PRIVATE_FILE_1"), true);
  assert.equal(before.store.values.signatures.length, 1);
  assert.equal((await before.call("training-attendance-submit", { token: "staff", method: "POST", body })).statusCode, 409);
  const after = harness({ appendMode: "after" });
  assert.equal((await after.call("training-attendance-submit", { token: "staff", method: "POST", body })).statusCode, 200);
  assert.equal(after.store.values.signatures.length, 2);
});

test("storage response loss with unknown key remains searchable after a retry", async () => {
  const { call, db, store } = harness();
  const failedRequestIds = [];
  store.uploadSignature = async (_bytes, _eventId, _now, requestId) => { failedRequestIds.push(requestId); throw new Error("simulated storage response loss"); };
  const challenge = issueQrChallenge({ eventId: "EVENT-1", secret, now: now().getTime() });
  const body = { eventId: "EVENT-1", challenge, signature: `data:image/png;base64,${inkPng().toString("base64")}` };
  assert.equal((await call("training-attendance-submit", { token: "staff", method: "POST", body })).statusCode, 503);
  store.listSignatureFilesByRequest = async (requestId) => requestId === failedRequestIds[0] ? [{ id: "PRIVATE_FILE_2", private: true }] : [];
  const query = { eventId: "EVENT-1", staffId: "QA001" };
  assert.equal((await call("training-attendance-recovery-check", { query })).body.status, "orphan-candidate");
  const retry = await reserveAttendance(db, ["EVENT-1"], "QA001", now().getTime() - 16 * 60 * 1000);
  assert.equal((await retry.refs[0].get()).data().orphanAttempts[0].requestId, failedRequestIds[0]);
  const checked = await call("training-attendance-recovery-check", { query });
  assert.deepEqual(checked.body.orphanFiles, [{ fileId: "PRIVATE_FILE_2", private: true }]);
});

test("administrator correction also preserves an uncertain Sheet append", async () => {
  const { call, db } = harness({ appendMode: "before" });
  const result = await call("training-attendance-correct", { method: "POST", body: {
    eventId: "EVENT-1", staffId: "QA001", action: "mark-attended", reason: "현장 확인",
  } });
  assert.equal(result.statusCode, 503);
  assert.equal([...db.records.values()].some((item) => item.state === "pending" && item.appendStartedAt), true);
});

test("admin cancellation cannot rewrite a Sheet row while recovery owns a pending lock", async () => {
  const { call, db, store } = harness();
  await reserveAttendance(db, ["EVENT-1"], "QA001", now().getTime() - 16 * 60 * 1000);
  store.values.signatures.push(row(SIGNATURE_HEADERS, { signatureId: "SIG-1", eventId: "EVENT-1", "교직원ID": "QA001", "상태": "완료" }));
  const result = await call("training-attendance-correct", { method: "POST", body: {
    eventId: "EVENT-1", staffId: "QA001", action: "cancel", reason: "관리자 확인",
  } });
  assert.equal(result.statusCode, 409);
  assert.equal(store.calls.saved, 0);
});

test("final roster model and template XLSX keep the correct active image and omit excluded people", async () => {
  const parsed = parseTrainingSource(source());
  parsed.signatures.push({ signatureId: "SIG-1", eventId: "EVENT-1", eventGroupId: "GROUP-1", "교직원ID": "QA001", "서명일시": now().toISOString(), "출석방식": "qr", "서명파일ID": "PRIVATE_FILE_1", "상태": "완료", "취소여부": "N" });
  parsed.targets.find((item) => item.eventId === "EVENT-1" && item["교직원ID"] === "QA002")["제외여부"] = "Y";
  const model = finalSheetModel(parsed, directory, "EVENT-1");
  assert.deepEqual(model.counts, { target: 1, signed: 1, excluded: 1 });
  const bytes = await makeTrainingRosterXlsx(model, { readSignature: async () => inkPng() });
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  assert.equal(book.worksheets[0].getCell("B4").value, "교사");
  assert.equal(book.worksheets[0].getCell("C4").value, "테스트 교직원");
  assert.equal(book.worksheets[0].getCell("E4").value, "10.6.(화)");
  assert.equal(book.worksheets[0].getCell("C5").value, null);
  assert.equal(book.worksheets[0].getImages().length, 1);
});

test("administrator PDF download uses the final model and server-side renderer", async () => {
  let rendered;
  const { call } = harness({ rosterPdf: { render: async (input) => { rendered = input; return Buffer.from("%PDF-test"); } } });
  const result = await call("training-final-sheet", { query: { eventId: "EVENT-1", download: "pdf" } });
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers["Content-Type"], "application/pdf");
  assert.match(result.headers["Content-Disposition"], /training-roster\.pdf/);
  assert.equal(result.bytes.toString(), "%PDF-test");
  assert.match(rendered.filename, /연수등록부\.pdf$/);
  assert.deepEqual(rendered.model.rows.map((row) => row.name).sort(), ["다른 교직원", "테스트 교직원"].sort());
  assert.equal(typeof rendered.readSignature, "function");
});

test("admin correction preserves the cancelled row and records the reason and actor", async () => {
  const { call, store } = harness();
  const challenge = issueQrChallenge({ eventId: "EVENT-1", secret, now: now().getTime() });
  const body = { eventId: "EVENT-1", challenge, signature: `data:image/png;base64,${inkPng().toString("base64")}` };
  assert.equal((await call("training-attendance-submit", { token: "staff", method: "POST", body })).statusCode, 200);
  const cancel = await call("training-attendance-correct", { method: "POST", body: { eventId: "EVENT-1", staffId: "QA001", action: "cancel", reason: "서명 확인 오류" } });
  assert.equal(cancel.statusCode, 200);
  assert.equal(store.values.signatures.length, 2);
  assert.equal(store.values.signatures[1][SIGNATURE_HEADERS.indexOf("취소여부")], "Y");
  assert.equal(store.values.signatures[1][SIGNATURE_HEADERS.indexOf("취소사유")], "서명 확인 오류");
  assert.equal(store.values.signatures[1][SIGNATURE_HEADERS.indexOf("정정자")], "QA001");
  const corrected = await call("training-attendance-correct", { method: "POST", body: { eventId: "EVENT-1", staffId: "QA001", action: "mark-attended", reason: "관리자 출석 확인" } });
  assert.equal(corrected.statusCode, 200);
  assert.equal(store.values.signatures.length, 3);
  assert.equal(store.values.signatures[2][SIGNATURE_HEADERS.indexOf("출석방식")], "correction");
});

test("existing staff-directory router preserves admin-only default and dispatches Phase 2", async () => {
  const { handler } = harness();
  const res = response();
  await staffDirectoryHandler({ method: "GET", query: { resource: "training-admin-list" }, headers: { authorization: "Bearer staff" } }, res, { trainingPhase2Handler: handler });
  assert.equal(res.statusCode, 403);
});

test("runtime preflight is admin-only, GET-only, redacted, and write-free", async () => {
  const { call, store, db } = harness();
  assert.equal((await call("training-runtime-preflight", { token: "" })).statusCode, 401);
  assert.equal((await call("training-runtime-preflight", { token: "staff" })).statusCode, 403);
  assert.equal((await call("training-runtime-preflight", { token: "homeroom" })).statusCode, 403);
  assert.equal((await call("training-runtime-preflight", { method: "POST" })).statusCode, 405);
  for (const token of ["admin", "admin2"]) {
    const res = await call("training-runtime-preflight", { token });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["Cache-Control"], "private, no-store");
    assert.equal(res.body.ok, true);
    assert.equal(Object.values(res.body.checks).every(Boolean), true);
    assert.deepEqual(Object.keys(res.body.checks), ["qrSecretConfigured", "qrSecretValid", "signatureStorageConfigured",
      "signatureStorageBucketReady", "signatureStorageReadReady",
      "signatureSheetReady", "firebaseAdminReady"]);
    assert.equal(JSON.stringify(res.body).includes(secret), false);
    assert.equal(JSON.stringify(res.body).includes("FIREBASE_SERVICE_ACCOUNT"), false);
  }
  assert.deepEqual(store.calls, { uploads: 0, appended: 0, saved: 0 });
  assert.equal(db.records.size, 0);
});

test("runtime preflight reports invalid config and source without exposing values", async () => {
  const short = await harness({ secret: "짧음" }).call("training-runtime-preflight");
  assert.equal(short.body.checks.qrSecretConfigured, true);
  assert.equal(short.body.checks.qrSecretValid, false);
  assert.equal(short.body.ok, false);
  const missing = harness();
  missing.store.signatureStorageConfigured = false;
  const noStorage = await missing.call("training-runtime-preflight");
  assert.equal(noStorage.body.checks.signatureStorageConfigured, false);
  assert.equal(noStorage.body.checks.signatureStorageBucketReady, false);
  const inaccessible = harness();
  inaccessible.store.inspectSignatureStorage = async () => ({ bucketReady: false, readReady: false, writeReady: null });
  assert.equal((await inaccessible.call("training-runtime-preflight")).body.checks.signatureStorageBucketReady, false);
  const badSheet = harness();
  badSheet.store.isSignatureSheetReady = async () => false;
  assert.equal((await badSheet.call("training-runtime-preflight")).body.checks.signatureSheetReady, false);
});

test("failed attendance stores stage only and logs a redacted storage category", async () => {
  const { call, db, store } = harness();
  const sensitive = "DO_NOT_LOG_SECRET_OR_SIGNATURE";
  store.uploadSignature = async () => {
    const error = new SignatureStorageError("SIGNATURE_STORAGE_SAVE", { code: "SAVE_FAILED" });
    error.message = sensitive;
    throw error;
  };
  const challenge = issueQrChallenge({ eventId: "EVENT-1", secret, now: now().getTime() });
  const originalError = console.error;
  const logs = [];
  console.error = (value) => logs.push(value);
  let result;
  try {
    result = await call("training-attendance-submit", { token: "staff", method: "POST",
      body: { eventId: "EVENT-1", challenge, signature: `data:image/png;base64,${inkPng().toString("base64")}` } });
  } finally { console.error = originalError; }
  assert.equal(result.statusCode, 503);
  assert.equal(JSON.stringify(result.body).includes(sensitive), false);
  assert.equal(logs.length, 1);
  assert.deepEqual(JSON.parse(logs[0]), { event: "training_attendance_failure", stage: "SIGNATURE_STORAGE_SAVE",
    status: 0, code: "SAVE_FAILED", errorName: "SignatureStorageError", eventCount: 1 });
  assert.equal(logs[0].includes(sensitive), false);
  assert.equal(logs[0].includes("QA001"), false);
  const [lock] = db.records.values();
  assert.equal(lock.state, "failed");
  assert.equal(lock.failureCategory, "SIGNATURE_STORAGE_SAVE");
  assert.equal(JSON.stringify(lock).includes(sensitive), false);
  assert.equal(store.values.signatures.length, 1);
});

test("runtime signature Sheet requires a hidden tab and exact A:M headers", () => {
  const hidden = [{ properties: { title: "교직원교육전자서명", hidden: true } }];
  assert.equal(hasSignatureSheetSchema(hidden, [SIGNATURE_HEADERS]), true);
  assert.equal(hasSignatureSheetSchema(hidden, [[...SIGNATURE_HEADERS.slice(0, 12), "wrong"]]), false);
  assert.equal(hasSignatureSheetSchema([{ properties: { title: "교직원교육전자서명", hidden: false } }], [SIGNATURE_HEADERS]), false);
  assert.equal(hasSignatureSheetSchema([], [SIGNATURE_HEADERS]), false);
});
