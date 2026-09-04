import process from "node:process";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { initializeFirebaseAdmin, loadLocalEnv } from "./lib/firebaseAdminCli.mjs";

const isApplyMode = process.argv.includes("--apply");

const staffSubmissionTasks = [
  {
    taskId: "tb-screening-2026",
    title: "교직원 결핵검진",
    description: null,
    category: "screening",
    sourceType: "health_sheet",
    sourceConfig: {
      spreadsheetName: "2026학년도 보건실 업무",
      sheetName: "교직원 결핵검진현황",
    },
    completionRule: {
      field: "검진상태",
      completedValue: "검진완료",
    },
    targetType: "all_staff",
    dueDate: null,
    enabled: true,
    order: 10,
  },
  {
    taskId: "cpr-training-2026",
    title: "심폐소생술 연수",
    description: null,
    category: "training",
    sourceType: "health_sheet",
    sourceConfig: {
      spreadsheetName: "2026학년도 보건실 업무",
      sheetName: "교직원 심폐소생술 연수 이수",
    },
    completionRule: {
      field: "확인상태",
      completedValue: "확인완료",
    },
    targetType: "all_staff",
    dueDate: null,
    enabled: true,
    order: 20,
  },
  {
    taskId: "health-mandatory-training-2026",
    title: "보건 관련 법정의무연수",
    description: "감염병 · 4대폭력예방 · 아동학대예방 · 장애인학대예방",
    category: "training",
    sourceType: "research_sheet",
    sourceConfig: {
      sourceKey: "research-mandatory-training-2026",
      spreadsheetName: "2026 세화여고 교직원 법정의무연수 이수 현황",
      sheetName: "법정의무연수 묶음과정",
    },
    completionRule: {
      field: "이수상태",
      completedValue: "이수완료",
    },
    targetType: "all_staff",
    dueDate: null,
    enabled: true,
    order: 30,
  },
];

function comparable(data) {
  return JSON.stringify({
    taskId: data.taskId || "",
    title: data.title || "",
    description: data.description || null,
    category: data.category || "",
    sourceType: data.sourceType || "",
    sourceConfig: data.sourceConfig || {},
    completionRule: data.completionRule || {},
    targetType: data.targetType || "",
    dueDate: data.dueDate || null,
    enabled: data.enabled === true,
    order: Number(data.order || 999),
  });
}

async function planSeed(db) {
  const refs = staffSubmissionTasks.map((task) => db.collection("staff_submission_tasks").doc(task.taskId));
  const snapshots = refs.length ? await db.getAll(...refs) : [];
  const planned = { create: [], update: [], unchanged: [], conflicts: [] };

  staffSubmissionTasks.forEach((task, index) => {
    const snapshot = snapshots[index];
    if (!snapshot.exists) {
      planned.create.push(task);
      return;
    }

    const existing = snapshot.data();
    if (existing.taskId && existing.taskId !== task.taskId) {
      planned.conflicts.push(task);
      return;
    }

    if (comparable(existing) === comparable(task)) planned.unchanged.push(task);
    else planned.update.push(task);
  });

  return planned;
}

async function applySeed(db, planned) {
  const batch = db.batch();

  planned.create.forEach((task) => {
    batch.set(db.collection("staff_submission_tasks").doc(task.taskId), {
      ...task,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  planned.update.forEach((task) => {
    batch.set(db.collection("staff_submission_tasks").doc(task.taskId), {
      ...task,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  await batch.commit();
}

async function main() {
  loadLocalEnv();
  initializeFirebaseAdmin();

  const db = getFirestore();
  const planned = await planSeed(db);
  const summary = {
    mode: isApplyMode ? "apply" : "dry-run",
    collection: "staff_submission_tasks",
    taskCount: staffSubmissionTasks.length,
    plannedCreates: planned.create.length,
    plannedUpdates: planned.update.length,
    unchanged: planned.unchanged.length,
    conflicts: planned.conflicts.length,
    taskIds: staffSubmissionTasks.map((task) => task.taskId),
  };

  console.log(JSON.stringify(summary, null, 2));
  if (planned.conflicts.length) throw new Error("staff_submission_tasks 문서 ID 충돌이 있어 중단합니다.");

  if (isApplyMode) {
    await applySeed(db, planned);
    console.log("Staff submission tasks seed apply completed.");
  } else {
    console.log("Dry-run only. Firestore 변경 없음. 실제 반영은 --apply를 사용하세요.");
  }
}

// no-excuse-ok: catch - CLI boundary prints concise migration failure.
main().catch((error) => {
  console.error("Staff submission tasks seed failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
