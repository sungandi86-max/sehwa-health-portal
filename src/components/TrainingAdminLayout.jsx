import { WorkspaceShell } from "./WorkspaceShell.jsx";

const root = "/firebase-admin/trainings";

export function TrainingAdminLayout({ displayName, title, description, active, eventId, children }) {
  const eventRoot = eventId ? `${root}/${encodeURIComponent(eventId)}` : null;
  const links = [
    { id: "manage", label: "연수 운영관리", to: root },
    ...(eventRoot ? [
      { id: "targets", label: "대상자 관리", to: `${eventRoot}/targets` },
      { id: "qr", label: "교직원 교육 QR 출석체크", to: `${eventRoot}/qr` },
      { id: "attendance", label: "출석 현황", to: `${eventRoot}/attendance` },
      { id: "final-sheet", label: "연수등록부", to: `${eventRoot}/final-sheet` },
    ] : []),
  ];

  return <WorkspaceShell className="training-admin-surface" label="교직원 교육센터" title={title} description={description} displayName={displayName}
    sidebarLabel="교육연수" items={links} active={active} backTo="/training" backLabel="교육센터로 돌아가기">{children}</WorkspaceShell>;
}
