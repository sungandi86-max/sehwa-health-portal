import test from "node:test";
import assert from "node:assert/strict";
import { CURRENT_SCHOOL_YEAR } from "../config/school.js";
import { SCREENING_TYPE_OPTIONS, HealthScreeningTypeError, canEditHealthScreeningYear, hasSelfScreeningConfirmation, isHealthScreeningTypeQaHost, screeningConfirmationLabel, screeningTypeLabel } from "./healthScreeningTypes.js";

test("editable year defaults to configured school year rather than calendar year", () => {
  assert.equal(canEditHealthScreeningYear(), true);
  assert.equal(canEditHealthScreeningYear(CURRENT_SCHOOL_YEAR), true);
  assert.equal(canEditHealthScreeningYear(String(CURRENT_SCHOOL_YEAR)), true);
  assert.equal(canEditHealthScreeningYear(CURRENT_SCHOOL_YEAR + 1), false);
  assert.equal(canEditHealthScreeningYear(CURRENT_SCHOOL_YEAR - 1), false);
});

test("health screening type UI is allowed only on the exact fixed QA hostname", () => {
  assert.equal(isHealthScreeningTypeQaHost("sehwa-health-portal-git-qa-sungandi86-maxs-projects.vercel.app"), true);
  for (const host of ["sehwa-health-portal.vercel.app", "health.sehwa-gs.hs.kr", "sehwa-health-portal-unique123-sungandi86-maxs-projects.vercel.app", "localhost", "", undefined]) {
    assert.equal(isHealthScreeningTypeQaHost(host), false);
  }
});

test("annual type options use the four server values", () => {
  assert.deepEqual(SCREENING_TYPE_OPTIONS.map(({ value }) => value), ["nhis", "employment", "none", "other"]);
  assert.equal(screeningTypeLabel("none"), "해당 없음");
  assert.equal(screeningTypeLabel(null), "확인 필요");
  assert.equal(screeningTypeLabel("unknown"), "확인 필요");
});

test("admin input never implies self confirmation", () => {
  const item = { screeningType: "nhis", screeningTypeConfirmed: true, source: "admin", selfChoice: null };
  assert.equal(hasSelfScreeningConfirmation(item), false);
  assert.equal(screeningConfirmationLabel(item), "미확인");
  assert.equal(hasSelfScreeningConfirmation(null), false);
});

test("admin override retains the original self confirmation", () => {
  const item = { screeningType: "employment", source: "admin", selfChoice: { screeningType: "nhis", confirmedAt: "2026-10-14T00:00:00Z", confirmedBy: "staff-original" } };
  assert.equal(hasSelfScreeningConfirmation(item), true);
  assert.equal(screeningConfirmationLabel(item), "확인 완료");
  assert.equal(screeningTypeLabel(item.screeningType), "채용검진");
  assert.equal(screeningTypeLabel(item.selfChoice.screeningType), "공단검진");
});

test("conflict errors retain status for explicit reconciliation", () => {
  const error = new HealthScreeningTypeError("최신 내용 다시 확인", 409);
  assert.ok(error instanceof Error);
  assert.equal(error.status, 409);
});
