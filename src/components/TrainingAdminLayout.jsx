import { WorkspaceShell } from "./WorkspaceShell.jsx";

const root = "/firebase-admin/trainings";

export function TrainingAdminLayout({ displayName, title, description, active, eventId, guide, hasTopLevelAdminAccess = false, children }) {
  const eventRoot = eventId ? `${root}/${encodeURIComponent(eventId)}` : null;
  const links = [
    { id: "manage", label: "교직원 교육 관리", to: root },
    ...(eventRoot ? [
      { id: "targets", label: "대상자 관리", to: `${eventRoot}/targets` },
      { id: "qr", label: "교직원 교육 QR 출석체크", to: `${eventRoot}/qr` },
      { id: "attendance", label: "출석 현황", to: `${eventRoot}/attendance` },
      { id: "final-sheet", label: "연수등록부", to: `${eventRoot}/final-sheet` },
    ] : []),
  ];

  const contextualGuide = guide || (active === "qr" ? "trainingQr" : ["attendance", "final-sheet"].includes(active) ? "trainingAttendance" : "trainingManager");
  const activeLabel = links.find((link) => link.id === active)?.label || "교육 운영";
  const breadcrumbs = hasTopLevelAdminAccess
    ? [
      { label: "관리자 홈", to: "/firebase-dashboard" },
      { label: "교육·연수" },
      { label: "교육 운영", to: root },
      ...(active === "manage" ? [] : [{ label: activeLabel }]),
    ]
    : [
      { label: "교직원 교육센터", to: "/training" },
      { label: activeLabel },
    ];
  return <WorkspaceShell className="training-admin-surface" label="교직원 교육센터" title={title} description={description} displayName={displayName} guide={contextualGuide}
    sidebarLabel="교육연수" items={links} active={active} currentLabel={activeLabel} breadcrumbs={breadcrumbs}
    backTo={hasTopLevelAdminAccess ? "/firebase-dashboard" : "/training"}
    backLabel={hasTopLevelAdminAccess ? "관리자 홈으로" : "교육센터로 돌아가기"}
    showDashboardLink={hasTopLevelAdminAccess}>{children}</WorkspaceShell>;
}
