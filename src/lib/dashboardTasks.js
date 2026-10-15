export function getTbDashboardCounts(items = []) {
  return items.reduce(
    (counts, item) => {
      const workflow = item?.workflow || {};
      if (item?.screeningTypeConfirmed !== true) counts.routeUnconfirmed += 1;
      if ((workflow.evidence || []).some((evidence) => evidence?.reviewState === "pending" || evidence?.status === "pending")) {
        counts.evidencePending += 1;
      }
      if (workflow.completed !== true) counts.incomplete += 1;
      return counts;
    },
    { routeUnconfirmed: 0, evidencePending: 0, incomplete: 0 }
  );
}

export function buildDashboardTaskCards({ counts = {}, pendingAccessCount = null, tbCounts = null } = {}) {
  return [
    { id: "pending-submissions", label: "제출 확인 필요", count: Number(counts.pendingStaffCount || 0), href: "/firebase-admin/submissions?tab=staff&status=submitted" },
    { id: "pending-infections", label: "감염병 확인 필요", count: Number(counts.pendingInfectionCount || 0), href: "/firebase-admin/infections" },
    { id: "pending-access", label: "권한 신청", count: Number.isFinite(pendingAccessCount) ? pendingAccessCount : null, href: "/firebase-admin/access-requests" },
    { id: "tb-route-unconfirmed", label: "결핵검진 경로 미확인", count: tbCounts ? Number(tbCounts.routeUnconfirmed || 0) : null, href: "/firebase-admin/staff-submission-status#annual-screening-type" },
    { id: "tb-evidence-pending", label: "결핵검진 증빙 확인 필요", count: tbCounts ? Number(tbCounts.evidencePending || 0) : null, href: "/firebase-admin/staff-submission-status#annual-screening-type" },
    { id: "tb-incomplete", label: "결핵검진 미완료", count: tbCounts ? Number(tbCounts.incomplete || 0) : null, href: "/firebase-admin/staff-submission-status" },
  ];
}
