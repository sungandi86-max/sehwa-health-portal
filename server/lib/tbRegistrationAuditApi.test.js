import assert from "node:assert/strict";
import test from "node:test";
import { handleTbRegistrationAuditResource } from "./tbRegistrationAuditApi.js";

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("TB registration audit admin resource separates canonical and manual-review records", async () => {
  const res = response();
  await handleTbRegistrationAuditResource({ method: "GET" }, res, {
    verifyAdmin: async () => ({ ok: true }),
    store: {
      environment: "qa",
      listRequests: async () => [
        { requestId: "canonical", staffId: "T095", submittedAt: "2026-09-11", selectedType: "단체검진 신청",
          source: "legacy_sheet_migration", status: "received", manualReview: false, migration: { imported: true, legacySource: "source", sourceSheetName: "sheet", sourceRow: 2 } },
        { requestId: "manual", candidateStaffId: "T043", submittedAt: "", selectedType: "",
          source: "legacy_sheet_migration", status: "manual_review", manualReview: true,
          legacyOriginal: { timestamp: "", name: "legacy", department: "", selectedType: "", note: "" },
          migration: { imported: true, legacySource: "source", sourceSheetName: "sheet", sourceRow: 9 } },
      ],
    },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.summary, { total: 2, canonical: 1, manualReview: 1 });
  assert.equal(res.body.items[1].staffId, null);
  assert.equal(res.body.items[1].candidateStaffId, "T043");
  assert.equal(res.body.items[1].status, "manual_review");
});

test("TB registration audit resource remains administrator-only and read-only", async () => {
  const denied = response();
  await handleTbRegistrationAuditResource({ method: "GET" }, denied, {
    verifyAdmin: async () => ({ ok: false, status: 403, message: "관리자 권한이 없습니다." }),
  });
  assert.equal(denied.statusCode, 403);
  const write = response();
  await handleTbRegistrationAuditResource({ method: "POST" }, write);
  assert.equal(write.statusCode, 405);
});
