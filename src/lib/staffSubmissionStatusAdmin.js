import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { db } from "./firebase.js";
import {
  STAFF_STATUS_LABELS,
  STAFF_STATUS_TASK_IDS,
  getStaffStatusLabel,
} from "./staffSubmissionStatus.js";

const ASSIGNMENT_LIMIT = 500;
const STATUS_ORDER = {
  incomplete: 10,
  unknown: 20,
  pending: 30,
  completed: 40,
  not_applicable: 50,
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
    statusLabel: getStaffStatusLabel(status),
    sourceType: data.sourceType || "",
    syncedAt: data.syncedAt || null,
  };
}

function countStatuses(items) {
  return items.reduce(
    (summary, item) => ({
      ...summary,
      [item.status]: (summary[item.status] || 0) + 1,
    }),
    { completed: 0, incomplete: 0, pending: 0, unknown: 0, not_applicable: 0 }
  );
}

function normalizeDirectoryItem(documentSnapshot) {
  const data = documentSnapshot.data();
  return {
    staffId: normalizeText(data.staffId),
    realName: normalizeText(data.realName || data.applicant?.realName),
    department: normalizeText(data.department || data.applicant?.department),
    position: normalizeText(data.position),
  };
}

async function getCurrentAssignmentDirectory() {
  try {
    const assignmentSnapshot = await getDocs(
      query(
        collection(db, "user_assignments"),
        where("schoolYear", "==", CURRENT_SCHOOL_YEAR),
        where("semester", "==", CURRENT_SEMESTER),
        where("active", "==", true),
        limit(ASSIGNMENT_LIMIT)
      )
    );

    const directory = new Map();
    assignmentSnapshot.docs.map(normalizeDirectoryItem).forEach((item) => {
      if (item.staffId) directory.set(item.staffId, item);
    });

    return { directory, status: "success" };
  } catch (error) {
    return {
      directory: new Map(),
      status: error?.code === "permission-denied" ? "permission-denied" : "error",
    };
  }
}

function decorateStatus(statusItem, directory) {
  const directoryItem = directory.get(statusItem.staffId) || null;
  const hasDirectory = Boolean(directoryItem?.realName || directoryItem?.department || directoryItem?.position);
  return {
    ...statusItem,
    realName: directoryItem?.realName || "",
    department: directoryItem?.department || "",
    position: directoryItem?.position || "",
    hasDirectory,
  };
}

function sortStatusItems(left, right) {
  const statusCompare = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
  if (statusCompare !== 0) return statusCompare;

  const departmentCompare = left.department.localeCompare(right.department, "ko");
  if (departmentCompare !== 0) return departmentCompare;

  const nameCompare = left.realName.localeCompare(right.realName, "ko");
  if (nameCompare !== 0) return nameCompare;

  return left.staffId.localeCompare(right.staffId, "ko");
}

export async function getAdminStaffSubmissionStatusOverview() {
  const taskIdSet = new Set(STAFF_STATUS_TASK_IDS);
  const taskSnapshot = await getDocs(collection(db, "staff_submission_tasks"));
  const tasks = taskSnapshot.docs
    .map(normalizeTask)
    .filter((task) => task.enabled && taskIdSet.has(task.taskId))
    .sort((left, right) => {
      if (left.order !== right.order) return left.order - right.order;
      return left.title.localeCompare(right.title, "ko");
    });

  const [directoryResult, ...statusSnapshots] = await Promise.all([
    getCurrentAssignmentDirectory(),
    ...tasks.map((task) =>
      getDocs(query(collection(db, "staff_submission_status"), where("taskId", "==", task.taskId)))
    ),
  ]);

  const taskSummaries = tasks.map((task, index) => {
    const items = statusSnapshots[index].docs
      .map(normalizeStatus)
      .filter((item) => item.taskId === task.taskId)
      .map((item) => decorateStatus(item, directoryResult.directory))
      .sort(sortStatusItems);
    const summary = countStatuses(items);

    return {
      ...task,
      items,
      summary: {
        ...summary,
        total: items.length,
        directoryLinked: items.filter((item) => item.hasDirectory).length,
      },
    };
  });

  return {
    tasks: taskSummaries,
    directoryStatus: directoryResult.status,
  };
}
