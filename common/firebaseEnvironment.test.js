import test from "node:test";
import assert from "node:assert/strict";
import { firebaseRuntimePolicy, PRODUCTION_FIREBASE_PROJECT_ID as PROD } from "./firebaseEnvironment.js";
import { initializeFirebaseClient } from "../src/lib/firebaseInitialization.js";
import { initializeFirebaseAdmin, validatedAdminConfiguration } from "../server/lib/firebaseAdminInitialization.js";

const QA = "isolated-health-qa";
const account = (project = QA) => ({ type: "service_account", project_id: project,
  client_email: `mock@${project}.iam.gserviceaccount.com`, private_key: "MOCK-PRIVATE-KEY-SENTINEL" });
const context = (overrides = {}) => ({ APP_ENV: "qa", QA_FIREBASE_PROJECT_ID: QA,
  FIREBASE_PROJECT_ID: QA, FIREBASE_SERVICE_ACCOUNT_JSON: "MOCK-SECRET-SENTINEL", ...overrides });
const clientEnv = (overrides = {}) => ({ VITE_APP_ENV: "qa", VITE_FIREBASE_PROJECT_ID: QA,
  VITE_FIREBASE_AUTH_DOMAIN: `${QA}.firebaseapp.com`, VITE_FIREBASE_STORAGE_BUCKET: `${QA}.firebasestorage.app`,
  VITE_FIREBASE_API_KEY: "MOCK-API-KEY-SENTINEL", VITE_FIREBASE_APP_ID: "1:123:web:mock-app", VITE_FIREBASE_MESSAGING_SENDER_ID: "123", ...overrides });
function clientSdk(existing = []) {
  const calls = [];
  const sdk = { getApps: () => { calls.push("getApps"); return existing; }, getApp: () => existing[0],
    initializeApp: (options) => { calls.push("initializeApp"); const app = { options }; existing.push(app); return app; },
    getAuth: () => { calls.push("getAuth"); return {}; }, getFirestore: (app) => { calls.push("getFirestore"); return { app }; } };
  return { sdk, calls };
}
function adminSdk(existing = []) {
  const calls = [];
  const sdk = { getApps: () => { calls.push("getApps"); return existing; },
    cert: () => { calls.push("cert"); return {}; },
    initializeApp: (options) => { calls.push("initializeApp"); const app = { options }; existing.push(app); return app; } };
  return { sdk, calls };
}
function safeFailure(action) {
  assert.throws(action, (error) => {
    assert.equal(error.name, "FirebaseConfigurationError");
    assert.doesNotMatch(error.message, /SENTINEL|private_key|client_email|isolated-health|AIza|BEGIN|\{.*\}/);
    return true;
  });
}

test("server policy requires explicit QA/local; branches and client claims never grant QA", () => {
  for (const c of [{}, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" },
    { VITE_APP_ENV: "qa" }, { APP_ENV: "wrong" }, { APP_ENV: "qa", VERCEL_ENV: "production" },
    { APP_ENV: "production", VERCEL_ENV: "preview" }, { APP_ENV: "local", VERCEL_ENV: "preview" }]) {
    assert.equal(firebaseRuntimePolicy(c).environment, "unknown");
  }
  assert.equal(firebaseRuntimePolicy({ APP_ENV: "qa", VERCEL_GIT_COMMIT_REF: "feature/test" }).environment, "qa");
  assert.equal(firebaseRuntimePolicy({ VERCEL_ENV: "production" }).environment, "production");
  assert.equal(firebaseRuntimePolicy({ APP_ENV: "local" }).environment, "local");
});

test("valid explicit QA configuration initializes client and admin using the QA project", () => {
  const client = clientSdk();
  const result = initializeFirebaseClient({ policy: firebaseRuntimePolicy(context()), env: clientEnv(), sdk: client.sdk });
  assert.equal(result.app.options.projectId, QA);
  assert.equal(result.app.options.authDomain, `${QA}.firebaseapp.com`);
  assert.deepEqual(client.calls, ["getApps", "initializeApp", "getFirestore", "getAuth"]);
  const admin = adminSdk();
  const app = initializeFirebaseAdmin({ context: context(), readAccount: () => account(), sdk: admin.sdk });
  assert.equal(app.options.projectId, QA);
  assert.equal(initializeFirebaseAdmin({ context: context(), readAccount: () => account(), sdk: admin.sdk }), app);
  assert.equal(admin.calls.filter((x) => x === "initializeApp").length, 1);
});

