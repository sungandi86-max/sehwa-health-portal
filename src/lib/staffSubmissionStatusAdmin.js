import { collection, doc, getDocs, limit, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { auth, db } from "./firebase.js";
import {
  HEALTH_MANDATORY_TRAINING_TASK_ID,
  STAFF_STATUS_LABELS,
  STAFF_STATUS_TASK_IDS,
  getStaffStatusLabel,
  TB_SCREENING_TASK_ID,
} from "./staffSubmissionStatus.js";
import { reconcileCurrentTaskStatusItems } from "./staffSubmissionStatusCurrentSummary.js";
import { buildTbAdminSummary, buildTbCurrentStaffItems, normalizeTbScreening } from "./tbScreeningStatusModel.js";
import { getTbAdminUpdate } from "./tbScreeningStatusModel.js";

const ASSIGNMENT_LIMIT = 500;
const STAFF_DIRECTORY_API = "/api/firebase/staff-directory";
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
    statusLabel: getStaffStatusLabel(status, data.taskId || ""),
    sourceType: data.sourceType || "",
    syncedAt: data.syncedAt || null,
    screening: normalizeTbScreening(data.screening),
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

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const millis = Date.parse(String(value));
  return Number.isFinite(millis) ? millis : 0;
}

function formatSyncedAt(value) {
  const millis = toMillis(value);
  if (!millis) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(millis));
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

function normalizeCanonicalDirectoryItem(item) {
  return {
    staffId: normalizeText(item?.staffId),
    realName: normalizeText(item?.name || item?.realName),
    department: normalizeText(item?.department),
    position: normalizeText(item?.position),
    target: normalizeText(item?.target),
    employmentStatus: normalizeText(item?.employmentStatus),
  };
}

async function getCanonicalStaffDirectory() {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return { directory: new Map(), status: "error" };
  }

  try {
    const idToken = await currentUser.getIdToken();
    const response = await fetch(STAFF_DIRECTORY_API, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      cache: "no-store",
    });
    const result = await response.json().catch(() => null);

    if (!response.ok || result?.ok !== true || !Array.isArray(result.directory)) {
      return {
        directory: new Map(),
        status: response.status === 403 ? "permission-denied" : "error",
      };
    }

    const directory = new Map();
    result.directory.map(normalizeCanonicalDirectoryItem).forEach((item) => {
      if (item.staffId) directory.set(item.staffId, item);
    });

    return { directory, status: "success" };
  } catch {
    return { directory: new Map(), status: "error" };
  }
}

async function getHealthMandatoryTrainingCurrentTargetStaffIds() {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("법정의무연수 현재 대상을 확인할 수 없습니다.");

  const idToken = await currentUser.getIdToken();
  const response = await fetch(`${STAFF_DIRECTORY_API}?resource=health-mandatory-training-current-targets`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    cache: "no-store",
  });
  const result = await response.json().catch(() => null);

  if (!response.ok || result?.ok !== true || !Array.isArray(result.currentTargetStaffIds)) {
    throw new Error("법정의무연수 현재 대상을 확인할 수 없습니다.");
  }

  return result.currentTargetStaffIds;
}

async function getHealthMandatoryTrainingCurrentTargetsResult(required) {
  if (!required) return { status: "not-required", staffIds: [] };

  try {
    const staffIds = await getHealthMandatoryTrainingCurrentTargetStaffIds();
    return { status: "success", staffIds };
  } catch {
    return { status: "error", staffIds: null };
  }
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

function decorateStatus(statusItem, directory, assignmentDirectory) {
  const directoryItem = directory.get(statusItem.staffId) || null;
  const assignmentItem = assignmentDirectory.get(statusItem.staffId) || null;
  const hasDirectory = Boolean(directoryItem?.realName || directoryItem?.department || directoryItem?.position);
  const displayItem = directoryItem || assignmentItem;
  return {
    ...statusItem,
    realName: displayItem?.realName || "",
    department: displayItem?.department || "",
    position: displayItem?.position || "",
    hasDirectory,
    hasDisplayIdentity: Boolean(displayItem?.realName || displayItem?.department || displayItem?.position),
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

  const hasHealthMandatoryTrainingTask = tasks.some((task) => task.taskId === HEALTH_MANDATORY_TRAINING_TASK_ID);
  const [directoryResult, assignmentDirectoryResult, currentTargetsResult, ...statusSnapshots] = await Promise.all([
    getCanonicalStaffDirectory(),
    getCurrentAssignmentDirectory(),
    getHealthMandatoryTrainingCurrentTargetsResult(hasHealthMandatoryTrainingTask),
    ...tasks.map((task) =>
      getDocs(query(collection(db, "staff_submission_status"), where("taskId", "==", task.taskId)))
    ),
  ]);

  const taskSummaries = tasks.flatMap((task, index) => {
    if (task.taskId === HEALTH_MANDATORY_TRAINING_TASK_ID && currentTargetsResult.status !== "success") {
      return [];
    }

    const allItems = statusSnapshots[index].docs
      .map(normalizeStatus)
      .filter((item) => item.taskId === task.taskId);
    const directoryItems = [...directoryResult.directory.values()];
    const directoryStaffIds = new Set(directoryItems.map((item) => item.staffId));
    const tbOrphans = allItems.filter((item) => !directoryStaffIds.has(item.staffId));
    const currentSummary = task.taskId === TB_SCREENING_TASK_ID
      ? {
        items: directoryResult.status === "success"
          ? [...buildTbCurrentStaffItems(directoryItems, allItems), ...tbOrphans]
          : allItems,
        preservedOrphans: tbOrphans.length,
      }
      : reconcileCurrentTaskStatusItems({
        taskId: task.taskId,
        items: allItems,
        currentTargetStaffIds: currentTargetsResult.staffIds,
      });
    const items = currentSummary.items
      .map((item) => ({
        ...decorateStatus(item, directoryResult.directory, assignmentDirectoryResult.directory),
        statusLabel: getStaffStatusLabel(item.status, task.taskId),
      }))
      .sort(sortStatusItems);
    const summary = countStatuses(items);
    const latestSyncedAt = items.reduce((latest, item) => (toMillis(item.syncedAt) > toMillis(latest) ? item.syncedAt : latest), null);

    return [{
      ...task,
      items,
      summary: {
        ...summary,
        total: items.length,
        directoryLinked: items.filter((item) => item.hasDirectory).length,
        displayIdentityLinked: items.filter((item) => item.hasDisplayIdentity).length,
        latestSyncedAtLabel: formatSyncedAt(latestSyncedAt),
        preservedOrphans: currentSummary.preservedOrphans,
        ...(task.taskId === TB_SCREENING_TASK_ID ? buildTbAdminSummary(items) : {}),
      },
    }];
  });

  return {
    tasks: taskSummaries,
    directoryStatus: directoryResult.status,
    assignmentDirectoryStatus: assignmentDirectoryResult.status,
    healthMandatoryTrainingTargetStatus: currentTargetsResult.status,
  };
}

export async function updateAdminTbScreeningStatus(staffId, value) {
  const normalizedStaffId = normalizeText(staffId);
  if (!normalizedStaffId) throw new Error("교직원ID를 확인할 수 없습니다.");
  const update = getTbAdminUpdate(value);
  await setDoc(doc(db, "staff_submission_status", `${normalizedStaffId}_${TB_SCREENING_TASK_ID}`), {
    staffId: normalizedStaffId,
    taskId: TB_SCREENING_TASK_ID,
    ...update,
    sourceType: "admin_ui",
    syncedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
