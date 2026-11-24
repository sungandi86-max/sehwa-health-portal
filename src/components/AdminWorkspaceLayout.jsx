import { WorkspaceShell } from "./WorkspaceShell.jsx";
import { useLocation } from "react-router-dom";
import { ADMIN_HOME, ADMIN_NAV_GROUPS, getActiveAdminNavigation, getAdminBreadcrumbs } from "../data/adminNavigation.js";

export function AdminWorkspaceLayout(props) {
  const location = useLocation();
  const active = getActiveAdminNavigation(location);
  const isDashboard = location.pathname === "/firebase-dashboard";
  return <WorkspaceShell {...props} sidebarLabel="관리자 업무" groups={ADMIN_NAV_GROUPS} homeItem={ADMIN_HOME}
    active={active.itemId} activeGroup={active.groupId} currentGroupLabel={active.groupLabel} currentLabel={active.itemLabel} breadcrumbs={getAdminBreadcrumbs(location)}
    backTo={isDashboard ? "/" : "/firebase-dashboard"}
    backLabel={isDashboard ? "포털로 돌아가기" : "관리자 화면으로"}
    showDashboardLink={!isDashboard} />;
}
