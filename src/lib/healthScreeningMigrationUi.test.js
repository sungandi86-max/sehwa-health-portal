import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { screeningSourceLabel } from "./healthScreeningTypes.js";

test("migrated routes have a distinct user-safe source label", () => {
  assert.equal(screeningSourceLabel({ source: "legacy_firestore_backfill" }), "기존 자료 이관");
  assert.equal(screeningSourceLabel({ source: "self" }), "본인 선택");
  assert.equal(screeningSourceLabel({ source: "admin", selfChoice: null }), "관리자 입력");
  assert.equal(screeningSourceLabel({ source: "admin", selfChoice: { screeningType: "nhis" } }), "관리자 수정");
});
test("staff and administrator panels render migration provenance without internal details", () => {
  for (const path of ["../components/HealthScreeningTypePanel.jsx", "../components/HealthScreeningTypeAdminPanel.jsx"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /screeningSourceLabel/);
    assert.doesNotMatch(source, /manifestHash|sourceDocumentId/);
  }
});
