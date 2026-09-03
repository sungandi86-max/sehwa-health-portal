import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getAssignmentId } from "../config/school.js";
import { db } from "./firebase.js";

export const ASSIGNMENT_ROLES = ["staff", "homeroom", "health_teacher", "admin"];
export const ASSIGNMENT_FILTERS = ["all", "unregistered", "staff", "homeroom", "health_teacher", "inactive"];

const USER_LIMIT = 300;
const ASSIGNMENT_LIMIT = 500;

function sortByDisplayName(a, b) {
  const aName = a.displayName || a.email || "";
  const bName = b.displayName || b.email || "";
  return aName.localeCompare(bName, "ko");
}

export function getNextTerm(schoolYear, semester) {
  if (Number(semester) === 1) {
    return { schoolYear: Number(schoolYear), semester: 2 };
  }

  return { schoolYear: Number(schoolYear) + 1, semester: 1 };
}

export function normalizeAssignmentDraft(draft) {
  const roles = ASSIGNMENT_ROLES.filter((role) => Array.isArray(draft.roles) && draft.roles.includes(role));
  const hasHomeroom = roles.includes("homeroom");

  return {
    uid: draft.uid,
    schoolYear: Number(draft.schoolYear),
    semester: Number(draft.semester),
    roles,
    grade: hasHomeroom ? Number(draft.grade) : null,
    classNo: hasHomeroom ? Number(draft.classNo) : null,
    position: draft.position?.trim() || null,
    active: draft.active === true,
  };
}

export function validateAssignmentDraft(draft, currentUid) {
  const normalized = normalizeAssignmentDraft(draft);

  if (!normalized.uid) return "사용자 정보가 없습니다.";
  if (!normalized.roles.length) return "역할을 1개 이상 선택해 주세요.";
  if (normalized.roles.includes("homeroom")) {
    if (!Number.isFinite(normalized.grade) || normalized.grade < 1) return "담임 학년을 선택해 주세요.";
    if (!Number.isFinite(normalized.classNo) || normalized.classNo < 1) return "담임 반을 선택해 주세요.";
  }
  if (normalized.uid === currentUid && !normalized.roles.includes("health_teacher")) {
    return "현재 로그인한 보건교사 권한은 이 화면에서 해제할 수 없습니다.";
  }
  if (normalized.uid === currentUid && normalized.active !== true) {
    return "현재 로그인한 보건교사의 현재 학기 권한은 비활성화할 수 없습니다.";
  }

  return "";
}

function normalizeUser(documentSnapshot, assignmentMap) {
  const data = documentSnapshot.data();
  const uid = data.uid || documentSnapshot.id;
  const assignment = assignmentMap.get(uid) || null;

  return {
    id: documentSnapshot.id,
    uid,
    email: data.email || "",
    displayName: data.displayName || "",
    active: data.active === true,
    assignment,
    assignmentId: assignment ? getAssignmentId(uid, assignment.schoolYear, assignment.semester) : null,
  };
}

export async function getUsersWithAssignments(schoolYear, semester) {
  const [usersSnapshot, assignmentsSnapshot] = await Promise.all([
    getDocs(query(collection(db, "users"), limit(USER_LIMIT))),
    getDocs(
      query(
        collection(db, "user_assignments"),
        where("schoolYear", "==", Number(schoolYear)),
        where("semester", "==", Number(semester)),
        limit(ASSIGNMENT_LIMIT)
      )
    ),
  ]);

  const assignmentMap = new Map();
  assignmentsSnapshot.docs.forEach((assignmentDoc) => {
    const assignment = assignmentDoc.data();
    if (assignment?.uid) {
      assignmentMap.set(assignment.uid, { id: assignmentDoc.id, ...assignment });
    }
  });

  return usersSnapshot.docs.map((userDoc) => normalizeUser(userDoc, assignmentMap)).sort(sortByDisplayName);
}

