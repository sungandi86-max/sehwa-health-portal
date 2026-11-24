import { useEffect, useReducer, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, ClipboardCheck, GraduationCap, HeartPulse, SlidersHorizontal } from "lucide-react";
import { WorkspaceShell } from "../src/components/WorkspaceShell.jsx";
import { ADMIN_HOME, ADMIN_NAV_GROUPS } from "../src/data/adminNavigation.js";
import { ROLES, STAFF, initialDemo, updateDemo } from "./repository.js";
import {
  LIVE, CHECKUPS, SUBMIT, StaffHome, Checkups, Submission, AdminHome,
  AdminSubmissions, CompletionSummary, Training, EducationManager, LiveSchedule,
} from "./screens.jsx";
import "../src/index.css";
import "./style.css";

const portalItems = [
  { id: "home", label: "온라인 보건실 홈", to: "/" },
  { id: "checkups", label: "검진·검사 안내", to: CHECKUPS, component: Checkups },
  { id: "submission", label: "제출·보고 센터", to: SUBMIT, component: Submission },
  { id: "live", label: "별도검사 일정·진행 현황", to: LIVE, component: LiveSchedule },
];

const demoAdminScreens = {
  submissions: AdminSubmissions,
  "submission-status": AdminSubmissions,
  "completion-status": CompletionSummary,
  "cpr-completion": Training,
  "research-check": Training,
  "training-reports": Training,
};
const adminGroups = ADMIN_NAV_GROUPS.flatMap((group) => {
  const items = group.items.filter(({ id }) => demoAdminScreens[id])
    .map(({ id, label, to }) => ({ id, label, to, component: demoAdminScreens[id] }));
  return items.length ? [{ ...group, items }] : [];
});
const adminItems = adminGroups.flatMap((group) => group.items.map((item) => ({ ...item, group })));
const reportTo = adminItems.find(({ id }) => id === "training-reports").to;

const educationItem = { id: "education", label: "교직원 교육 관리", to: ROLES.training_admin.home, component: EducationManager };
const adminHome = { ...ADMIN_HOME, component: AdminHome };
const scenarios = [
  { label: "A · 교직원 제출", icon: ClipboardCheck, role: "staff", to: "/" },
  { label: "B · 관리자 제출 현황", icon: ClipboardCheck, role: "health_teacher", to: ADMIN_HOME.to },
  { label: "C · 교육·연수", icon: GraduationCap, role: "health_teacher", to: adminItems.find(({ id }) => id === "cpr-completion").to },
  { label: "D · 별도검사 진행", icon: CalendarDays, role: "homeroom", to: LIVE },
];

function selectScreen(roleKey, location) {
  const path = location.pathname + location.search;
  if (roleKey === "health_teacher") return [adminHome, ...adminItems].find(({ to }) => to.split("#")[0] === path);
  if (roleKey === "training_admin") return educationItem.to === path ? educationItem : null;
  return portalItems.find(({ to }) => to === path);
}

