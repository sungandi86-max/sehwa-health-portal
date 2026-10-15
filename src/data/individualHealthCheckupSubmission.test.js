import test from "node:test";
import assert from "node:assert/strict";
import { INDIVIDUAL_HEALTH_CHECKUP_DOCUMENT_OPTIONS, TB_QA_DOCUMENT_TYPE_OPTIONS } from "./individualHealthCheckupSubmission.js";

test("QA adds employment evidence without changing Production form choices", () => {
  assert.deepEqual(INDIVIDUAL_HEALTH_CHECKUP_DOCUMENT_OPTIONS.map(({ value }) => value), ["결핵검진 확인증", "흉부 X-ray 확인 자료"]);
  assert.deepEqual(TB_QA_DOCUMENT_TYPE_OPTIONS.map(({ value }) => value), ["결핵검진 확인증", "흉부 X-ray 확인 자료", "채용검진 확인 자료"]);
  assert.deepEqual(TB_QA_DOCUMENT_TYPE_OPTIONS.map(({ evidenceRoute }) => evidenceRoute), ["individual", "nhis", "employment"]);
});
