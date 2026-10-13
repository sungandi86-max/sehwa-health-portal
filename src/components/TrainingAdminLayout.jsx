import { Link } from "react-router-dom";
import { FirebaseV2PageShell } from "./FirebaseV2PageShell.jsx";

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

  return <FirebaseV2PageShell className="training-admin-surface" label="교직원 교육센터" title={title} description={description} displayName={displayName}>
    <div className="training-admin-layout">
      <aside className="training-admin-sidebar" aria-label="교육연수 메뉴">
        <div className="training-admin-sidebar-heading">교육연수</div>
        <nav aria-label="교육연수 관리">
          {links.map((link) => <Link key={link.id} to={link.to} aria-current={active === link.id ? "page" : undefined}
            className={`training-admin-nav-link${active === link.id ? " is-active" : ""}`}>{link.label}</Link>)}
        </nav>
        <Link className="training-admin-back" to="/training">교육센터로 돌아가기</Link>
      </aside>
      <div className="training-admin-workspace">{children}</div>
    </div>
  </FirebaseV2PageShell>;
}