for (const [name, policy, env] of [
  ["missing QA project", { environment: "qa" }, clientEnv()],
  ["production QA target", { environment: "qa", qaProjectId: PROD }, clientEnv({ VITE_FIREBASE_PROJECT_ID: PROD })],
  ["production actual project", firebaseRuntimePolicy(context()), clientEnv({ VITE_FIREBASE_PROJECT_ID: PROD })],
  ["mismatched actual project", firebaseRuntimePolicy(context()), clientEnv({ VITE_FIREBASE_PROJECT_ID: "different-health-qa" })],
  ["missing client project", firebaseRuntimePolicy(context()), clientEnv({ VITE_FIREBASE_PROJECT_ID: "" })],
  ["unknown environment", { environment: "unknown" }, clientEnv()],
  ["client-only environment", { environment: "unknown" }, clientEnv()],
  ["missing API configuration", firebaseRuntimePolicy(context()), clientEnv({ VITE_FIREBASE_API_KEY: "" })],
  ["production auth domain", firebaseRuntimePolicy(context()), clientEnv({ VITE_FIREBASE_AUTH_DOMAIN: `${PROD}.firebaseapp.com` })],
  ["production bucket", firebaseRuntimePolicy(context()), clientEnv({ VITE_FIREBASE_STORAGE_BUCKET: `${PROD}.firebasestorage.app` })],
  ["contradictory client claim", firebaseRuntimePolicy(context()), clientEnv({ VITE_APP_ENV: "production" })],
]) {
  test(`client blocks ${name} before ALL SDK calls without disclosing secrets`, () => {
    const { sdk, calls } = clientSdk();
    safeFailure(() => initializeFirebaseClient({ policy, env, sdk }));
    assert.deepEqual(calls, []);
  });
}

for (const [name, ctx, read] of [
  ["missing QA project", context({ QA_FIREBASE_PROJECT_ID: "" }), () => account()],
  ["missing actual project", context({ FIREBASE_PROJECT_ID: "" }), () => account()],
  ["production target", context({ QA_FIREBASE_PROJECT_ID: PROD, FIREBASE_PROJECT_ID: PROD }), () => account(PROD)],
  ["credential project mismatch", context(), () => account(PROD)],
  ["missing credential", context(), () => null],
  ["wrong credential type", context(), () => ({ ...account(), type: "authorized_user" })],
  ["wrong credential email", context(), () => ({ ...account(), client_email: `mock@${PROD}.iam.gserviceaccount.com` })],
  ["missing private key", context(), () => ({ ...account(), private_key: "" })],
  ["malformed credential", context(), () => { throw new Error("MOCK-PRIVATE-KEY-SENTINEL"); }],
  ["ambiguous sources", context({ FIREBASE_SERVICE_ACCOUNT_BASE64: "MOCK-SECRET-SENTINEL" }), () => account()],
  ["unknown environment", context({ APP_ENV: "" }), () => account()],
  ["client/server mismatch", context({ VITE_FIREBASE_PROJECT_ID: PROD }), () => account()],
  ["client environment mismatch", context({ VITE_APP_ENV: "production" }), () => account()],
  ["production points to QA", context({ APP_ENV: "production", VERCEL_ENV: "production" }), () => account()],
  ["platform conflict", context({ VERCEL_ENV: "production" }), () => account()],
]) {
  test(`admin blocks ${name} before ALL SDK calls without disclosing secrets`, () => {
    const { sdk, calls } = adminSdk();
    safeFailure(() => initializeFirebaseAdmin({ context: ctx, readAccount: read, sdk }));
    assert.deepEqual(calls, []);
  });
}

