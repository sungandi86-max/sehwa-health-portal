import assert from "node:assert/strict";
import test from "node:test";
import submitHandler from "../../api/submit.js";
import { handleQaInbodyLogin } from "../../api/firebase/staff-directory.js";
import adminHandler from "../../api/health-room-status.js";
import { InbodyRequestStore } from "./inbodyRequestStore.js";
import { verifyCurrentStaffSubmissionIdentity } from "./tbSubmissionGuard.js";
import { SUBMISSION_WORKFLOWS } from "./submissionWorkflows.js";
import { isQaInbodyAssignment, isQaInbodyUid, QA_INBODY_EMAIL,
  QA_INBODY_ROLE, QA_INBODY_STAFF_ID, QA_INBODY_UID } from "./qaInbodySynthetic.js";

const qa = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" };
const production = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" };
const assignment = { uid: QA_INBODY_UID, staffId: QA_INBODY_STAFF_ID, active: false,
  qaOnly: true, environment: "qa", roles: [QA_INBODY_ROLE], schoolYear: 2026, semester: 2,
  qaExpiresAt: "2099-01-01T00:00:00.000Z" };
const roster = [{ staffId: QA_INBODY_STAFF_ID, name: "[QA-INBODY-TEST]",
  department: "QA 전용", employmentStatus: "재직", position: "QA 테스트" }];

function response() {
  return { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; },
    end() { return this; } };
}

function database(data = assignment) {
  return { collection(name) { assert.equal(name, "user_assignments"); return {
    doc() { return { get: async () => ({ exists: true, data: () => data }) }; },
  }; } };
}

function guard(context, data = assignment, allowQaInbodySynthetic = true, uid = QA_INBODY_UID) {
  return verifyCurrentStaffSubmissionIdentity({ headers: { authorization: "Bearer synthetic" } }, {
    allowQaInbodySynthetic, context,
    auth: () => ({ verifyIdToken: async () => ({ uid }) }),
    database: () => database(data), directory: async () => ({ directory: roster }),
  });
}

test("synthetic UID requires fixed QA, inactive QA-only role and exact assignment", async () => {
  assert.equal(isQaInbodyUid(QA_INBODY_UID), true);
  assert.equal(isQaInbodyAssignment(QA_INBODY_UID, assignment, qa), true);
  for (const context of [production, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature" }]) {
    assert.equal(isQaInbodyAssignment(QA_INBODY_UID, assignment, context), false);
    assert.equal((await guard(context)).status, 403);
  }
  for (const change of [{ roles: ["staff"] }, { active: true }, { qaOnly: false },
    { environment: "production" }, { staffId: "T022" }, { uid: "other" },
    { qaExpiresAt: "2000-01-01T00:00:00.000Z" }]) {
    assert.equal((await guard(qa, { ...assignment, ...change })).status, 403);
  }
  assert.equal((await guard(qa, assignment, false)).status, 403);
  assert.equal((await guard(production, { ...assignment, uid: "other", active: true,
    roles: [QA_INBODY_ROLE, "staff"] }, false, "other")).status, 403);
});

test("QA synthetic may use only Inbody with canonical roster identity", async () => {
  const verified = await guard(qa);
  assert.equal(verified.ok, true);
  assert.equal(verified.staffId, QA_INBODY_STAFF_ID);
  assert.deepEqual(verified.roles, [QA_INBODY_ROLE]);
  assert.equal(verified.identity.name, roster[0].name);
  for (const type of ["cpr", "tb", "tb_registration"]) {
    assert.equal(SUBMISSION_WORKFLOWS[type].allowedRoles.includes(QA_INBODY_ROLE), false);
  }
});

test("QA Inbody writes Firestore using roster identity, not client-supplied name", async () => {
  let saved;
  const store = new InbodyRequestStore({ context: () => qa, requestId: () => "QA-INBODY-UI-001",
    database: () => ({ collection: (name) => { assert.equal(name, "inbody_requests_qa"); return {
      doc: () => ({ create: async (request) => { saved = request; } }),
    }; } }) });
  const payload = { type: "inbody", fields: { name: "SPOOF", dept: "SPOOF",
    preferredDate: "2026-10-15", preferredTime: "오후1 (12:00~14:00)" } };
  const result = response();
  await submitHandler({ method: "POST", headers: { "content-type": "application/json" },
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(payload)); } }, result,
  { verifyStaff: async () => guard(qa), inbodyStore: store,
    postScript: async () => { throw new Error("Apps Script must not be called"); } });
  assert.equal(result.statusCode, 200);
  assert.equal(saved.staffId, QA_INBODY_STAFF_ID);
  assert.equal(saved.name, roster[0].name);
  assert.equal(saved.department, roster[0].department);
  assert.equal(saved.environment, "qa");
});

test("QA login mint is admin-gated; Production never creates Auth user or token", async () => {
  let authWrites = 0;
  const auth = { getUser: async () => { const error = new Error("missing"); error.code = "auth/user-not-found"; throw error; },
    createUser: async (data) => { authWrites += 1; assert.equal(data.uid, QA_INBODY_UID);
      return { email: QA_INBODY_EMAIL, disabled: false }; },
    createCustomToken: async (uid) => { authWrites += 1; assert.equal(uid, QA_INBODY_UID); return "synthetic-token"; } };
  const options = { context: production, verifyAdmin: async () => { throw new Error("must not run"); },
    getAuth: () => auth };
  const denied = response();
  await handleQaInbodyLogin({ method: "POST" }, denied, options);
  assert.equal(denied.statusCode, 403);
  assert.equal(authWrites, 0);
  const accepted = response();
  await handleQaInbodyLogin({ method: "POST" }, accepted, {
    context: qa, verifyAdmin: async () => ({ ok: true, db: database() }),
    readDirectory: async () => ({ directory: roster }), getAuth: () => auth,
  });
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body.customToken, "synthetic-token");
  assert.equal(accepted.headers["Cache-Control"], "private, no-store");
  assert.equal(authWrites, 2);
});

test("QA admin response exposes only the latest synthetic request detail", async () => {
  const requests = [{ requestId: "QA-UI-001", staffId: QA_INBODY_STAFF_ID, sourceType: "portal",
    preferredDate: "2026-10-15", preferredTime: "오후1 (12:00~14:00)",
    status: "received", submittedAt: new Date().toISOString(), name: "[QA-INBODY-TEST]" }];
  const result = response();
  await adminHandler({ method: "POST", headers: { authorization: "Bearer admin", "content-type": "application/json" },
    body: { action: "getInbodyRequests" } }, result, {
    verifyAccess: async () => ({ ok: true, assignment: { active: true, roles: ["admin"] } }),
    inbodyStore: { backend: "firestore", listRequests: async () => requests },
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.qaSyntheticRequest.requestId, "QA-UI-001");
  assert.equal("name" in result.body.qaSyntheticRequest, false);
  assert.equal(result.body.totalCount, 1);
});
