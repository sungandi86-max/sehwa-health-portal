import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { db } from "./firebase.js";
import { INFECTION_CASE_STATUS, INFECTION_SUBMISSION_STATUS } from "./infectionStatus.js";
import { isHealthTeacher, isHomeroom } from "./userProfile.js";

const COLLECTION_NAME = "student_health_submissions";

function getSubmitter(user) {
  if (!user?.uid || !user?.email) throw new Error("로그인 정보를 확인할 수 없습니다.");

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || "",
  };
}

export function canSubmitInfectionReport(assignment) {
  if (assignment?.active !== true) return false;
  if (isHealthTeacher(assignment)) return true;

  return (
    isHomeroom(assignment) &&
    Number.isFinite(Number(assignment.grade)) &&
    Number.isFinite(Number(assignment.classNo))
  );
}

export function validateInfectionReport({ assignment, grade, classNo, studentNumber, studentName, diseaseName }) {
  if (!canSubmitInfectionReport(assignment)) return "감염병 보고 권한을 확인할 수 없습니다.";
  if (isHomeroom(assignment) && Number(grade) !== Number(assignment.grade)) return "담당 학년만 보고할 수 있습니다.";
  if (isHomeroom(assignment) && Number(classNo) !== Number(assignment.classNo)) return "담당 학급만 보고할 수 있습니다.";
  if (!Number.isFinite(Number(grade)) || Number(grade) < 1) return "학년 정보를 확인해 주세요.";
  if (!Number.isFinite(Number(classNo)) || Number(classNo) < 1) return "반 정보를 확인해 주세요.";
  if (!Number.isFinite(Number(studentNumber)) || Number(studentNumber) < 1) return "학생 번호를 입력해 주세요.";
  if (!studentName.trim()) return "학생 이름을 입력해 주세요.";
  if (!diseaseName.trim()) return "감염병명을 입력해 주세요.";
  return "";
}

export async function createInfectionReport({
  user,
  assignment,
  grade,
  classNo,
  studentNumber,
  studentName,
  diseaseName,
  diagnosisDate,
  exclusionStartDate,
  exclusionEndDate,
  note,
}) {
  const reportError = validateInfectionReport({ assignment, grade, classNo, studentNumber, studentName, diseaseName });
  if (reportError) throw new Error(reportError);

  const submissionRef = doc(db, COLLECTION_NAME, crypto.randomUUID());
  await setDoc(submissionRef, {
    type: "infection",
    schoolYear: CURRENT_SCHOOL_YEAR,
    semester: CURRENT_SEMESTER,
    student: {
      grade: Number(grade),
      classNo: Number(classNo),
      number: Number(studentNumber),
      name: studentName.trim(),
    },
    infection: {
      diseaseName: diseaseName.trim(),
      diagnosisDate: diagnosisDate || null,
      exclusionStartDate: exclusionStartDate || null,
      exclusionEndDate: exclusionEndDate || null,
    },
    report: {
      status: "submitted",
      submissionStatus: INFECTION_SUBMISSION_STATUS.submitted,
      caseStatus: INFECTION_CASE_STATUS.new,
      note: note.trim() || null,
    },
    submittedBy: getSubmitter(user),
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { id: submissionRef.id };
}

export async function getAccessibleInfectionReports(assignment) {
  if (!canSubmitInfectionReport(assignment)) return [];

  const constraints = [
    where("type", "==", "infection"),
    where("schoolYear", "==", CURRENT_SCHOOL_YEAR),
    where("semester", "==", CURRENT_SEMESTER),
  ];

  if (isHomeroom(assignment) && !isHealthTeacher(assignment)) {
    constraints.push(where("student.grade", "==", Number(assignment.grade)));
    constraints.push(where("student.classNo", "==", Number(assignment.classNo)));
  }

  const snapshot = await getDocs(query(collection(db, COLLECTION_NAME), ...constraints));
  return snapshot.docs
    .map((documentSnapshot) => ({ id: documentSnapshot.id, ...documentSnapshot.data() }))
    .sort((left, right) => {
      const leftMillis = left.submittedAt?.toMillis?.() || 0;
      const rightMillis = right.submittedAt?.toMillis?.() || 0;
      return rightMillis - leftMillis;
    });
}