test("production default client and service-account initialization contracts are preserved", () => {
  const policy = firebaseRuntimePolicy({ VERCEL_ENV: "production" });
  const client = clientSdk();
  const result = initializeFirebaseClient({ policy, env: {}, hostname: "sehwa-health-portal.vercel.app", sdk: client.sdk });
  assert.equal(result.app.options.projectId, PROD);
  assert.equal(result.app.options.authDomain, "sehwa-health-portal.vercel.app");
  const admin = adminSdk();
  const app = initializeFirebaseAdmin({ context: { VERCEL_ENV: "production", FIREBASE_SERVICE_ACCOUNT_JSON: "mock" },
    readAccount: () => account(PROD), sdk: admin.sdk });
  assert.equal(app.options.projectId, PROD);
});

test("local is explicit and cannot use production defaults", () => {
  const policy = firebaseRuntimePolicy(context({ APP_ENV: "local" }));
  const { sdk } = clientSdk();
  assert.equal(initializeFirebaseClient({ policy, env: clientEnv({ VITE_APP_ENV: "local" }), sdk }).app.options.projectId, QA);
  safeFailure(() => initializeFirebaseClient({ policy, env: {}, sdk }));
});

test("cached client app cannot bypass validation or silently change resource configuration", () => {
  const { sdk, calls } = clientSdk([{ options: { projectId: PROD } }]);
  safeFailure(() => initializeFirebaseClient({ policy: firebaseRuntimePolicy(context()), env: clientEnv(), sdk }));
  assert.deepEqual(calls, ["getApps"]);
});

test("cached admin app cannot bypass missing credentials or reuse untrusted credentials", () => {
  const { sdk, calls } = adminSdk([{ options: { projectId: QA, credential: {} } }]);
  safeFailure(() => initializeFirebaseAdmin({ context: context(), readAccount: () => account(), sdk }));
  assert.deepEqual(calls, ["getApps"]);
  calls.length = 0;
  safeFailure(() => initializeFirebaseAdmin({ context: context(), readAccount: () => account(PROD), sdk }));
  assert.deepEqual(calls, []);
});

test("SDK key parsing failures are sanitized; no Firebase service is requested", () => {
  const { sdk, calls } = adminSdk();
  sdk.cert = () => { throw new Error("MOCK-PRIVATE-KEY-SENTINEL"); };
  safeFailure(() => initializeFirebaseAdmin({ context: context(), readAccount: () => account(), sdk }));
  assert.deepEqual(calls, ["getApps"]);
});

test("service-account access for Google Sheets shares the project guard", () => {
  let reads = 0;
  safeFailure(() => validatedAdminConfiguration(context({ APP_ENV: "unknown" }), () => { reads++; return account(); }));
  assert.equal(reads, 0);
});

test("known QA hostname cannot run a production bundle, nor production hostname a QA bundle", () => {
  for (const [policy, env, hostname] of [
    [firebaseRuntimePolicy({ VERCEL_ENV: "production" }), {}, "sehwa-health-portal-git-qa-sungandi86-maxs-projects.vercel.app"],
    [firebaseRuntimePolicy(context()), clientEnv(), "sehwa-health-portal.vercel.app"],
  ]) {
    const { sdk, calls } = clientSdk();
    safeFailure(() => initializeFirebaseClient({ policy, env, hostname, sdk }));
    assert.deepEqual(calls, []);
  }
});


test("cached admin app rejects changed credentials before reusing Firebase services", () => {
  const { sdk, calls } = adminSdk();
  initializeFirebaseAdmin({ context: context(), readAccount: () => account(), sdk });
  calls.length = 0;
  safeFailure(() => initializeFirebaseAdmin({ context: context(),
    readAccount: () => ({ ...account(), private_key: "CHANGED-SECRET-SENTINEL" }), sdk }));
  assert.deepEqual(calls, ["getApps"]);
});

