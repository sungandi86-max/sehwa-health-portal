export const INFECTION_DISEASE_OPTIONS = ["코로나19", "인플루엔자", "수두", "장염", "기타"];

export const OTHER_INFECTION_DISEASE = "기타";
export const OTHER_DISEASE_NAME_MAX_LENGTH = 50;

export function resolveInfectionDiseaseName({ selectedDisease, otherDiseaseName = "" }) {
  if (selectedDisease === OTHER_INFECTION_DISEASE) return otherDiseaseName.trim();
  return INFECTION_DISEASE_OPTIONS.includes(selectedDisease) ? selectedDisease : "";
}

export function validateResolvedInfectionDiseaseName(diseaseName = "") {
  const trimmedName = diseaseName.trim();
  if (!trimmedName || trimmedName === OTHER_INFECTION_DISEASE) return "감염병명을 입력해 주세요.";
  if (trimmedName.length > OTHER_DISEASE_NAME_MAX_LENGTH) {
    return `감염병명은 ${OTHER_DISEASE_NAME_MAX_LENGTH}자 이하로 입력해 주세요.`;
  }
  return "";
}

export function validateInfectionDiseaseSelection({ selectedDisease, otherDiseaseName = "" }) {
  if (!INFECTION_DISEASE_OPTIONS.includes(selectedDisease)) return "감염병을 선택해 주세요.";
  if (selectedDisease !== OTHER_INFECTION_DISEASE) return "";
  return validateResolvedInfectionDiseaseName(otherDiseaseName);
}
