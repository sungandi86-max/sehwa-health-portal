import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { firestoreResource, validateFirestoreDb } from "./firestoreResources.js";
import { PRODUCTION_FIREBASE_PROJECT_ID as PROD, firebaseRuntimePolicy } from "./firebaseEnvironment.js";
import { initializeFirebaseClient } from "../src/lib/firebaseInitialization.js";
import { clientFirestoreResource } from "../src/lib/firestoreResources.js";
import { serverFirestoreResource } from "../server/lib/firestoreResources.js";
import { reconcileCprTrainingStatus, saveCompletedCprGroupTraining } from "../server/lib/cprTrainingStatus.js";
import { saveTbScreeningStatus, buildTbRegistrationStatus } from "../server/lib/tbScreeningStatus.js";
import { verifyTbSubmissionAllowed } from "../server/lib/tbSubmissionGuard.js";
import { writeSnapshotPlan, healthTrainingSheetResources } from "../server/healthMandatoryTrainingDryRun.js";
const QA = "isolated-health-qa";
const context = { APP_ENV: "qa", QA_FIREBASE_PROJECT_ID: QA };
const qa = firebaseRuntimePolicy(context);
const production = { environment: "production" };
function database(project = QA) {
  const data = new Map(), calls = [];
  const db = { app: { options: { projectId: project } }, collection(name) {
    calls.push(["collection", name]);
    const docs = () => [...data.entries()].filter(([path]) => path.startsWith(`${name}/`))
      .map(([path, value]) => ({ id: path.split("/")[1], data: () => value }));
    return { where: () => ({ get: async () => ({ docs: docs() }) }), doc(id) {
      const path = `${name}/${id}`;
      return { id, get: async () => ({ exists: data.has(path), data: () => data.get(path) }),
        set: async (value) => { calls.push(["set", path]); data.set(path, value); } };
    } };
  } };
  return { db, data, calls };
}
for (const [name, policy, project, key, expected] of [
  ["QA environment scoped", qa, QA, "statuses", "staff_submission_status_qa"],
  ["QA project scoped", qa, QA, "submissions", "staff_submissions"],
  ["QA task definitions project scoped", qa, QA, "tasks", "staff_submission_tasks"],
  ["production statuses preserved", production, PROD, "statuses", "staff_submission_status"],
  ["production submissions preserved", production, PROD, "submissions", "staff_submissions"],
  ["production-only permitted in production", production, PROD, "productionTbEvidence", "tb_certificate_submissions_production"],
  ["local explicitly isolated project", { ...qa, environment: "local" }, QA, "statuses", "staff_submission_status_qa"],
]) test(name, () => {
  const { db, calls } = database(project);
  assert.equal(firestoreResource(policy, db, key), expected);
  assert.deepEqual(calls, []);
});
for (const [name, policy, project, key, requested] of [
  ["QA production-only", qa, QA, "productionTbEvidence"],
  ["unknown environment", { environment: "unknown" }, QA, "statuses"],
  ["QA mixed production DB", qa, PROD, "statuses"],
  ["production mixed QA DB", production, QA, "statuses"],
  ["injected DB mismatch", qa, "different-health-qa", "submissions"],
  ["QA operational collection override", qa, QA, "statuses", "staff_submission_status"],
  ["production QA collection override", production, PROD, "statuses", "staff_submission_status_qa"],
]) test(`${name} blocks before collection or remote access`, () => {
  const { db, calls } = database(project);
  assert.throws(() => firestoreResource(policy, db, key, requested), (error) => {
    assert.doesNotMatch(error.message, /isolated-health|sehwa-health|SENTINEL|private_key/); return true;
  });
  assert.deepEqual(calls, []);
});
test("unidentifiable and contradictory public DB metadata are rejected", () => {
  assert.throws(() => validateFirestoreDb(qa, {}), /firestore-project-unresolved/);
  assert.throws(() => validateFirestoreDb(qa, { app: { options: { projectId: QA } }, projectId: PROD }));
  assert.equal(validateFirestoreDb(qa, { projectId: QA }).projectId, QA);
});
test("cached DB is revalidated on every reuse", () => {
  const { db, calls } = database();
  assert.equal(serverFirestoreResource(db, "statuses", context), "staff_submission_status_qa");
  db.app.options.projectId = PROD;
  assert.throws(() => serverFirestoreResource(db, "statuses", context));
  assert.deepEqual(calls, []);
});
test("client initialization rejects mismatched returned DB before auth or remote calls", () => {
  let authCalls = 0;
  assert.throws(() => initializeFirebaseClient({ policy: production,
    sdk: { getApps: () => [], initializeApp: (options) => ({ options }),
      getFirestore: () => database(QA).db, getAuth: () => { authCalls++; } } }));
  assert.equal(authCalls, 0);
});
test("QA submission writer, CPR reconciliation and client status reader share contracts", async () => {
  const { db, data } = database();
  globalThis.__FIREBASE_RUNTIME_POLICY__ = qa;
  try {
    const original = clientFirestoreResource(db, "submissions");
    await db.collection(original).doc("receipt").set({ itemId: "cpr", staffId: "T001", trainingDate: "2026-10-01", status: "completed" });
    assert.equal(await reconcileCprTrainingStatus({ db, context, staffId: "T001", source: { signatures: [], trainings: [] } }), "individual");
    const ledger = clientFirestoreResource(db, "statuses");
    assert.equal(data.get(`${ledger}/T001_cpr-training-2026`).status, "completed");
    assert.equal(data.has("staff_submission_status/T001_cpr-training-2026"), false);
    await saveTbScreeningStatus({ db, context, payload: buildTbRegistrationStatus({ staffId: "T002", registrationType: "group" }) });
    assert.equal(data.get(`${ledger}/T002_tb-screening-2026`).screening.registrationStatus, "applied");
  } finally { delete globalThis.__FIREBASE_RUNTIME_POLICY__; }
});
test("QA group CPR processing writes same QA status ledger", async () => {
  const { db, data } = database();
  await saveCompletedCprGroupTraining({ db, context, staffId: "T001", events: [{ eventId: "E1", title: "CPR", date: "2026-10-01" }] });
  assert.equal(data.get("staff_submission_status_qa/T001_cpr-training-2026").training.completionMethod, "group");
});
test("blocked CPR and TB writers make zero collection/remote calls", async () => {
  const { db, calls } = database(PROD);
  await assert.rejects(reconcileCprTrainingStatus({ db, context, staffId: "T001", source: { signatures: [], trainings: [] } }));
  await assert.rejects(saveTbScreeningStatus({ db, context, payload: buildTbRegistrationStatus({ staffId: "T001" }) }));
  assert.deepEqual(calls, []);
});
test("snapshot validates even empty plan before batch creation or commit", async () => {
  let calls = 0;
  await assert.rejects(writeSnapshotPlan({ db: { batch() { calls++; } }, docs: [], context }));
  assert.equal(calls, 0);
});
test("TB injected DB mismatch fails before assignment or status reads", async () => {
  const { db, calls } = database(PROD);
  const result = await verifyTbSubmissionAllowed({ headers: { authorization: "Bearer mock" } }, {
    context, auth: () => ({ verifyIdToken: async () => ({ uid: "staff-user" }) }), database: () => db,
  });
  assert.equal(result.status, 503);
  assert.deepEqual(calls, []);
});
test("Rules preserve existing production role checks in QA status block", () => {
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  const start = rules.indexOf("match /staff_submission_status_qa/");
  const block = rules.slice(start, rules.indexOf("match /student_care_monthly_aggregates/", start));
  assert.match(block, /request.auth.token.aud != "sehwa-health-portal-v2"/);
  assert.match(block, /allow read: if isNonProductionStatusAccess\(\) && \(hasCurrentHealthTeacherOrAdminAssignment\(\)/);
  assert.match(block, /resource.data.staffId == get\(currentAssignmentPath\(request.auth.uid\)\).data.staffId/);
  for (const action of ["create", "update"]) assert.ok(block.includes(`allow ${action}: if isNonProductionStatusAccess() && hasCurrentHealthTeacherOrAdminAssignment()`));
  assert.match(block, /allow delete: if false/);
});

test("mandatory training rejects production Sheets even with shared read-only exception", async () => {
  const { PRODUCTION_SHEETS } = await import("../server/lib/environmentResources.js");
  assert.throws(() => healthTrainingSheetResources({ ...context,
    QA_STAFF_ROSTER_SOURCE_SPREADSHEET_ID: "mock-staff-sheet",
    QA_RESEARCH_TRAINING_SPREADSHEET_ID: PRODUCTION_SHEETS.research,
    QA_SHARED_READONLY_SHEET_IDS: PRODUCTION_SHEETS.research,
  }), (error) => error.code === "RESOURCE_ENV_MISMATCH");
  assert.deepEqual(healthTrainingSheetResources({ ...context,
    QA_STAFF_ROSTER_SOURCE_SPREADSHEET_ID: "mock-staff-sheet",
    QA_RESEARCH_TRAINING_SPREADSHEET_ID: "mock-research-sheet",
  }), { staff: "mock-staff-sheet", research: "mock-research-sheet" });
  assert.equal(healthTrainingSheetResources({ APP_ENV: "production" }).research, PRODUCTION_SHEETS.research);
});
