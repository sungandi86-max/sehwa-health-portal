export const INDIVIDUAL_HEALTH_CHECKUP_TITLE = "개별 건강검진 확인서 제출";

export const INDIVIDUAL_HEALTH_CHECKUP_DESCRIPTION =
  "학교 단체검진 외에 개별적으로 건강검진을 받은 경우 확인 가능한 자료를 제출합니다.";

export const INDIVIDUAL_HEALTH_CHECKUP_TARGET =
  "개별 건강검진 또는 국민건강보험공단 건강검진을 받은 교직원";

export const INDIVIDUAL_HEALTH_CHECKUP_DOCUMENT_GUIDE =
  "개별 병·의원 검진: 검진 날짜와 의료기관명이 확인되는 페이지\n국민건강보험공단 검진: 국민건강보험공단에서 발급한 건강검진확인서";

export const INDIVIDUAL_HEALTH_CHECKUP_PRIVACY_GUIDE =
  "검진 여부 확인에 필요한 최소 정보만 제출해 주세요. 검사 결과 수치 등 불필요한 건강정보는 제출하지 마세요.";

export const INDIVIDUAL_HEALTH_CHECKUP_BUTTON_LABEL = "확인서 제출";

export const INDIVIDUAL_HEALTH_CHECKUP_UPLOAD_BUTTON_LABEL = "확인서 업로드하기";

export const INDIVIDUAL_HEALTH_CHECKUP_FORM_GUIDE =
  "개별 병·의원 검진은 검진 날짜와 의료기관명이 확인되는 페이지만, 국민건강보험공단 검진은 공단에서 발급한 건강검진확인서를 제출해 주세요.";

export const INDIVIDUAL_HEALTH_CHECKUP_DOCUMENT_OPTIONS = [
  { value: "결핵검진 확인증", label: "개별 병·의원 검진" },
  { value: "흉부 X-ray 확인 자료", label: "국민건강보험공단 검진" },
];

export function applyIndividualHealthCheckupDisplay(item) {
  return {
    ...item,
    title: INDIVIDUAL_HEALTH_CHECKUP_TITLE,
    description: INDIVIDUAL_HEALTH_CHECKUP_DESCRIPTION,
    target: INDIVIDUAL_HEALTH_CHECKUP_TARGET,
    documentType: INDIVIDUAL_HEALTH_CHECKUP_DOCUMENT_GUIDE,
    guideText: INDIVIDUAL_HEALTH_CHECKUP_PRIVACY_GUIDE,
    buttonLabel: INDIVIDUAL_HEALTH_CHECKUP_BUTTON_LABEL,
    buttonText: INDIVIDUAL_HEALTH_CHECKUP_BUTTON_LABEL,
  };
}
