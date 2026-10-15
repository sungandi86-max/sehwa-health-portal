import test from "node:test";
import assert from "node:assert/strict";
import { handleQaTbCertificateLogin } from "../../api/firebase/staff-directory.js";
import { handleTbScreeningWorkflowRequest } from "./tbScreeningWorkflowApi.js";
import { verifyCurrentStaffSubmissionIdentity } from "./tbSubmissionGuard.js";
import { verifyQaTbProxyAdmin } from "./qaTbSubmissionAuth.js";
import { QA_TB_CERTIFICATE_UID, QA_TB_CERTIFICATE_STAFF_ID, QA_TB_CERTIFICATE_ROLE,
  QA_TB_CERTIFICATE_EMAIL } from "./qaTbCertificateSynthetic.js";

const context = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" };
const synthetic = { uid: QA_TB_CERTIFICATE_UID, staffId: QA_TB_CERTIFICATE_STAFF_ID, active: false,
  qaOnly: true, environment: "qa", roles: [QA_TB_CERTIFICATE_ROLE], schoolYear: 2026, semester: 2,
  qaExpiresAt: "2099-01-01T00:00:00Z" };
const response = () => ({ setHeader() {}, status(code) { this.code = code; return this; },
  json(value) { this.value = value; return this; } });
function fixture(assignment = synthetic, uid = assignment.uid) {
  const reads = [];
  const db = { collection(name) {
    reads.push(name);
    assert.equal(name, "user_assignments_qa", "access/login must not read datasets or Production assignments");
    return { doc: () => ({ get: async () => ({ exists: true, data: () => assignment }) }) };
  } };
  const authOptions = { auth: () => ({ verifyIdToken: async () => ({ uid }) }), database: () => db };
  const authAccess = (req, options) => verifyCurrentStaffSubmissionIdentity(req, { ...options, ...authOptions });
  return { reads, db, authOptions, authAccess };
}
const getRequest = (query = {}) => ({ method: "GET", headers: { authorization: "Bearer synthetic" },
  query: { schoolYear: 2026, accessOnly: "true", ...query } });

test("synthetic access-only GET returns verified inactive identity without dataset or profile reads", async () => {
  const f = fixture();
  const res = response();
  await handleTbScreeningWorkflowRequest(getRequest(), res, { context, authAccess: f.authAccess,
    directory: async () => { throw new Error("fixed synthetic identity must not read roster"); } });
  assert.equal(res.code, 200);
  assert.equal(res.value.access.authorized, true);
  assert.equal(res.value.access.qaTbCertificateSynthetic, true);
  assert.equal(res.value.access.assignment.active, false);
  assert.equal(res.value.access.assignment.staffId, QA_TB_CERTIFICATE_STAFF_ID);
  assert.deepEqual(res.value.access.assignment.roles, [QA_TB_CERTIFICATE_ROLE]);
  assert.equal(res.value.access.staffType, "교직원");
  assert.equal(res.value.access.identity.name, "[QA-TB-CERT-TEST]");
  assert.deepEqual(f.reads, ["user_assignments_qa"]);
  assert.equal(res.value.item, undefined);
});

test("ordinary QA staff access uses canonical roster identity and keeps active status", async () => {
  const f = fixture({ uid: "qa-staff", staffId: "QA-STAFF", active: true, roles: ["staff"] });
  const res = response();
  await handleTbScreeningWorkflowRequest(getRequest(), res, { context, authAccess: f.authAccess,
    directory: async () => ({ directory: [{ staffId: "QA-STAFF", name: "Fixture", department: "QA", position: "교사", employmentStatus: "재직" }] }) });
  assert.equal(res.code, 200);
  assert.equal(res.value.access.assignment.active, true);
  assert.equal(res.value.access.qaTbCertificateSynthetic, false);
  assert.equal(res.value.access.identity.name, "Fixture");
  assert.equal(res.value.access.staffType, "");
});

test("expired changed-role and active synthetic assignments fail access-only server verification", async () => {
  for (const change of [{ qaExpiresAt: "2000-01-01" }, { roles: ["staff"] }, { active: true }, { staffId: "foreign" }]) {
    const f = fixture({ ...synthetic, ...change });
    const res = response();
    await handleTbScreeningWorkflowRequest(getRequest(), res, { context, authAccess: f.authAccess });
    assert.equal(res.code, 403);
    assert.equal(res.value.access, undefined);
  }
});

test("access-only GET denies Production and unknown deployment before auth", async () => {
  for (const deployment of [{ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }, {}]) {
    const res = response();
    await handleTbScreeningWorkflowRequest(getRequest(), res, { context: deployment,
      authAccess: async () => { throw new Error("must not authenticate"); } });
    assert.equal(res.code, 503);
  }
});

test("access-only GET rejects foreign subjects missing authentication and invalid scope flags", async () => {
  const f = fixture();
  for (const query of [{ staffId: "foreign" }, { accessOnly: "false" }, { schoolYear: 2027 }]) {
    const res = response();
    await handleTbScreeningWorkflowRequest(getRequest(query), res, { context, authAccess: f.authAccess });
    assert.equal(res.code, query.staffId ? 403 : 400);
  }
  const res = response();
  await handleTbScreeningWorkflowRequest({ ...getRequest(), headers: {} }, res, { context, authAccess: f.authAccess });
  assert.equal(res.code, 401);
});

test("QA synthetic login authenticates a QA-only administrator before reading existing fixture", async () => {
  const administrator = { uid: "qa-admin", staffId: "QA-ADMIN", active: true, roles: ["health_teacher"] };
  const f = fixture(administrator);
  const res = response();
  const db = { collection(name) {
    assert.equal(name, "user_assignments_qa");
    return { doc: () => ({ get: async () => ({ exists: true, data: () => synthetic }) }) };
  } };
  await handleQaTbCertificateLogin({ method: "POST", headers: { authorization: "Bearer admin" } }, res, { context,
    verifyAdmin: async (req, options) => {
      assert.equal(options.workflowEnvironment, "qa");
      assert.equal(options.schoolYear, 2026);
      const access = await verifyQaTbProxyAdmin(req, { ...options, ...f.authOptions });
      return { ...access, db };
    }, getAuth: () => ({ getUser: async () => ({ email: QA_TB_CERTIFICATE_EMAIL, disabled: false }),
      createCustomToken: async (uid) => { assert.equal(uid, QA_TB_CERTIFICATE_UID); return "fixture-token"; },
      createUser: async () => { throw new Error("must not create Auth fixtures"); } }),
  });
  assert.equal(res.code, 200);
  assert.equal(res.value.customToken, "fixture-token");
  assert.deepEqual(f.reads, ["user_assignments_qa"]);
});

test("missing synthetic Auth fixture denies login without creating an Auth user", async () => {
  const f = fixture();
  let creates = 0;
  const res = response();
  await handleQaTbCertificateLogin({ method: "POST" }, res, { context,
    verifyAdmin: async () => ({ ok: true, db: f.db }), getAuth: () => ({
      getUser: async () => { throw Object.assign(new Error("missing fixture"), { code: "auth/user-not-found" }); },
      createUser: async () => { creates++; return { email: QA_TB_CERTIFICATE_EMAIL, disabled: false }; },
      createCustomToken: async () => "unexpected-token",
    }),
  });
  assert.equal(res.code, 409);
  assert.equal(creates, 0);
});