function PresenterControls({ roleKey, state, dispatch, switchRole, reset }) {
  const dialog = useRef(null);
  const [memberId, setMemberId] = useState(STAFF[0].id);
  const [feedback, setFeedback] = useState("");
  function apply(type, message) {
    dispatch({ type, id: memberId, at: new Date().toISOString() });
    setFeedback(message);
  }
  function jump(role, to) {
    switchRole(role, to);
    setFeedback("");
    dialog.current.close();
  }
  return <>
    <button type="button" className="demo-button demo-presenter" onClick={() => dialog.current.showModal()}>
      <SlidersHorizontal size={18} aria-hidden="true" /> 시연 제어
    </button>
    <dialog ref={dialog} aria-labelledby="presenter-title" className="demo-dialog">
      <div className="demo-dialog-head">
        <h2 id="presenter-title">공모전 시연 제어</h2>
        <button type="button" className="demo-button" onClick={() => dialog.current.close()}>닫기</button>
      </div>
      <p>이 탭의 가상 업무 상태를 조작합니다.</p>
      <label className="demo-field">가상 역할 전환
        <select value={roleKey} onChange={(event) => jump(event.target.value)}>
          {Object.entries(ROLES).map(([key, role]) => <option key={key} value={key}>{role.label}</option>)}
        </select>
      </label>
      <div className="demo-controls">
        {scenarios.map(({ label, icon: Icon, role, to }) => <button type="button" className="demo-button" key={label}
          onClick={() => jump(role, to)}><Icon size={16} aria-hidden="true" />{label}</button>)}
      </div>
      <label className="demo-field">상태 변경 대상
        <select value={memberId} onChange={(event) => { setMemberId(event.target.value); setFeedback(""); }}>
          {STAFF.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <div className="demo-controls">
        <button className="demo-button" onClick={() => apply("toggleSubmission", "가상 제출 상태가 변경되었습니다.")}>
          {state.submissions[memberId] ? "가상 제출 취소" : "가상 제출 완료"}
        </button>
        <button className="demo-button" onClick={() => apply("toggleCpr", "가상 CPR 이수 상태가 변경되었습니다.")}>
          {state.cpr[memberId] ? "CPR 미완료로 변경" : "CPR 완료로 변경"}
        </button>
        <button className="demo-button" onClick={() => apply("toggleLegal", "가상 법정의무연수 이수 상태가 변경되었습니다.")}>
          {state.legal[memberId] ? "법정연수 미이수로 변경" : "법정연수 이수로 변경"}
        </button>
        <button className="demo-button" onClick={() => apply("advance", "가상 학급 진행 상태를 갱신했습니다.")}
          disabled={state.schedule.session.status === "completed"}>다음 학급 진행</button>
        <button className="demo-button" onClick={() => apply("resetSchedule", "가상 검사를 초기화했습니다.")}>가상 검사 초기화</button>
        <button className="demo-button demo-reset" onClick={() => { reset(); setMemberId(STAFF[0].id); setFeedback("전체 데모를 초기화했습니다."); }}>전체 데모 데이터 초기화</button>
      </div>
      <p role="status" className="demo-feedback">{feedback}</p>
    </dialog>
  </>;
}

function App() {
  const [state, dispatch] = useReducer(updateDemo, undefined, initialDemo);
  const [roleKey, setRole] = useState("staff");
  const role = ROLES[roleKey];
  const location = useLocation();
  const navigate = useNavigate();
  const active = selectScreen(roleKey, location);
  const activeId = active?.id;
  const isAdmin = roleKey === "health_teacher";
  const isTrainingManager = roleKey === "training_admin";
  const portalHome = activeId === "home";
  const title = active?.label || "이 역할에서 열 수 없는 화면";
  const Screen = portalHome ? StaffHome : active?.component;
  const sidebarLabel = isAdmin ? "관리자" : isTrainingManager ? "교육연수" : "교직원 포털";
  const homeLabel = isAdmin ? adminHome.label : isTrainingManager ? educationItem.label : portalItems[0].label;

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [location.pathname, location.search]);
  function switchRole(key, to = ROLES[key].home) {
    setRole(key);
    navigate(to);
  }
  function reset() {
    dispatch({ type: "reset" });
    setRole("staff");
    navigate("/", { replace: true });
  }

  const breadcrumbs = [
    ...(active?.to !== role.home ? [{ label: homeLabel, to: role.home }] : []),
    ...(active?.group ? [{ label: active.group.label }] : []),
    ...(activeId === "live" ? [{ label: "검진·검사 안내", to: CHECKUPS }] : []),
    { label: title },
  ];
  return <>
    <header className="demo-top">
      <div className="demo-top-inner">
        <Link to={role.home} className="demo-brand"><HeartPulse aria-hidden="true" size={22} />
          <span><strong>온라인 보건실</strong><small>School Health Hub</small></span>
        </Link>
        <p>공모전 시연용 · 모든 정보는 가상 데이터입니다.</p>
        <PresenterControls roleKey={roleKey} state={state} dispatch={dispatch} switchRole={switchRole} reset={reset} />
      </div>
    </header>
    <main>
      <WorkspaceShell label={sidebarLabel} title={title} displayName={role.member.name}
        description={activeId === "live" ? "학급별 예정 시간과 현재 진행 순서를 확인합니다." : role.label}
        sidebarLabel={sidebarLabel} items={isAdmin ? undefined : isTrainingManager ? [educationItem] : portalItems}
        groups={isAdmin ? adminGroups : undefined} homeItem={isAdmin ? adminHome : undefined}
        active={activeId} activeGroup={active?.group?.id} currentGroupLabel={active?.group?.label} currentLabel={title}
        breadcrumbs={breadcrumbs} backTo={role.home} backLabel={isAdmin ? "관리자 홈으로" : isTrainingManager ? "교직원 교육 관리로" : "온라인 보건실 홈으로"} showDashboardLink={false}>
        {Screen ? <Screen state={state} role={role} dispatch={dispatch} screenId={activeId} groups={adminGroups} reportTo={reportTo} />
          : <p>시연 제어에서 해당 역할을 선택하거나 현재 역할의 메뉴를 이용하세요.</p>}
      </WorkspaceShell>
    </main>
  </>;
}

createRoot(document.getElementById("root")).render(<BrowserRouter><App /></BrowserRouter>);