export async function saveUserAssignment(draft, currentUid) {
  const validationMessage = validateAssignmentDraft(draft, currentUid);
  if (validationMessage) throw new Error(validationMessage);

  const normalized = normalizeAssignmentDraft(draft);
  const assignmentId = getAssignmentId(normalized.uid, normalized.schoolYear, normalized.semester);
  const assignmentRef = doc(db, "user_assignments", assignmentId);
  const assignmentSnapshot = await getDoc(assignmentRef);

  if (assignmentSnapshot.exists()) {
    await updateDoc(assignmentRef, {
      roles: normalized.roles,
      grade: normalized.grade,
      classNo: normalized.classNo,
      position: normalized.position,
      active: normalized.active,
      updatedAt: serverTimestamp(),
    });
    return { id: assignmentId, mode: "updated" };
  }

  await setDoc(assignmentRef, {
    ...normalized,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { id: assignmentId, mode: "created" };
}

function normalizeCopyRoles(roles, copyRoles, copyHomeroom) {
  if (!copyRoles) return ["staff"];

  const nextRoles = ASSIGNMENT_ROLES.filter((role) => Array.isArray(roles) && roles.includes(role));
  return copyHomeroom ? nextRoles : nextRoles.filter((role) => role !== "homeroom");
}

export async function previewAssignmentCopy(fromTerm, toTerm) {
  const [sourceSnapshot, targetSnapshot] = await Promise.all([
    getDocs(
      query(
        collection(db, "user_assignments"),
        where("schoolYear", "==", Number(fromTerm.schoolYear)),
        where("semester", "==", Number(fromTerm.semester)),
        limit(ASSIGNMENT_LIMIT)
      )
    ),
    getDocs(
      query(
        collection(db, "user_assignments"),
        where("schoolYear", "==", Number(toTerm.schoolYear)),
        where("semester", "==", Number(toTerm.semester)),
        limit(ASSIGNMENT_LIMIT)
      )
    ),
  ]);

  const sourceAssignments = sourceSnapshot.docs
    .map((documentSnapshot) => ({ id: documentSnapshot.id, ...documentSnapshot.data() }))
    .filter((assignment) => assignment.active === true && assignment.uid);
  const targetIds = new Set(targetSnapshot.docs.map((documentSnapshot) => documentSnapshot.id));

  return {
    sourceCount: sourceAssignments.length,
    createCount: sourceAssignments.filter((assignment) => {
      return !targetIds.has(getAssignmentId(assignment.uid, toTerm.schoolYear, toTerm.semester));
    }).length,
    existingCount: sourceAssignments.filter((assignment) => {
      return targetIds.has(getAssignmentId(assignment.uid, toTerm.schoolYear, toTerm.semester));
    }).length,
    skipCount: sourceSnapshot.size - sourceAssignments.length,
  };
}

export async function copyAssignmentsToTerm(fromTerm, toTerm, options) {
  const sourceSnapshot = await getDocs(
    query(
      collection(db, "user_assignments"),
      where("schoolYear", "==", Number(fromTerm.schoolYear)),
      where("semester", "==", Number(fromTerm.semester)),
      limit(ASSIGNMENT_LIMIT)
    )
  );
  const targetSnapshot = await getDocs(
    query(
      collection(db, "user_assignments"),
      where("schoolYear", "==", Number(toTerm.schoolYear)),
      where("semester", "==", Number(toTerm.semester)),
      limit(ASSIGNMENT_LIMIT)
    )
  );
  const targetIds = new Set(targetSnapshot.docs.map((documentSnapshot) => documentSnapshot.id));
  const batch = writeBatch(db);
  let createCount = 0;
  let existingCount = 0;
  let skipCount = 0;

  sourceSnapshot.docs.forEach((documentSnapshot) => {
    const assignment = documentSnapshot.data();
    if (assignment.active !== true || !assignment.uid) {
      skipCount += 1;
      return;
    }

    const targetId = getAssignmentId(assignment.uid, toTerm.schoolYear, toTerm.semester);
    if (targetIds.has(targetId)) {
      existingCount += 1;
      return;
    }

    const roles = normalizeCopyRoles(assignment.roles, options.copyRoles, options.copyHomeroom);
    const nextAssignment = {
      uid: assignment.uid,
      schoolYear: Number(toTerm.schoolYear),
      semester: Number(toTerm.semester),
      roles,
      grade: options.copyHomeroom && roles.includes("homeroom") ? assignment.grade ?? null : null,
      classNo: options.copyHomeroom && roles.includes("homeroom") ? assignment.classNo ?? null : null,
      position: options.copyPosition ? assignment.position || null : null,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    batch.set(doc(db, "user_assignments", targetId), nextAssignment);
    createCount += 1;
  });

  if (createCount > 0) {
    await batch.commit();
  }

  return { createCount, existingCount, skipCount };
}
