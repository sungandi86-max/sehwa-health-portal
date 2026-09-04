import { Timestamp } from "firebase-admin/firestore";
import {
  getAssignmentId,
  readJsonBody,
  readStaffDirectory,
  sendCors,
  verifyDirectoryAdmin,
} from "../../lib/staffDirectory.js";

const ASSIGNMENT_LIMIT = 700;

class StaffIdLinkTransactionError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.userMessage = message;
  }
}

function normalizeStaffId(value) {
  return String(value || "").normalize("NFKC").trim();
}

function isValidTerm(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function isActiveAssignment(data) {
  return data?.active === true && typeof data.uid === "string";
}

function findDirectoryItem(directory, staffId) {
  return directory.find((item) => item.staffId === staffId) || null;
}

async function findActiveDuplicateAssignments(db, staffId, targetUid, schoolYear, semester) {
  const snapshot = await db
    .collection("user_assignments")
    .where("schoolYear", "==", Number(schoolYear))
    .where("semester", "==", Number(semester))
    .limit(ASSIGNMENT_LIMIT)
    .get();

  return snapshot.docs
    .map((documentSnapshot) => ({ id: documentSnapshot.id, ...documentSnapshot.data() }))
    .filter((assignment) => {
      return assignment.active === true && assignment.staffId === staffId && assignment.uid !== targetUid;
    });
}

export default async function handler(req, res) {
  sendCors(res, "PATCH, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "PATCH") return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });

  try {
    const access = await verifyDirectoryAdmin(req);
    if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });

    const body = await readJsonBody(req);
    const uid = String(body.uid || "").trim();
    const schoolYear = Number(body.schoolYear);
    const semester = Number(body.semester);
    const staffId = normalizeStaffId(body.staffId);
    const confirmDuplicate = body.confirmDuplicate === true;
    const dryRun = body.dryRun === true;

    if (!uid || !isValidTerm(schoolYear) || !isValidTerm(semester) || !staffId) {
      return res.status(400).json({ ok: false, message: "연결할 사용자와 교직원ID를 확인해 주세요." });
    }

    const { directory } = await readStaffDirectory();
    const directoryItem = findDirectoryItem(directory, staffId);
    if (!directoryItem) {
      return res.status(400).json({ ok: false, message: "교직원명단에 없는 교직원ID입니다." });
    }

    const db = access.db;
    const assignmentId = getAssignmentId(uid, schoolYear, semester);
    const assignmentRef = db.collection("user_assignments").doc(assignmentId);
    const assignmentSnapshot = await assignmentRef.get();
    if (!assignmentSnapshot.exists) {
      return res.status(404).json({ ok: false, message: "연결할 권한 문서를 찾지 못했습니다." });
    }

    const assignment = assignmentSnapshot.data();
    if (!isActiveAssignment(assignment)) {
      return res.status(409).json({ ok: false, message: "활성 권한 문서에만 교직원ID를 연결할 수 있습니다." });
    }
    if (assignment.uid !== uid || Number(assignment.schoolYear) !== schoolYear || Number(assignment.semester) !== semester) {
      return res.status(409).json({ ok: false, message: "권한 문서와 요청 정보가 일치하지 않습니다." });
    }
    if (assignment.staffId) {
      return res.status(409).json({ ok: false, message: "이미 교직원ID가 연결된 사용자입니다." });
    }

    const duplicates = await findActiveDuplicateAssignments(db, staffId, uid, schoolYear, semester);
    if (duplicates.length > 0 && !confirmDuplicate) {
      return res.status(409).json({
        ok: false,
        code: "duplicate-staff-id",
        message: "같은 교직원ID가 다른 활성 권한에 이미 연결되어 있습니다.",
        duplicateCount: duplicates.length,
      });
    }

    if (dryRun) {
      return res.status(200).json({
        ok: true,
        dryRun: true,
        duplicateCount: duplicates.length,
        assignmentFieldCount: Object.keys(assignment).length,
        staff: directoryItem,
      });
    }

    await db.runTransaction(async (transaction) => {
      const latestAssignmentSnapshot = await transaction.get(assignmentRef);
      if (!latestAssignmentSnapshot.exists) {
        throw new StaffIdLinkTransactionError(404, "연결할 권한 문서를 찾지 못했습니다.");
      }

      const latestAssignment = latestAssignmentSnapshot.data();
      if (!isActiveAssignment(latestAssignment)) {
        throw new StaffIdLinkTransactionError(409, "활성 권한 문서에만 교직원ID를 연결할 수 있습니다.");
      }
      if (
        latestAssignment.uid !== uid ||
        Number(latestAssignment.schoolYear) !== schoolYear ||
        Number(latestAssignment.semester) !== semester
      ) {
        throw new StaffIdLinkTransactionError(409, "권한 문서와 요청 정보가 일치하지 않습니다.");
      }
      if (latestAssignment.staffId) {
        throw new StaffIdLinkTransactionError(409, "이미 교직원ID가 연결된 사용자입니다.");
      }

      transaction.update(assignmentRef, {
        staffId,
        updatedAt: Timestamp.now(),
      });
    });

    return res.status(200).json({
      ok: true,
      duplicateCount: duplicates.length,
      assignmentId,
      staff: directoryItem,
    });
  } catch (error) {
    if (error instanceof StaffIdLinkTransactionError) {
      return res.status(error.status).json({ ok: false, message: error.userMessage });
    }

    return res.status(500).json({ ok: false, message: "교직원ID 연결을 저장하지 못했습니다." });
  }
}
