const item = (id, label, to, options = {}) => ({ id, label, to, ...options });

export const ADMIN_HOME = item("dashboard", "관리자 홈", "/firebase-dashboard");

export const ADMIN_NAV_GROUPS = [
  {
    id: "review",
    label: "제출·검토",
    items: [
      item("submissions", "접수자료 검토", "/firebase-admin/submissions", {
        description: "실제 제출 문서와 첨부파일을 검토합니다.",
      }),
      item("submission-status", "대상자별 제출 현황", "/firebase-admin/submission-status", {
        description: "제출 대상자별 제출 여부를 확인합니다.",
      }),
      item("completion-status", "업무별 완료 현황", "/firebase-admin/staff-submission-status#completion-status", {
        description: "업무 기준 최종 완료 상태를 확인합니다.",
        matchTo: "/firebase-admin/staff-submission-status",
      }),
    ],
  },
  {
    id: "screening",
    label: "검진·검사",
    items: [
      item("screening-types", "건강검진 유형·경로 확인", "/firebase-admin/staff-submission-status#annual-screening-type"),
      item("tb-completion", "결핵검진 완료 현황", "/firebase-admin/staff-submission-status?task=tb-screening-2026#completion-status", {
        matchTo: "/firebase-admin/staff-submission-status?task=tb-screening-2026",
      }),
      item("screening-evidence", "검진 확인자료 접수", "/firebase-admin/submissions?tab=staff"),
      item("checkup-helper", "별도검사 운영 도우미", null, { planned: true, statusLabel: "연동 예정" }),
    ],
  },
  {
    id: "training",
    label: "교육·연수",
    items: [
      item("trainings", "교육 운영 관리", "/firebase-admin/trainings"),
      item("cpr-receipts", "CPR 개별 이수증 검토", "/firebase-admin/submission-status?item=cpr"),
      item("cpr-batch", "CPR 학교 단체교육 등록", "/firebase-admin/trainings?mode=manual-cpr-2026#manual-cpr-batch", {
        matchTo: "/firebase-admin/trainings?mode=manual-cpr-2026",
      }),
      item("cpr-completion", "CPR 통합 완료 현황", "/firebase-admin/staff-submission-status?task=cpr-training-2026#completion-status", {
        matchTo: "/firebase-admin/staff-submission-status?task=cpr-training-2026",
      }),
      item("research-check", "연구부 연수 원본 점검", "/firebase-admin/staff-submission-status#training-source-check"),
      item("research-refresh", "연수 현황 새로고침", "/firebase-admin/staff-submission-status#training-source-refresh"),
      item("training-exceptions", "법정의무연수 예외 관리", "/firebase-admin/staff-submission-status#legal-training-exceptions"),
      item("training-reports", "법정의무연수 보고서", "/firebase-admin/training-reports"),
    ],
  },
  {
    id: "accounts",
    label: "계정·권한",
    items: [
      item("access-requests", "권한 신청 처리", "/firebase-admin/access-requests"),
      item("users", "교직원 계정·권한 관리", "/firebase-admin/users"),
    ],
  },
  {
    id: "infections",
    label: "감염병",
    items: [
      item("infection-reports", "감염병 보고 접수", "/firebase-admin/submissions?tab=infection"),
      item("infections", "감염병 사례관리", "/firebase-admin/infections"),
    ],
  },
];

function parseDestination(to) {
  const url = new URL(to, "https://navigation.invalid");
  return { pathname: url.pathname, searchParams: url.searchParams, hash: url.hash };
}

function matchScore(navItem, location) {
  if (!navItem.to) return -1;
  const destination = parseDestination(navItem.matchTo || navItem.to);
  if (destination.pathname !== location.pathname) return -1;

  const currentParams = new URLSearchParams(location.search || "");
  for (const [key, value] of destination.searchParams.entries()) {
    if (currentParams.get(key) !== value) return -1;
  }
  if (destination.hash && destination.hash !== location.hash) return -1;

  return destination.searchParams.size * 10 + (destination.hash ? 5 : 0);
}

export function getActiveAdminNavigation(location) {
  if (location.pathname === ADMIN_HOME.to) {
    return { groupId: null, groupLabel: null, itemId: ADMIN_HOME.id, itemLabel: ADMIN_HOME.label };
  }

  let best = null;
  for (const group of ADMIN_NAV_GROUPS) {
    for (const navItem of group.items) {
      const score = matchScore(navItem, location);
      if (score < 0 || (best && best.score >= score)) continue;
      best = { score, groupId: group.id, groupLabel: group.label, itemId: navItem.id, itemLabel: navItem.label };
    }
  }
  return best || { groupId: null, groupLabel: null, itemId: null, itemLabel: null };
}

export function getAdminBreadcrumbs(location) {
  const active = getActiveAdminNavigation(location);
  if (active.itemId === ADMIN_HOME.id) return [{ label: ADMIN_HOME.label }];
  return [
    { label: ADMIN_HOME.label, to: ADMIN_HOME.to },
    ...(active.groupLabel ? [{ label: active.groupLabel }] : []),
    ...(active.itemLabel ? [{ label: active.itemLabel }] : []),
  ];
}
