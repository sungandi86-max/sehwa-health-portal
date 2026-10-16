import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where,
  documentId, getCountFromServer, orderBy, limit, runTransaction, serverTimestamp, writeBatch } from "firebase/firestore";
import { actors, resources, serverLedgers, assignment, status, submission, infection, accessRequest } from "./fixtures.mjs";
import { PROJECT_ID, requireLocalTarget } from "./safety.mjs";

// Deliberately outside Node's default test discovery: npm test must not silently
// skip integration cases. npm run test:rules requires a real local emulator.
if (process.env.SEHWA_RULES_RUNNER !== "local-only") throw new Error("USE_LOCAL_RULES_RUNNER");
const target = requireLocalTarget(process.env.GCLOUD_PROJECT, process.env.FIRESTORE_EMULATOR_HOST);
let environment;
const evidence = [];
before(async () => {
  environment = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: {
    ...target, rules: await readFile(new URL("../../firestore.rules", import.meta.url), "utf8"),
  } });
});
after(async () => {
  if (environment) { await environment.clearFirestore(); await environment.cleanup(); }
  await writeFile("rules-matrix-results.json", JSON.stringify(evidence, null, 2));
});
function client(actor) {
  return actor.uid ? environment.authenticatedContext(actor.uid, { email: `${actor.uid}@example.invalid` }).firestore()
    : environment.unauthenticatedContext().firestore();
}
async function seed(actor, name) {
  const uid = actor.uid || "anonymous";
  const staffId = actor.staffId || "PENDING";
  let id = "existing";
  let data = { value: "synthetic" };
  if (name.startsWith("staff_submission_status")) { id = `${staffId}_tb-screening-2026`; data = status(staffId); }
  if (name === "staff_submissions") data = submission(actor);
  if (name === "users") { id = uid; data = { uid, active: true, email: `${uid}@example.invalid`, displayName: "fixture", createdAt: new Date(0), updatedAt: new Date(0) }; }
  if (name === "user_assignments") { id = actor.health ? "staff-a_2026_2" : `${uid}_2026_2`; data = assignment(actor.health ? actors[2] : actor); }
  if (name === "access_requests") { id = `${uid}_2026_2`; data = { ...accessRequest({ uid }, new Date(0)), status: "pending" }; }
  if (name === "student_care_presence_homeroom") data = { schoolYear: 2026, semester: 2, grade: 1, classNo: 1 };
  if (name === "student_health_submissions") data = infection(actor);
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore(), batch = writeBatch(db);
    for (const member of actors.filter((a) => a.uid && a.roles)) {
      const path = member.qaOnly ? `user_assignments_qa/${member.uid}_2026_2` : `user_assignments/${member.uid}_2026_2`;
      batch.set(doc(db, path), { ...assignment(member), ...(member.qaOnly ? { qaOnly: true, environment: "qa" } : {}) });
    }
    batch.set(doc(db, name, id), data);
    await batch.commit();
  });
  return { id, data };
}
async function expectOperation(actor, resource, operation, allowed, action) {
  try {
    await (allowed ? assertSucceeds(action()) : assertFails(action()));
    evidence.push({ actor: actor.key, resource, operation, expected: allowed ? "ALLOW" : "DENY", result: "PASS" });
  } catch (error) {
    evidence.push({ actor: actor.key, resource, operation, expected: allowed ? "ALLOW" : "DENY", result: "FAIL" });
    throw error;
  }
}
for (const actor of actors) for (const name of resources) {
  test(`${actor.key}: ${name} get/list/create/update/delete`, async () => {
    await environment.clearFirestore();
    const { id, data } = await seed(actor, name);
    const db = client(actor), ref = doc(db, name, id);
    let get = false, list = false, create = false, update = false;
    let listQuery = collection(db, name), createId = "new-document", createData = { value: "fixture" }, updateData = { value: "updated" };
    if (name.startsWith("staff_submission_status")) {
      get = list = actor.approved === true;
      create = update = actor.manager === true;
      listQuery = actor.manager ? listQuery : query(listQuery, where("staffId", "==", actor.staffId || "PENDING"));
      createId = `${actor.staffId || "PENDING"}_cpr-training-2026`; createData = status(actor.staffId || "PENDING", "cpr-training-2026");
      updateData = { status: "completed" };
    } else if (name === "staff_submissions") {
      // Existing contract: signed-in owners retain access to their historical
      // originals even without a currently active assignment. Do not widen it.
      get = list = Boolean(actor.uid);
      listQuery = actor.manager ? listQuery : query(listQuery, where("submitter.uid", "==", actor.uid || "anonymous"));
      // Keep all 184 groups; revoked CPR create now explicitly expects DENY
      // following the confirmed security defect (historical reads unchanged).
      create = actor.approved === true;
      update = actor.manager === true;
      createData = submission(actor); updateData = { status: "completed", updatedAt: serverTimestamp() };
    } else if (name === "staff_submission_tasks" || name === "student_care_presence_public") {
      get = list = actor.approved === true;
    } else if (name === "users") {
      get = list = create = Boolean(actor.uid);
      listQuery = actor.manager ? listQuery : query(listQuery, where(documentId(), "==", id));
      update = Boolean(actor.uid); updateData = { displayName: "updated", updatedAt: serverTimestamp() };
      createId = id; createData = { uid: actor.uid, email: `${actor.uid}@example.invalid`, displayName: "fixture", active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    } else if (name === "user_assignments") {
      get = list = Boolean(actor.uid);
      listQuery = actor.manager ? listQuery : query(listQuery, where(documentId(), "==", id));
      create = update = actor.health === true;
      createId = "new-staff_2026_2"; createData = { ...assignment({ ...actors[2], uid: "new-staff" }), createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      updateData = { position: "updated", updatedAt: serverTimestamp() };
    } else if (name === "access_requests") {
      get = list = create = Boolean(actor.uid); update = actor.manager === true;
      listQuery = actor.manager ? listQuery : query(listQuery, where("uid", "==", actor.uid || "anonymous"));
      createId = id; createData = accessRequest(actor, serverTimestamp()); updateData = { status: "approved" };
    } else if (name === "student_care_presence_homeroom") {
      get = list = actor.manager === true;
    } else if (name === "student_health_submissions") {
      get = list = create = update = actor.manager === true;
      createData = infection(actor); updateData = { "report.status": "reviewing", "report.submissionStatus": "reviewed", "report.caseStatus": "checking", updatedAt: serverTimestamp() };
    }
    await expectOperation(actor, name, "get", get, () => getDoc(ref));
    await expectOperation(actor, name, "list", list, () => getDocs(listQuery));
    await expectOperation(actor, name, "update", update, () => updateDoc(ref, updateData));
    await expectOperation(actor, name, "delete", false, () => deleteDoc(ref));
    if (createId === id) await environment.withSecurityRulesDisabled((context) => deleteDoc(doc(context.firestore(), name, id)));
    await expectOperation(actor, name, "create", create, () => setDoc(doc(db, name, createId), createData));
  });
}

test("staff A cannot read B private originals or unscoped status lists", async () => {
  await environment.clearFirestore();
  const a = actors[2], b = actors[3];
  await seed(a, "staff_submission_status");
  await seed(b, "staff_submissions");
  const db = client(a);
  await assertFails(getDoc(doc(db, "staff_submissions/existing")));
  await assertFails(getDocs(collection(db, "staff_submission_status")));
  await assertSucceeds(getDocs(query(collection(db, "staff_submission_status"), where("staffId", "==", a.staffId))));
});

test("homeroom boundaries constrain current class get/list/create", async () => {
  await environment.clearFirestore();
  const homeroom = { key: "homeroom", uid: "homeroom", staffId: "S-HR", roles: ["staff", "homeroom"], approved: true };
  await seed(actors[2], "student_care_presence_homeroom");
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "user_assignments/homeroom_2026_2"), { ...assignment(homeroom), grade: 1, classNo: 1 });
    await setDoc(doc(context.firestore(), "student_care_presence_homeroom/foreign"), { schoolYear: 2026, semester: 2, grade: 2, classNo: 1 });
  });
  const db = client(homeroom);
  await assertSucceeds(getDoc(doc(db, "student_care_presence_homeroom/existing")));
  await assertFails(getDoc(doc(db, "student_care_presence_homeroom/foreign")));
  await assertFails(getDocs(collection(db, "student_care_presence_homeroom")));
  await assertSucceeds(getDocs(query(collection(db, "student_care_presence_homeroom"), where("schoolYear", "==", 2026), where("semester", "==", 2), where("grade", "==", 1), where("classNo", "==", 1))));
  await assertSucceeds(setDoc(doc(db, "student_health_submissions/own"), infection(homeroom)));
  await assertFails(setDoc(doc(db, "student_health_submissions/foreign"), { ...infection(homeroom), student: { grade: 2, classNo: 1, number: 1, name: "fixture" } }));
});

