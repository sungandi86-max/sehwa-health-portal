import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase.js";

export const STAFF_STATUS_TASK_IDS = ["tb-screening-2026", "cpr-training-2026"];

export const STAFF_STATUS_LABELS = {
  incomplete: "미완료",
  pending: "확인중",
  unknown: "상태 확인 필요",
  completed: "완료",
  not_applicable: "해당없음",
};

const STATUS_ORDER = {
  incomplete: 10,
  pending: 20,
  unknown: 30,
  completed: 40,
  not_applicable: 50,
};

const HOURLY_INSTRUCTOR_POSITIONS = new Set(["강사", "시간강사"]);

const TASK_ACTIONS = {
  "tb-screening-2026": {
    href: "/checkup",
    label: "검진·검사 안내 보기",
  },
  "cpr-training-2026": {
    href: "/firebase-submit/cpr",
    label: "이수증 제출",
  },
};

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeTask(documentSnapshot) {
  const data = documentSnapshot.data();
  return {
    taskId: data.taskId || documentSnapshot.id,
    title: data.title || documentSnapshot.id,
    description: data.description || "",
    category: data.category || "",
    sourceType: data.sourceType || "",
    enabled: data.enabled === true,
    order: Number.isFinite(Number(data.order)) ? Number(data.order) : 999,
  };
}

function normalizeStatus(documentSnapshot) {
  const data = documentSnapshot.data();
  const status = STAFF_STATUS_LABELS[data.status] ? data.status : "unknown";
  return {
    id: documentSnapshot.id,
    staffId: data.staffId || "",
    taskId: data.taskId || "",
    status,
    sourceType: data.sourceType || "",
    syncedAt: data.syncedAt || null,
  };
}

export function getStaffSubmissionStatusEligibility(assignment) {
  if (!assignment?.staffId) return { status: "needs-staff-id" };

  const position = normalizeText(assignment.position);
  if (HOURLY_INSTRUCTOR_POSITIONS.has(position)) return { status: "not-target" };

  return { status: "eligible" };
}

export function getStaffStatusLabel(status) {
  return STAFF_STATUS_LABELS[status] || STAFF_STATUS_LABELS.unknown;
}

export async function getMyStaffSubmissionStatus(staffId) {
  const taskIdSet = new Set(STAFF_STATUS_TASK_IDS);
  const [taskSnapshot, statusSnapshot] = await Promise.all([
    getDocs(collection(db, "staff_submission_tasks")),
    getDocs(query(collection(db, "staff_submission_status"), where("staffId", "==", staffId))),
  ]);

  const tasks = taskSnapshot.docs
    .map(normalizeTask)
    .filter((task) => task.enabled && taskIdSet.has(task.taskId))
    .sort((left, right) => {
      if (left.order !== right.order) return left.order - right.order;
      return left.title.localeCompare(right.title, "ko");
    });

  const statusByTaskId = new Map(
    statusSnapshot.docs
      .map(normalizeStatus)
      .filter((statusItem) => taskIdSet.has(statusItem.taskId))
      .map((statusItem) => [statusItem.taskId, statusItem])
  );

  const items = tasks
    .map((task) => {
      const statusItem = statusByTaskId.get(task.taskId);
      const status = statusItem?.status || "unknown";
      return {
        ...task,
        status,
        statusLabel: getStaffStatusLabel(status),
        action: TASK_ACTIONS[task.taskId] || null,
        syncedAt: statusItem?.syncedAt || null,
      };
    })
    .filter((item) => item.status !== "not_applicable")
    .sort((left, right) => {
      const statusCompare = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
      if (statusCompare !== 0) return statusCompare;
      if (left.order !== right.order) return left.order - right.order;
      return left.title.localeCompare(right.title, "ko");
    });

  return {
    items,
    summary: {
      incomplete: items.filter((item) => item.status === "incomplete").length,
      pending: items.filter((item) => item.status === "pending").length,
      unknown: items.filter((item) => item.status === "unknown").length,
      completed: items.filter((item) => item.status === "completed").length,
    },
  };
}
