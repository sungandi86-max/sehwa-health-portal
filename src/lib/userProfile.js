import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase.js";
import { getAssignmentId } from "../config/school.js";

export async function getUserProfile(uid) {
  if (!uid) return null;

  const profileRef = doc(db, "users", uid);
  const profileSnapshot = await getDoc(profileRef);

  return profileSnapshot.exists() ? profileSnapshot.data() : null;
}

export async function ensureUserProfile(firebaseUser) {
  if (!firebaseUser?.uid) return null;

  const profileRef = doc(db, "users", firebaseUser.uid);
  const profileSnapshot = await getDoc(profileRef);

  if (profileSnapshot.exists()) {
    return profileSnapshot.data();
  }

  const profile = {
    uid: firebaseUser.uid,
    email: firebaseUser.email || "",
    displayName: firebaseUser.displayName || "",
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(profileRef, profile);

  return {
    ...profile,
    createdAt: null,
    updatedAt: null,
  };
}

export async function getUserAssignment(uid, schoolYear, semester) {
  if (!uid || !schoolYear || !semester) return null;

  const assignmentRef = doc(db, "user_assignments", getAssignmentId(uid, schoolYear, semester));
  const assignmentSnapshot = await getDoc(assignmentRef);

  return assignmentSnapshot.exists() ? assignmentSnapshot.data() : null;
}

export function hasRole(assignment, role) {
  return Array.isArray(assignment?.roles) && assignment.roles.includes(role);
}

export function isHealthTeacher(assignment) {
  return hasRole(assignment, "health_teacher");
}

export function isAdmin(assignment) {
  return hasRole(assignment, "admin");
}

export function isHomeroom(assignment) {
  return hasRole(assignment, "homeroom");
}

export function isStaff(assignment) {
  return hasRole(assignment, "staff");
}
