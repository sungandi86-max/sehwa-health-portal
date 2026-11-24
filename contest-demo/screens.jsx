import { useState } from "react";
import { Link } from "react-router-dom";
import { AppCard, Badge, SectionTitle } from "../src/components/ui.jsx";
import HealthCheckLiveView from "../src/components/HealthCheckLiveView.jsx";
import { EVIDENCE_TITLE, EXAM_SESSION_ID, STAFF, TRAINING_TITLE } from "./repository.js";

export const LIVE = "/firebase-checkups/live";
export const CHECKUPS = "/firebase-checkups";
export const SUBMIT = "/firebase-submissions";

const timestamp = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul",
});

function Status({ done, yes, no }) {
  return <Badge type={done ? "green" : "pink"}>{done ? yes : no}</Badge>;
}

export function ActionLink({ to, children }) {
  return <Link className="demo-button" to={to}>{children}</Link>;
}

export function StaffHome({ role, state }) {
  const submitted = Boolean(state.submissions[role.member.id]);
  return <div className="demo-cards">
    <AppCard>
      <SectionTitle title="나의 제출 현황" description={EVIDENCE_TITLE} />
      <Status done={submitted} yes="제출 완료" no="미제출" />
      <div><ActionLink to={SUBMIT}>제출·보고 센터</ActionLink></div>
    </AppCard>
    <AppCard>
      <SectionTitle title="검진·검사 안내" description="교직원 검진 확인자료와 학급별 별도검사 일정을 확인합니다." />
      <ActionLink to={CHECKUPS}>검진 안내 보기</ActionLink>
    </AppCard>
    {role.member.classId && <AppCard>
      <SectionTitle title="담당 학급" description={role.member.classId} />
      <ActionLink to={LIVE}>학급별 검사 일정 보기</ActionLink>
    </AppCard>}
  </div>;
}

export function Checkups({ state }) {
  return <div className="demo-cards">
    <AppCard>
      <SectionTitle title="교직원 건강검진 확인자료" description="개별 검진을 받은 가상 교직원은 제출·보고 센터에서 확인자료를 제출합니다." />
      <ActionLink to={SUBMIT}>제출할 자료 확인</ActionLink>
    </AppCard>
    <AppCard>
      <SectionTitle title="별도검사 일정·진행 현황" description={`${state.schedule.session.examDate} · ${state.schedule.session.location}`} />
      <ActionLink to={LIVE}>학급별 일정 보기</ActionLink>
    </AppCard>
  </div>;
}

export function Submission({ state, role, dispatch }) {
  const id = role.member.id;
  const submission = state.submissions[id];
  return <AppCard>
    <SectionTitle title={EVIDENCE_TITLE} description="가상 PDF를 사용해 확인자료 접수 흐름을 체험합니다." />
    <div role="status">
      <Status done={Boolean(submission)} yes="제출 완료" no="미제출" />
      {submission && <div className="demo-evidence">
        <strong>{submission.filename}</strong>
        <time dateTime={submission.submittedAt}>{timestamp.format(new Date(submission.submittedAt))}</time>
      </div>}
    </div>
    <button className="demo-button demo-primary" disabled={Boolean(submission)}
      onClick={() => dispatch({ type: "submit", id, at: new Date().toISOString() })}>가상 확인자료 제출</button>
  </AppCard>;
}

export function AdminHome({ groups }) {
  return <div className="demo-cards">
    {groups.map((group) => <AppCard key={group.id}>
      <SectionTitle title={group.label} />
      <ul className="demo-links">
        {group.items.map((item) => <li key={item.id}><ActionLink to={item.to}>{item.label}</ActionLink></li>)}
      </ul>
    </AppCard>)}
  </div>;
}

function Roster({ title, rows, count, label }) {
  return <AppCard>
    <SectionTitle title={title} description={`전체 ${STAFF.length}명 중 ${label} ${count}명`} />
    <ul className="demo-roster" aria-label={title}>
      {rows.map(({ member, status, detail }) => <li key={member.id}>
        <div><strong>{member.name}</strong><p>{member.department}</p></div>
        <div className="demo-row-state">{status}</div>
        {detail && <div className="demo-evidence">{detail}</div>}
      </li>)}
    </ul>
  </AppCard>;
}