test("old assignment path and training_admin role do not grant ordinary staff/admin Rules rights", async () => {
  for (const variant of ["old-path", "role"]) {
    await environment.clearFirestore();
    const actor = { ...actors[2], uid: "boundary", roles: ["training_admin"] };
    await seed(actors[2], "staff_submission_tasks");
    await environment.withSecurityRulesDisabled(async (context) => {
      const path = variant === "old-path" ? "boundary_2025_2" : "boundary_2026_2";
      await setDoc(doc(context.firestore(), "user_assignments", path), assignment(variant === "old-path" ? { ...actor, roles: ["staff"] } : actor));
    });
    await assertFails(getDoc(doc(client(actor), "staff_submission_tasks/existing")));
  }
});

// Safety requirements, not claims that the current Rules satisfy them. If they
// fail on the first real emulator run, preserve the evidence before changing Rules.
for (const mismatch of [{ schoolYear: 2025 }, { semester: 1 }, { uid: "different-owner" }]) {
  test(`safety requirement: misplaced current assignment rejected ${Object.keys(mismatch)[0]}`, async () => {
    await environment.clearFirestore();
    const actor = actors[2];
    await seed(actor, "staff_submission_tasks");
    await environment.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), `user_assignments/${actor.uid}_2026_2`), { ...assignment(actor), ...mismatch }));
    await assertFails(getDoc(doc(client(actor), "staff_submission_tasks/existing")));
  });
}
test("safety requirement: revoked assignment cannot create new CPR evidence", async () => {
  await environment.clearFirestore();
  const actor = actors.find((a) => a.key === "revoked");
  await seed(actor, "staff_submissions");
  await assertFails(setDoc(doc(client(actor), "staff_submissions/new-cpr"), submission(actor)));
});

