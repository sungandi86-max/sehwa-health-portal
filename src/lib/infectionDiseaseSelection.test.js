import assert from "node:assert/strict";
import test from "node:test";
import {
  INFECTION_DISEASE_OPTIONS,
  resolveInfectionDiseaseName,
  validateInfectionDiseaseSelection,
  validateResolvedInfectionDiseaseName,
} from "./infectionDiseaseSelection.js";

test("infection disease options match the Sheet statistics labels", () => {
  assert.deepEqual(INFECTION_DISEASE_OPTIONS, ["코로나19", "인플루엔자", "수두", "장염", "기타"]);
});

test("infection disease selection is required", () => {
  assert.equal(
    validateInfectionDiseaseSelection({ selectedDisease: "", otherDiseaseName: "" }),
    "감염병을 선택해 주세요."
  );
});

for (const diseaseName of ["코로나19", "인플루엔자", "수두", "장염"]) {
  test(`${diseaseName} selection resolves to the exact standard label`, () => {
    assert.equal(validateInfectionDiseaseSelection({ selectedDisease: diseaseName }), "");
    assert.equal(resolveInfectionDiseaseName({ selectedDisease: diseaseName }), diseaseName);
  });
}

test("other disease selection trims and resolves the entered disease name", () => {
  const selection = { selectedDisease: "기타", otherDiseaseName: "  유행성이하선염  " };
  assert.equal(validateInfectionDiseaseSelection(selection), "");
  assert.equal(resolveInfectionDiseaseName(selection), "유행성이하선염");
});

test("other disease selection rejects whitespace-only input", () => {
  assert.equal(
    validateInfectionDiseaseSelection({ selectedDisease: "기타", otherDiseaseName: "   " }),
    "감염병명을 입력해 주세요."
  );
});

test("other disease selection enforces the input length limit", () => {
  assert.equal(
    validateInfectionDiseaseSelection({ selectedDisease: "기타", otherDiseaseName: "가".repeat(51) }),
    "감염병명은 50자 이하로 입력해 주세요."
  );
});

test("changing from other to a standard disease excludes the prior custom value", () => {
  assert.equal(
    resolveInfectionDiseaseName({ selectedDisease: "코로나19", otherDiseaseName: "유행성이하선염" }),
    "코로나19"
  );
});

test("the storage boundary rejects the category label as a disease name", () => {
  assert.equal(validateResolvedInfectionDiseaseName("기타"), "감염병명을 입력해 주세요.");
});
