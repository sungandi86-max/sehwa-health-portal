import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("admin proxy UI exposes canonical selection and duplicate confirmation without replacing existing records", () => {
  const dialog = fs.readFileSync(new URL("../components/AdminProxySubmissionDialog.jsx", import.meta.url), "utf8");
  const page = fs.readFileSync(new URL("../pages/FirebaseAdminSubmissionsPage.jsx", import.meta.url), "utf8");
  assert.match(page, /대리등록/);
  assert.match(dialog, /이름, 교직원ID, 부서 검색/);
  assert.match(dialog, /이미 제출 기록이 있습니다/);
  assert.match(dialog, /추가 등록/);
  assert.match(dialog, /accept="application\/pdf,image\/jpeg,image\/png"/);
  assert.match(dialog, /createAdminProxyTbSubmission/);
  assert.doesNotMatch(dialog, /deleteDoc|updateDoc/);
});

test("submission status roster joins proxy records by canonical staffId", () => {
  const source = fs.readFileSync(new URL("./submissionStatus.js", import.meta.url), "utf8");
  assert.match(source, /submission\.subjectStaffId \|\| submission\.staffId/);
  assert.match(source, /user\.assignment\?\.staffId/);
});
