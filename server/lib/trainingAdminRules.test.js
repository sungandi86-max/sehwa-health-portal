import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rules = await readFile(new URL("../../firestore.rules", import.meta.url), "utf8");
const assignmentRules = rules.split("match /user_assignments/{assignmentId} {")[1]
  ?.split("match /access_requests/{requestId} {")[0];

test("assignment roles allow the existing roles and training_admin, but no arbitrary role", () => {
  const match = rules.match(/data\.roles\.hasOnly\(\[([^\]]+)\]\)/);
  assert.ok(match);
  const allowed = JSON.parse(`[${match[1]}]`);
  assert.deepEqual(allowed, ["staff", "homeroom", "training_admin", "health_teacher", "admin"]);
  for (const role of ["admin", "health_teacher", "training_admin"]) assert.equal(allowed.includes(role), true);
  assert.equal(allowed.includes("arbitrary_role"), false);
});

test("only an active health teacher can create or update another assignment", () => {
  assert.ok(assignmentRules);
  assert.match(rules, /function hasCurrentHealthTeacherAssignment\(\) \{[\s\S]*?data\.active == true[\s\S]*?data\.roles\.hasAny\(\["health_teacher"\]\)/);
  assert.match(assignmentRules, /allow create: if hasCurrentHealthTeacherAssignment\(\)/);
  assert.match(assignmentRules, /allow update: if hasCurrentHealthTeacherAssignment\(\)/);
  assert.match(assignmentRules, /request\.resource\.data\.diff\(resource\.data\)\.changedKeys\(\)\.hasOnly\(\[/);
  assert.match(assignmentRules, /preservesOwnCurrentHealthTeacherAssignment\(assignmentId, request\.resource\.data\)/);
  assert.match(assignmentRules, /allow delete: if false/);
  assert.doesNotMatch(assignmentRules, /allow (?:create|update): if (?:signedIn|isSelf)\(/);
});

test("training_admin does not gain unrelated direct staff-care or training data access", () => {
  const publicGate = rules.split("function hasCurrentStudentCarePublicAssignment() {")[1]
    ?.split("function hasCurrentHomeroomAssignment() {")[0];
  assert.ok(publicGate);
  assert.doesNotMatch(publicGate, /"training_admin"/);
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  assert.doesNotMatch(rules, /match \/training_(?:events|signature_ledger|attendance_locks)/);
});