test("configured project is synthetic and server ledgers have no client role exception", () => {
  assert.ok(PROJECT_ID.startsWith("demo-"));
  assert.ok(serverLedgers.includes("training_events_production"));
});

const malformedAssignments = [
  ["foreign UID", { uid: "foreign" }], ["wrong year", { schoolYear: 2025 }], ["wrong semester", { semester: 1 }],
  ["UID and year mismatch", { uid: "foreign", schoolYear: 2025 }],
  ["year and semester mismatch", { schoolYear: 2025, semester: 1 }],
  ["UID year semester mismatch", { uid: "foreign", schoolYear: 2025, semester: 1 }],
  ["numeric UID", { uid: 123 }], ["string year", { schoolYear: "2026" }], ["string semester", { semester: "2" }],
  ["missing UID", { uid: undefined }], ["missing year", { schoolYear: undefined }], ["missing semester", { semester: undefined }],
  ["inactive", { active: false }], ["string active", { active: "true" }], ["missing active", { active: undefined }],
  ["string roles", { roles: "admin" }], ["missing roles", { roles: undefined }], ["unrelated role", { roles: ["training_admin"] }],
];
function changedAssignment(base, change) {
  const value = { ...base, ...change };
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
  return value;
}
for (const role of ["staff", "health_teacher", "admin", "homeroom"]) {
  test(`assignment integrity across ${role} predicate: valid allowed, ${malformedAssignments.length} malformed/revoked denied`, async () => {
    await environment.clearFirestore();
    const actor = { key: role, uid: `integrity-${role}`, staffId: `I-${role}`, roles: [role], approved: true };
    const base = { ...assignment(actor), ...(role === "homeroom" ? { grade: 1, classNo: 1 } : {}) };
    const name = role === "admin" ? "staff_submission_status" : role === "homeroom" ? "student_care_presence_homeroom" : "staff_submission_tasks";
    const { id } = await seed(actor, name);
    const install = (data) => environment.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), `user_assignments/${actor.uid}_2026_2`), data));
    const db = client(actor);
    let sequence = 0;
    const operation = () => role === "health_teacher"
      ? setDoc(doc(db, "announcements", `integrity-${sequence++}`), { title: "synthetic" })
      : getDoc(doc(db, name, id));
    await install(base);
    await assertSucceeds(operation());
    for (const [, change] of malformedAssignments) {
      await install(changedAssignment(base, change));
      await assertFails(operation());
    }
    await install(base);
    await assertSucceeds(operation());
  });
}
for (const [label, change] of malformedAssignments) {
  test(`CPR create denies ${label}; correct approved assignment allows same request`, async () => {
    await environment.clearFirestore();
    const actor = actors[2], base = assignment(actor);
    await seed(actor, "staff_submissions");
    const install = (value) => environment.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), `user_assignments/${actor.uid}_2026_2`), value));
    const ref = doc(client(actor), "staff_submissions/new-integrity-cpr");
    await install(changedAssignment(base, change));
    await assertFails(setDoc(ref, submission(actor)));
    await install(base);
    await assertSucceeds(setDoc(ref, submission(actor)));
  });
}
test("CPR impersonation denied, inactive historical read retained, approval state protected", async () => {
  await environment.clearFirestore();
  const a = actors[2], b = actors[3], revoked = actors.find((actor) => actor.key === "revoked");
  await seed(a, "staff_submissions");
  const db = client(a);
  await assertFails(setDoc(doc(db, "staff_submissions/foreign-staff"), { ...submission(a), staffId: b.staffId }));
  await assertFails(setDoc(doc(db, "staff_submissions/foreign-submitter"), submission(b)));
  await assertFails(updateDoc(doc(db, "staff_submissions/existing"), { status: "completed" }));
  await assertFails(deleteDoc(doc(db, "staff_submissions/existing")));
  await environment.clearFirestore();
  await seed(revoked, "staff_submissions");
  await assertSucceeds(getDoc(doc(client(revoked), "staff_submissions/existing")));
  await assertFails(updateDoc(doc(client(revoked), "staff_submissions/existing"), { status: "completed" }));
});
test("CPR denied without approval/authentication; normal creation does not mutate existing originals or statuses", async () => {
  await environment.clearFirestore();
  const a = actors[2];
  await seed(a, "staff_submissions");
  await seed(a, "staff_submission_status");
  await assertFails(setDoc(doc(client(actors[0]), "staff_submissions/anonymous"), submission(actors[0])));
  await assertFails(setDoc(doc(client(actors[1]), "staff_submissions/pending"), submission(actors[1])));
  await assertSucceeds(setDoc(doc(client(a), "staff_submissions/approved"), submission(a)));
  assert.equal((await getDoc(doc(client(a), "staff_submissions/existing"))).data().status, "submitted");
  assert.equal((await getDoc(doc(client(a), `staff_submission_status/${a.staffId}_tb-screening-2026`))).data().status, "pending");
});
test("TB direct assignment lookup rejects identity/term mismatch without changing existing active-state contract", async () => {
  await environment.clearFirestore();
  const a = actors[2], base = assignment(a), original = submission(a);
  const { trainingDate, institution, ...rest } = original;
  const payload = { ...rest, itemId: "tb", checkupDate: "2026-10-01", documentType: "synthetic" };
  await seed(a, "staff_submissions");
  const install = (data) => environment.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), `user_assignments/${a.uid}_2026_2`), data));
  const db = client(a);
  for (const [, change] of malformedAssignments.filter(([, change]) => ["uid", "schoolYear", "semester"].some((key) => key in change))) {
    await install(changedAssignment(base, change));
    await assertFails(setDoc(doc(db, "staff_submissions/new-tb"), payload));
  }
  await install(base);
  await assertSucceeds(setDoc(doc(db, "staff_submissions/new-tb"), payload));
});

