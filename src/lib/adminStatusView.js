const CPR_TRAINING_TASK_ID = "cpr-training-2026";
const TB_SCREENING_TASK_ID = "tb-screening-2026";

export const ADMIN_STATUS_VIEWS = Object.freeze({
  completion: {
    title: "업무별 완료 현황",
    description: "업무를 선택하여 대상 교직원의 최종 완료 상태를 확인합니다.",
    mode: "completion",
  },
  "cpr-completion": {
    title: "CPR 통합 완료 현황",
    description: "학교 단체교육과 외부·개별 이수 근거를 합산한 CPR 최종 이수 상태입니다.",
    mode: "completion",
    taskId: CPR_TRAINING_TASK_ID,
  },
  "tb-completion": {
    title: "결핵검진 완료 현황",
    description: "검진 경로와 확인자료 검토 결과를 반영한 결핵검진 최종 완료 상태입니다.",
    mode: "completion",
    taskId: TB_SCREENING_TASK_ID,
  },
  "screening-types": {
    title: "건강검진 유형·경로 확인",
    description: "교직원의 연도별 건강검진 유형과 확인 근거를 관리합니다.",
    mode: "screening",
  },
  "research-check": {
    title: "연구부 연수 원본 점검",
    description: "연구부 연수 원본을 확인하고 현재 이수 현황에 반영합니다.",
    mode: "research",
  },
  "training-exceptions": {
    title: "법정의무연수 예외 관리",
    description: "원본 자료로만 인정할 법정의무연수 예외 항목을 관리합니다.",
    mode: "exceptions",
  },
});

const LEGACY_HASH_VIEWS = Object.freeze({
  "#annual-screening-type": "screening-types",
  "#training-source-check": "research-check",
  "#training-source-refresh": "research-check",
  "#legal-training-exceptions": "training-exceptions",
});

export function resolveAdminStatusView({ search = "", hash = "" } = {}) {
  const params = new URLSearchParams(search);
  const requested = params.get("view");
  if (requested && ADMIN_STATUS_VIEWS[requested]) return { id: requested, ...ADMIN_STATUS_VIEWS[requested] };
  if (LEGACY_HASH_VIEWS[hash]) {
    const id = LEGACY_HASH_VIEWS[hash];
    return { id, ...ADMIN_STATUS_VIEWS[id] };
  }
  const taskId = params.get("task");
  if (taskId === CPR_TRAINING_TASK_ID) return { id: "cpr-completion", ...ADMIN_STATUS_VIEWS["cpr-completion"] };
  if (taskId === TB_SCREENING_TASK_ID) return { id: "tb-completion", ...ADMIN_STATUS_VIEWS["tb-completion"] };
  return { id: "completion", ...ADMIN_STATUS_VIEWS.completion };
}
