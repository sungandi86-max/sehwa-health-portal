import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { personalTbEvidenceRequired, SCREENING_TYPE_OPTIONS, screeningSourceLabel, screeningTypeLabel } from "./healthScreeningTypes.js";

test("migrated routes have a distinct user-safe source label", () => {
  assert.equal(screeningSourceLabel({ source: "legacy_firestore_backfill" }), "기존 자료 이관");
  assert.equal(screeningSourceLabel({ source: "self" }), "본인 선택");
  assert.equal(screeningSourceLabel({ source: "admin", selfChoice: null }), "관리자 입력");
  assert.equal(screeningSourceLabel({ source: "admin", selfChoice: { screeningType: "nhis" } }), "관리자 수정");
});
test("school group screening has a distinct label and does not require personal evidence", () => {
  assert.deepEqual(SCREENING_TYPE_OPTIONS.map((item) => item.value), ["nhis", "employment", "individual", "group", "none", "other"]);
  assert.equal(screeningTypeLabel("group"), "학교 단체검진");
  assert.equal(personalTbEvidenceRequired("group"), false);
  for (const type of ["nhis", "employment", "individual", "none", "other", null]) {
    assert.equal(personalTbEvidenceRequired(type), true);
  }
});
test("staff and administrator panels render migration provenance without internal details", () => {
  for (const path of ["../components/HealthScreeningTypePanel.jsx", "../components/HealthScreeningTypeAdminPanel.jsx"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /screeningSourceLabel/);
    assert.match(source, /personalTbEvidenceRequired/);
    assert.doesNotMatch(source, /manifestHash|sourceDocumentId/);
  }
});
