import { signatureKey } from "./trainingCenterPhase2.js";
import { trainingLockCollection } from "./trainingDeployment.js";

const PDF_MAGIC = Buffer.from("%PDF-", "ascii");

function lockRef(db, eventId, staffId) {
  return db.collection(trainingLockCollection()).doc(signatureKey(eventId, staffId));
}

function assertVerifiedPdf(pdf, rows, includedFileIds) {
  if (!Buffer.isBuffer(pdf) || pdf.length <= PDF_MAGIC.length || !pdf.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    throw new RangeError("연수등록부 PDF 검증에 실패했습니다.");
  }
  const included = new Set(includedFileIds);
  const expected = [...new Set(rows.filter((row) => row.status !== "제외").map((row) => row.fileId).filter(Boolean))];
  if (expected.some((fileId) => !included.has(fileId))) throw new RangeError("연수등록부 서명 이미지 검증에 실패했습니다.");
}

export async function recordRosterPdfVerification({ db, eventId, rows, includedFileIds, pdf, actor, now = Date.now() }) {
  assertVerifiedPdf(pdf, rows, includedFileIds);
  const verifiedAt = new Date(now).toISOString();
  const refs = rows.filter((row) => row.staffId).map((row) => ({ row, ref: lockRef(db, eventId, row.staffId) }));
  const groups = [];
  await db.runTransaction(async (transaction) => {
    for (const { row, ref } of refs) {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) continue;
      const data = snapshot.data();
      if (!data?.requestId || !Array.isArray(data.eventIds) || !data.eventIds.includes(eventId)) continue;
      if (row.fileId && data.uploadedFileId !== row.fileId) throw new RangeError("연수등록부 서명 연결을 확인해 주세요.");
      if (data.state === "completed" && data.uploadedFileId && !row.fileId) continue;
      transaction.set(ref, {
        rosterPdfVerifiedAt: verifiedAt,
        rosterPdfVerifiedBy: actor,
        signatureCleanupState: data.uploadedFileId ? "awaiting-related-events" : "not-applicable",
        updatedAt: verifiedAt,
      }, { merge: true });
      if (data.uploadedFileId) groups.push({ staffId: row.staffId, eventIds: data.eventIds, requestId: data.requestId,
        fileId: data.uploadedFileId });
    }
  });

  const eligibleFileIds = [];
  for (const group of groups) {
    const related = group.eventIds.map((relatedEventId) => lockRef(db, relatedEventId, group.staffId));
    const snapshots = await Promise.all(related.map((ref) => ref.get()));
    const eligible = snapshots.every((snapshot) => snapshot.exists && snapshot.data()?.requestId === group.requestId &&
      snapshot.data()?.uploadedFileId === group.fileId && snapshot.data()?.rosterPdfVerifiedAt);
    if (!eligible) continue;
    await db.runTransaction(async (transaction) => {
      const current = [];
      for (const ref of related) current.push(await transaction.get(ref));
      if (current.some((snapshot) => !snapshot.exists || snapshot.data()?.requestId !== group.requestId ||
        snapshot.data()?.uploadedFileId !== group.fileId || !snapshot.data()?.rosterPdfVerifiedAt)) return;
      related.forEach((ref) => transaction.set(ref, { signatureCleanupState: "eligible",
        signatureCleanupEligibleAt: verifiedAt, updatedAt: verifiedAt }, { merge: true }));
      eligibleFileIds.push(group.fileId);
    });
  }
  return { verifiedAt, eligibleFileIds: [...new Set(eligibleFileIds)] };
}
