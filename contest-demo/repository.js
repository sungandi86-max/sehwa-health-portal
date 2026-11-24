import { deriveHealthCheckProgress } from "../src/lib/healthCheckPublicSchedule.js";

export const STAFF = Array.from({ length: 12 }, (_, index) => ({
  id: `demo-${index + 1}`,
  name: `가상 교직원 ${String(index + 1).padStart(2, "0")}`,
  department: ["교무부", "학년부", "보건실", "연구부"][index % 4],
  classId: index >= 4 && index <= 8 ? `2학년 ${index - 2}반` : index === 1 ? "2학년 1반" : "",
}));

export const ROLES = {
  staff: { label: "일반 교직원", member: STAFF[0], home: "/" },
  homeroom: { label: "담임교사", member: STAFF[1], home: "/" },
  health_teacher: { label: "보건교사", member: STAFF[2], home: "/firebase-dashboard" },
  training_admin: { label: "연구부 연수 담당자", member: STAFF[3], home: "/firebase-admin/trainings" },
};

const EXAM_DAY = "2026-11-26";
const INITIAL_UPDATE = `${EXAM_DAY}T09:15:00+09:00`;
export const EXAM_SESSION_ID = "demo-checkup";
export const EVIDENCE_TITLE = "개별 건강검진 확인자료 제출";
export const TRAINING_TITLE = "법정의무연수";

function evidence(id, submittedAt) {
  return { filename: `가상-검진확인서-${id}.pdf`, submittedAt };
}

export function initialSchedule() {
  return {
    session: {
      sessionId: EXAM_SESSION_ID,
      examType: "urine",
      examDate: EXAM_DAY,
      location: "가상 본관 1층 검사실",
      status: "inProgress",
      updatedAt: INITIAL_UPDATE,
    },
    classes: Array.from({ length: 6 }, (_, index) => ({
      classId: `2학년 ${index + 1}반`,
      order: index + 1,
      scheduledTime: ["09:00", "09:15", "09:30", "09:45", "10:00", "10:15"][index],
      displayStatus: ["completed", "active"][index] || "waiting",
      updatedAt: INITIAL_UPDATE,
    })),
  };
}

export function initialDemo() {
  return {
    submissions: Object.fromEntries(STAFF.filter((_, i) => i % 3 !== 0)
      .map(({ id }) => [id, evidence(id, "2026-11-25T14:20:00+09:00")])),
    cpr: Object.fromEntries(STAFF.map(({ id }, i) => [id, ["학교 단체교육", "개별 이수증", null][i % 3]])),
    legal: Object.fromEntries(STAFF.map(({ id }, i) => [id, i % 4 !== 0])),
    schedule: initialSchedule(),
  };
}

function advanceSchedule(schedule) {
  const { current, next } = deriveHealthCheckProgress(schedule.classes);
  if (!current) return schedule;
  const updatedAt = new Date(Date.parse(schedule.session.updatedAt) + 60_000).toISOString();
  return {
    session: { ...schedule.session, updatedAt, status: next ? "inProgress" : "completed" },
    classes: schedule.classes.map((item) => {
      if (item.classId === current.classId) return { ...item, displayStatus: "completed", updatedAt };
      if (item.classId === next?.classId) return { ...item, displayStatus: "active", updatedAt };
      return item;
    }),
  };
}

export function updateDemo(state, action) {
  switch (action.type) {
    case "submit":
      return { ...state, submissions: { ...state.submissions, [action.id]: evidence(action.id, action.at) } };
    case "toggleSubmission": {
      const submissions = { ...state.submissions };
      if (submissions[action.id]) delete submissions[action.id];
      else submissions[action.id] = evidence(action.id, action.at);
      return { ...state, submissions };
    }
    case "toggleCpr":
      return { ...state, cpr: { ...state.cpr, [action.id]: state.cpr[action.id] ? null : "학교 단체교육" } };
    case "toggleLegal":
      return { ...state, legal: { ...state.legal, [action.id]: !state.legal[action.id] } };
    case "advance":
      return { ...state, schedule: advanceSchedule(state.schedule) };
    case "resetSchedule":
      return { ...state, schedule: initialSchedule() };
    case "reset":
      return initialDemo();
    default:
      return state;
  }
}