test("receipt upload journals remain server-only for every client identity", async () => {
  for (const name of ["staff_submission_receipts_qa", "staff_submission_receipts_production"]) {
    for (const actor of actors) {
      await environment.clearFirestore();
      await seed(actor, name);
      const db = client(actor), ref = doc(db, name, "existing");
      await assertFails(getDoc(ref));
      await assertFails(getDocs(collection(db, name)));
      await assertFails(setDoc(doc(db, name, "new"), { state: "recorded" }));
      await assertFails(updateDoc(ref, { state: "recorded" }));
      await assertFails(deleteDoc(ref));
    }
  }
});

test("FAQ public read contract stays distinct from staff-only page and protected role data", async () => {
  for (const actor of actors) {
    await environment.clearFirestore();
    await seed(actor, "faqs");
    const db = client(actor);
    await assertSucceeds(getDoc(doc(db, "faqs", "existing")));
    await assertSucceeds(getDocs(collection(db, "faqs")));
    await (actor.health ? assertSucceeds : assertFails)(deleteDoc(doc(db, "faqs", "existing")));
  }
});


test("paged admin receipt queries and CPR transaction retain existing role boundaries", async () => {
  await environment.clearFirestore();
  const manager = actors.find((actor) => actor.health);
  const staff = actors.find((actor) => actor.approved && !actor.manager);
  await seed(staff, "staff_submissions");
  await seed(staff, "staff_submission_status_qa");
  const db = client(manager);
  const ref = collection(db, "staff_submissions");
  await assertSucceeds(getDocs(query(ref, where("status", "==", "submitted"), orderBy("submittedAt", "desc"), orderBy(documentId(), "desc"), limit(51))));
  await assertSucceeds(getCountFromServer(query(ref, where("status", "==", "submitted"))));
  const statusRef = doc(db, "staff_submission_status_qa", `${staff.staffId}_cpr-training-2026`);
  await assertSucceeds(runTransaction(db, async (transaction) => {
    await transaction.get(statusRef);
    transaction.set(statusRef, { staffId: staff.staffId, taskId: "cpr-training-2026", status: "completed",
      training: { completionMethod: "group", eventId: "CPR-1", completionDate: "2026-10-01", evidenceStatus: "completed", note: "synthetic" }, cprProjectionRevision: 1 });
  }));
  await assertFails(updateDoc(doc(client(staff), "staff_submission_status_qa", `${staff.staffId}_cpr-training-2026`), { cprProjectionRevision: 2 }));
});