test("production client refuses a QA project, redirect domain, or bucket", () => {
  const policy = firebaseRuntimePolicy({ VERCEL_ENV: "production" });
  for (const env of [{ VITE_FIREBASE_PROJECT_ID: QA },
    { VITE_FIREBASE_AUTH_DOMAIN: `${QA}.firebaseapp.com` },
    { VITE_FIREBASE_STORAGE_BUCKET: `${QA}.firebasestorage.app` }]) {
    const { sdk, calls } = clientSdk();
    safeFailure(() => initializeFirebaseClient({ policy, env, sdk }));
    assert.deepEqual(calls, []);
  }
});


test("client SDK initialization errors cannot expose configuration values", () => {
  const { sdk, calls } = clientSdk();
  sdk.initializeApp = () => { calls.push("initializeApp"); throw new Error("MOCK-API-KEY-SENTINEL"); };
  safeFailure(() => initializeFirebaseClient({ policy: firebaseRuntimePolicy(context()), env: clientEnv(), sdk }));
  assert.deepEqual(calls, ["getApps", "initializeApp"]);
});

test("Vite injects server-owned policy only, excluding credential and VITE-only grants", async () => {
  const keys = ["APP_ENV", "QA_FIREBASE_PROJECT_ID", "VERCEL_ENV", "VITE_APP_ENV", "FIREBASE_SERVICE_ACCOUNT_JSON"];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    const { default: configure } = await import("../vite.config.js");
    delete process.env.APP_ENV;
    process.env.VERCEL_ENV = "preview";
    process.env.VITE_APP_ENV = "qa";
    process.env.QA_FIREBASE_PROJECT_ID = QA;
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "MOCK-SECRET-SENTINEL";
    assert.equal(JSON.parse(configure({ mode: "test" }).define.__FIREBASE_RUNTIME_POLICY__).environment, "unknown");
    process.env.APP_ENV = "qa";
    const serialized = configure({ mode: "test" }).define.__FIREBASE_RUNTIME_POLICY__;
    assert.deepEqual(JSON.parse(serialized), { environment: "qa", qaProjectId: QA });
    assert.doesNotMatch(serialized, /SENTINEL|SERVICE_ACCOUNT|private_key/);
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});

test("real Admin entry points reject unknown environment before creating any app", async () => {
  const { getApps } = await import("firebase-admin/app");
  const { getFirebaseAdminAuth, getFirebaseAdminDb, getFirebaseAdminMessaging, getFirebaseServiceAccount } = await import("../server/lib/firebaseAdmin.js");
  const previous = process.env.APP_ENV;
  try {
    process.env.APP_ENV = "unknown";
    for (const access of [getFirebaseAdminAuth, getFirebaseAdminDb, getFirebaseAdminMessaging, getFirebaseServiceAccount]) safeFailure(access);
    assert.equal(getApps().length, 0);
  } finally {
    if (previous === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previous;
  }
});


test("QA cannot use known production API key or project-number identifiers", () => {
  const prod = initializeFirebaseClient({ policy: firebaseRuntimePolicy({ VERCEL_ENV: "production" }), sdk: clientSdk().sdk }).app.options;
  for (const overrides of [{ VITE_FIREBASE_API_KEY: prod.apiKey },
    { VITE_FIREBASE_MESSAGING_SENDER_ID: prod.messagingSenderId }, { VITE_FIREBASE_APP_ID: prod.appId },
    { VITE_FIREBASE_APP_ID: "1:999:web:wrong-sender" }]) {
    const { sdk, calls } = clientSdk();
    safeFailure(() => initializeFirebaseClient({ policy: firebaseRuntimePolicy(context()), env: clientEnv(overrides), sdk }));
    assert.deepEqual(calls, []);
  }
});


test("conflicting Admin SDK camelCase credential aliases cannot override validated JSON fields", () => {
  for (const override of [{ projectId: PROD }, { clientEmail: `mock@${PROD}.iam.gserviceaccount.com` },
    { privateKey: "OTHER-PRIVATE-KEY-SENTINEL" }]) {
    const { sdk, calls } = adminSdk();
    safeFailure(() => initializeFirebaseAdmin({ context: context(), readAccount: () => ({ ...account(), ...override }), sdk }));
    assert.deepEqual(calls, []);
  }
});
