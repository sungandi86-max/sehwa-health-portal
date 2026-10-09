import assert from "node:assert/strict";
import test from "node:test";
import { resolveTrainingAccess } from "./trainingCenterAccess.js";

const uid = "qa-sign-test-001";
const staffId = "QA-SIGN-TEST-001";

function access(environment, overrides = {}) {
  const assignment = { uid, staffId, schoolYear: 2026, semester: 2, active: false,
    environment: "qa", qaOnly: true, roles: ["qa_training_signer"],
    qaExpiresAt: "2099-01-01T00:00:00.000Z", ...overrides };
  return resolveTrainingAccess({ headers: { authorization: "Bearer qa-fixture" } }, {
    auth: () => ({ verifyIdToken: async () => ({ uid }) }),
    db: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => assignment }) }) }) }),
    directory: async () => ({ directory: [{ staffId, employmentStatus: "재직" }], stats: { duplicateStaffIds: 0 } }),
    environment: () => environment,
  });
}

test("inactive synthetic signer is accepted only by QA training access", async () => {
  const qa = await access("qa");
  assert.equal(qa.ok, true);
  assert.equal(qa.isAdmin, false);
  assert.equal((await access("production")).status, 403);
  assert.equal((await access(null)).status, 403);
  assert.equal((await access("qa", { qaExpiresAt: "2000-01-01T00:00:00.000Z" })).status, 403);
  assert.equal((await access("qa", { roles: ["staff"] })).status, 403);
});
