import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { PRODUCTION_FIREBASE_PROJECT_ID as PROD } from "../../common/firebaseEnvironment.js";

// Replace SDK and application singleton imports, never initialize a real SDK.
const mockSource = `
const state = globalThis.__submissionContractMock;
export const db = state.db;
export const auth = {currentUser: {getIdToken: async () => "mock"}};
export const collection = (db, name) => ({name});
export const doc = (db, name, id) => ({name, id});
export const serverTimestamp = () => "mock-timestamp";
export const setDoc = async (ref, data) => state.records.set(ref.name + "/" + ref.id, data);
export const getDoc = async (ref) => ({exists: () => state.records.has(ref.name + "/" + ref.id), data: () => state.records.get(ref.name + "/" + ref.id)});
export const where = (...args) => args;
export const query = (ref) => ref;
export const getDocs = async (ref) => ({docs: [...state.records].filter(([key]) => key.startsWith(ref.name + "/")).map(([key, value]) => ({id: key.split("/")[1], data: () => value}))});
`;
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "firebase/firestore" || (specifier === "./firebase.js" && context.parentURL.includes("/src/lib/"))) {
    return { url: `data:text/javascript,${encodeURIComponent(mockSource)}`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
} });
const state = { db: { app: { options: { projectId: "isolated-health-qa" } } }, records: new Map() };
globalThis.__submissionContractMock = state;
const { createCprSubmission, createTbSubmission } = await import("./staffSubmissions.js");
const { getStaffSubmissionTaskStatus } = await import("./staffSubmissionStatus.js");
hooks.deregister();

test("real browser submission functions and status reader share QA contracts; production TB stays server owned", async () => {
  const previous = { fetch: globalThis.fetch, window: globalThis.window, FileReader: globalThis.FileReader };
  let apiCalls = 0, lastPayload;
  globalThis.window = { setTimeout, clearTimeout };
  globalThis.FileReader = class { readAsDataURL() { this.result = "data:application/pdf;base64,TU9DSw=="; this.onload(); } };
  globalThis.fetch = async (_url, options) => {
    apiCalls++; lastPayload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ success: true, receiptSaved: true, statusSynced: true, staffId: "T001", submissionId: "mock-tb-receipt" }) };
  };
  const qa = { environment: "qa", qaProjectId: "isolated-health-qa" };
  const input = { user: { uid: "staff", email: "staff@example.invalid" }, staffType: "staff", file: { name: "mock.pdf", size: 4, type: "application/pdf" } };
  try {
    globalThis.__FIREBASE_RUNTIME_POLICY__ = qa;
    const cpr = await createCprSubmission({ ...input, trainingDate: "2026-10-01", institution: "mock" });
    assert.equal(cpr.receiptSaved, true);
    assert.equal(state.records.size, 0, "browser does not duplicate server-owned originals");
    state.records.set("staff_submission_status_qa/T001_cpr-training-2026", { staffId: "T001", taskId: "cpr-training-2026", status: "pending" });
    assert.equal(await getStaffSubmissionTaskStatus("T001", "cpr-training-2026"), "pending");
    await createTbSubmission({ ...input, checkupDate: "2026-10-01", documentType: "mock", schoolYear: 2027 });
    assert.equal(state.records.has("staff_submissions/mock-tb-receipt"), false);
    assert.equal(lastPayload.schoolYear, 2027);
    const before = apiCalls;
    state.db.app.options.projectId = PROD;
    await assert.rejects(createCprSubmission(input));
    await assert.rejects(createTbSubmission(input));
    assert.equal(apiCalls, before);
    state.records.clear();
    globalThis.__FIREBASE_RUNTIME_POLICY__ = { environment: "production" };
    await createTbSubmission({ ...input, checkupDate: "2026-10-01", documentType: "mock" });
    assert.equal(state.records.size, 0, "production receipt is still written only by server");
  } finally {
    Object.assign(globalThis, previous);
    delete globalThis.__FIREBASE_RUNTIME_POLICY__;
    delete globalThis.__submissionContractMock;
  }
});

test("browser partial-success retry sends receipt ID without file bytes or another client original", async () => {
  const previous = { fetch: globalThis.fetch, window: globalThis.window, FileReader: globalThis.FileReader };
  globalThis.window = { setTimeout, clearTimeout };
  globalThis.FileReader = class { readAsDataURL() { this.result = "data:application/pdf;base64,TU9DSw=="; this.onload(); } };
  globalThis.__FIREBASE_RUNTIME_POLICY__ = { environment: "qa", qaProjectId: "isolated-health-qa" };
  state.db.app.options.projectId = "isolated-health-qa";
  const inputs = [];
  globalThis.fetch = async (_url, init) => {
    inputs.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ status: "success", receiptSaved: true, statusSynced: inputs.length > 1,
      syncPending: inputs.length === 1, submissionId: "cpr-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", staffId: "T001" }) };
  };
  const input = { user: { uid: "staff", email: "staff@example.invalid" }, trainingDate: "2026-10-03", institution: "partial", staffType: "staff",
    file: { name: "mock.pdf", size: 4, type: "application/pdf" } };
  try {
    const first = await createCprSubmission(input); assert.equal(first.syncPending, true);
    const second = await createCprSubmission(input); assert.equal(second.statusSynced, true);
    assert.ok(inputs[0].fileBase64); assert.equal(inputs[1].fileBase64, undefined);
    assert.equal(inputs[1].resumeReceiptId, first.id);
  } finally {
    Object.assign(globalThis, previous); delete globalThis.__FIREBASE_RUNTIME_POLICY__;
  }
});
