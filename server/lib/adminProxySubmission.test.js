import test from "node:test";
import assert from "node:assert/strict";
import { buildProxySubmissionRecord, createProxySubmission, findProxyDuplicates,
  proxySubmissionCollection, resolveProxySubject } from "./adminProxySubmission.js";

test("proxy submission separates subject and administrator identities", () => {
  const subject = resolveProxySubject([{ staffId: "T049", name: "대상자", department: "교무부", position: "교사" }], "T049");
  const record = buildProxySubmissionRecord({ subject, administrator: { staffId: "T001", name: "등록자" },
    checkupDate: "2026-10-14", documentType: "결핵검진 확인증", proxyNote: "종이 제출본",
    file: { driveFileId: "drive-1", fileName: "paper.pdf", mimeType: "application/pdf", driveUrl: null },
    now: new Date("2026-10-14T01:02:03Z") });
  assert.equal(record.subjectStaffId, "T049");
  assert.equal(record.submittedByStaffId, "T001");
  assert.equal(record.submissionMode, "admin_proxy");
  assert.equal(record.submitter.uid, "");
});

test("proxy duplicate lookup never overwrites and create uses a new document", async () => {
  const created = [];
  const collections = [];
  const db = { collection: (name) => {
    collections.push(name);
    return ({
    where: () => ({ get: async () => ({ docs: [
      { id: "old-tb", data: () => ({ itemId: "tb", staffId: "T049", checkupDate: "2026-03-01" }) },
      { id: "other", data: () => ({ itemId: "cpr", staffId: "T049" }) },
    ] }) }),
    doc: (id) => ({ create: async (value) => created.push({ id, value }) }),
  }); } };
  assert.equal((await findProxyDuplicates(db, "T049", { collectionName: "staff_submissions_qa" })).length, 1);
  await createProxySubmission(db, { itemId: "tb" }, {
    submissionId: () => "new-id",
    collectionName: "staff_submissions_qa",
  });
  assert.deepEqual(collections, ["staff_submissions_qa", "staff_submissions_qa"]);
  assert.deepEqual(created, [{ id: "new-id", value: { itemId: "tb" } }]);
});

test("proxy collection is isolated by deployment environment", () => {
  assert.equal(proxySubmissionCollection("qa"), "staff_submissions_qa");
  assert.equal(proxySubmissionCollection("production"), "staff_submissions");
});

test("proxy subject mapping fails closed for missing or duplicate staff ids", () => {
  assert.throws(() => resolveProxySubject([], "T049"), /확인할 수 없습니다/);
  assert.throws(() => resolveProxySubject([{ staffId: "T049" }, { staffId: "T049" }], "T049"), /확인할 수 없습니다/);
});
