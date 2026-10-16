import { WorkspaceShell } from "./WorkspaceShell.jsx";
import { useLocation } from "react-router-dom";

const adminItems = [
  { id: "submissions", label: "제출·보고 관리", to: "/firebase-admin/submissions" },
  { id: "submission-status", label: "제출 현황", to: "/firebase-admin/submission-status" },
  { id: "staff-submission-status", label: "교직원 제출·이수 현황", to: "/firebase-admin/staff-submission-status" },
  { id: "training-reports", label: "법정의무연수 보고서", to: "/firebase-admin/training-reports" },
  { id: "trainings", label: "교직원 교육 관리", to: "/firebase-admin/trainings" },
  { id: "access-requests", label: "권한 신청", to: "/firebase-admin/access-requests" },
  { id: "users", label: "교직원 권한 관리", to: "/firebase-admin/users" },
  { id: "infections", label: "감염병 사례관리", to: "/firebase-admin/infections" },
];

export function AdminWorkspaceLayout(props) {
  const { pathname } = useLocation();
  const active = adminItems.find((item) => item.to === pathname || pathname.startsWith(item.to + "/"))?.id;
  const isDashboard = pathname === "/firebase-dashboard";
  return <WorkspaceShell {...props} sidebarLabel="관리자 업무" items={adminItems} active={active}
    backTo={isDashboard ? "/" : "/firebase-dashboard"}
    backLabel={isDashboard ? "포털로 돌아가기" : "관리자 화면으로"}
    showDashboardLink={!isDashboard} />;
}