export function AdminSubmissions({ state, screenId }) {
  const receiptsOnly = screenId === "submissions";
  const rows = STAFF.filter(({ id }) => !receiptsOnly || state.submissions[id]).map((member) => {
    const record = state.submissions[member.id];
    return {
      member,
      status: <Status done={Boolean(record)} yes="제출 완료" no="미제출" />,
      detail: record && <><strong>{record.filename}</strong><time dateTime={record.submittedAt}>{timestamp.format(new Date(record.submittedAt))}</time></>,
    };
  });
  return <Roster title={EVIDENCE_TITLE} rows={rows} count={Object.keys(state.submissions).length} label="제출" />;
}

export function CompletionSummary({ state }) {
  const tasks = [
    [EVIDENCE_TITLE, Object.keys(state.submissions).length],
    ["CPR", Object.values(state.cpr).filter(Boolean).length],
    [TRAINING_TITLE, Object.values(state.legal).filter(Boolean).length],
  ];
  return <div className="demo-cards">
    {tasks.map(([label, count]) => <AppCard key={label}>
      <SectionTitle title={label} description={`전체 ${STAFF.length}명 중 ${count}명 완료`} />
      <Badge type="green">{count}명 완료</Badge>{" "}<Badge type="pink">{STAFF.length - count}명 미완료</Badge>
    </AppCard>)}
  </div>;
}

export function Training({ state, screenId, reportTo }) {
  const isCpr = screenId === "cpr-completion";
  const isSource = screenId === "research-check";
  const entries = isCpr ? state.cpr : state.legal;
  const rows = STAFF.map((member) => ({
    member,
    status: <Status done={Boolean(entries[member.id])} yes={isCpr ? "완료" : "이수"} no={isSource ? "원본 누락" : isCpr ? "미완료" : "미이수"} />,
    detail: isCpr ? entries[member.id] : isSource ? (entries[member.id] ? "가상 연구부 원본에 기록 있음" : "가상 연구부 원본에서 확인 필요") : null,
  }));
  return <div className="space-y-3">
    {isSource && <AppCard>
      <p>재직 대상자 12명과 가상 연구부 원본을 대조합니다.</p>
      <ActionLink to={reportTo}>법정의무연수 보고서 열기</ActionLink>
    </AppCard>}
    <Roster title={isCpr ? "교직원별 CPR 이수 상태" : TRAINING_TITLE}
      rows={rows} count={Object.values(entries).filter(Boolean).length} label="이수" />
  </div>;
}

export function EducationManager({ state }) {
  const attendees = STAFF.filter(({ id }) => state.cpr[id] === "학교 단체교육");
  return <AppCard>
    <SectionTitle title="심폐소생술 학교 단체교육" description="2026년 11월 18일 · 가상 교내 연수실" />
    <Badge>담당 교육</Badge>
    <p className="mt-3 text-sm">가상 출석 기록 {attendees.length}명</p>
    <ul className="demo-roster" aria-label="담당 교육 출석 기록">
      {attendees.map(({ id, name }) => <li key={id}><strong>{name}</strong><Badge type="green">출석</Badge></li>)}
    </ul>
  </AppCard>;
}

const ready = { status: "ready" };
const demoClock = new Date("2026-11-26T09:15:00+09:00");
export function LiveSchedule({ state }) {
  const [refreshMessage, setRefreshMessage] = useState("");
  return <>
    <p className="demo-note" role="status">{refreshMessage || "시연 제어에서 학급을 진행하면 이 탭의 시간표가 즉시 갱신됩니다."}</p>
    <HealthCheckLiveView sessions={[state.schedule.session]} selectedSessionId={EXAM_SESSION_ID}
      onSelectSession={() => {}} classes={state.schedule.classes} sessionState={ready}
      classState={ready} now={demoClock} onRefresh={() => setRefreshMessage("이 탭의 가상 일정 상태를 다시 표시했습니다.")} />
  </>;
}
