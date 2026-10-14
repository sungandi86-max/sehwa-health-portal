import { randomUUID } from "node:crypto";

const text = (value, max = 200) => String(value ?? "").normalize("NFKC").trim().slice(0, max);

export function resolveProxySubject(directory, staffId) {
  const canonicalStaffId = text(staffId, 40);
  const matches = (directory || []).filter((staff) => staff.staffId === canonicalStaffId);
  if (matches.length !== 1) throw new Error("교직원명단에서 대상 교직원을 확인할 수 없습니다.");
  return matches[0];
}

export function buildProxySubmissionRecord({ subject, administrator, checkupDate, documentType,
  proxyNote = "", file, now = new Date() }) {
  if (!subject?.staffId || !subject?.name || !administrator?.staffId || !administrator?.name) {
    throw new Error("대리등록 대상자와 등록자 정보를 확인할 수 없습니다.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(checkupDate, 10)) || !text(documentType, 80)) {
    throw new Error("검진일자와 제출자료 유형을 확인해 주세요.");
  }
  if (!file?.driveFileId || !file?.fileName || !file?.mimeType) {
    throw new Error("대리등록 파일 정보를 확인할 수 없습니다.");
  }
  return {
    itemId: "tb",
    staffId: subject.staffId,
    subjectStaffId: subject.staffId,
    subjectName: subject.name,
    submittedByStaffId: administrator.staffId,
    submittedByName: administrator.name,
    submissionMode: "admin_proxy",
    proxyRegisteredAt: now,
    proxyNote: text(proxyNote, 500),
    submitter: { uid: "", email: "", displayName: subject.name },
    checkupDate: text(checkupDate, 10),
    documentType: text(documentType, 80),
    staffType: subject.position || "교직원",
    file,
    status: "submitted",
    submittedAt: now,
    updatedAt: now,
  };
}

export function proxySubmissionCollection(environment) {
  if (environment === "qa") return "staff_submissions_qa";
  if (environment === "production") return "staff_submissions";
  throw new Error("제출 조회는 승인된 배포 환경에서만 가능합니다.");
}

export async function findProxyDuplicates(db, staffId, { collectionName = "staff_submissions" } = {}) {
  const snapshot = await db.collection(collectionName).where("staffId", "==", staffId).get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((item) => item.itemId === "tb")
    .sort((a, b) => String(b.checkupDate || "").localeCompare(String(a.checkupDate || "")));
}

export async function createProxySubmission(db, record, {
  submissionId = randomUUID,
  collectionName = "staff_submissions",
} = {}) {
  const id = submissionId();
  await db.collection(collectionName).doc(id).create(record);
  return { id, ...record };
}
