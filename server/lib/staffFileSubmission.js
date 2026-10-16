import { runStaffReceipt, staffReceiptIdentity, ReceiptError } from "./staffReceiptProtocol.js";
import { serverFirestoreResource } from "./firestoreResources.js";
import { CprCertificateSubmissionStore } from "./cprCertificateSubmissionStore.js";
import { TbCertificateSubmissionStore } from "./tbCertificateSubmissionStore.js";
import { buildScriptSubmission } from "./submissionWorkflows.js";
import { buildSubmissionProxyEnvelope } from "./submissionProxyEnvelope.js";
import { buildCprExternalSubmissionStatus, saveCprTrainingStatus } from "./cprTrainingStatus.js";
import { buildTbCertificateStatus, saveTbScreeningStatus } from "./tbScreeningStatus.js";
import { recordProductionTbReceipt } from "./tbScreeningWorkflowStore.js";
import { buildSelfSubmissionRecord, buildProxySubmissionRecord, createProxySubmission, resolveProxySubject, findProxyDuplicates } from "./adminProxySubmission.js";
import { readStaffDirectory } from "./staffDirectory.js";

export async function handleStaffFileSubmission({ payload, workflow, identity, context, runtime, postScript, destinationUrl, proxySecret,
  folder, proxyAccess, proxySubject, proxyAdministrator, cprCertificateStore, tbCertificateStore,
  saveCprStatus = saveCprTrainingStatus, saveTbStatus = saveTbScreeningStatus, saveProxyRecord = createProxySubmission,
  recordTbReceipt = recordProductionTbReceipt, readDirectory = readStaffDirectory, findProxyRecords = findProxyDuplicates, now = new Date() }) {
  payload = { ...payload, type: workflow.id };
  if (typeof proxySecret !== "string" || Buffer.byteLength(proxySecret, "utf8") < 32) throw new ReceiptError("PROXY_SECRET_REQUIRED", 503);
  const proxy = Boolean(proxyAccess), db = proxy ? proxyAccess.db : identity.db;
  const originals = serverFirestoreResource(db, "submissions", context);
  const statuses = serverFirestoreResource(db, "statuses", context);
  const submitter = proxy ? { uid: proxyAccess.decodedToken?.uid, email: proxyAccess.decodedToken?.email || "", displayName: proxyAdministrator.name } : identity.submitter;
  if (!submitter?.uid) throw new ReceiptError("RECEIPT_IDENTITY_REQUIRED", 403);
  let resumed;
  if (payload.resumeReceiptId) {
    const name = serverFirestoreResource(db, "receipts", context);
    const snapshot = await db.collection(name).doc(payload.resumeReceiptId).get();
    const record = snapshot.exists ? snapshot.data() : null;
    if (!record || record.staffId !== identity.staffId || record.actorUid !== submitter.uid || record.environment !== runtime ||
        record.type !== workflow.id || !record.request || record.submissionId !== payload.resumeReceiptId) throw new ReceiptError("RECEIPT_RESUME_FORBIDDEN", 403);
    resumed = record;
    const recoveryToken = payload.recoveryToken;
    payload = { ...record.request, ...(recoveryToken ? { recoveryToken } : {}), resumeReceiptId: record.submissionId };
  }
  const id = resumed ? Object.fromEntries(["submissionId", "requestFingerprint", "schoolYear", "environment", "staffId", "actorUid", "type"].map((key) => [key, resumed[key]])) : staffReceiptIdentity({ payload, environment: runtime, staffId: identity.staffId, actorUid: submitter.uid,
    proxy, actorStaffId: proxyAccess?.assignment.staffId || "" });
  const store = workflow.id === "cpr" ? cprCertificateStore || new CprCertificateSubmissionStore({ database: () => db, context: () => context })
    : tbCertificateStore || new TbCertificateSubmissionStore({ database: () => db, context: () => context });
  if (store.environment !== undefined && store.environment !== runtime) throw new ReceiptError("RESOURCE_ENV_MISMATCH", 503);
  const getReceipt = async () => {
    const record = typeof store.getRequest === "function" ? await store.getRequest(id.submissionId) : null;
    if (record && (record.environment !== runtime || record.staffId !== id.staffId || record.requestFingerprint !== id.requestFingerprint)) {
      throw new ReceiptError("RECEIPT_CONFLICT");
    }
    return record;
  };
  if (identity.statusValue === "completed" && !await getReceipt()) {
    return { status: 409, body: { status: "error", success: false, message: "이미 결핵검진 완료가 확인되어 추가 신청할 수 없습니다." } };
  }
  let subject = proxySubject;
  if (workflow.id === "tb" && runtime === "production" && !proxy) {
    const { directory } = await readDirectory({ allowInvalidEmploymentStatus: false });
    subject = resolveProxySubject(directory, id.staffId);
  }
  // Retain the existing production proxy duplicate warning; exact retries may
  // continue through their existing receipt without creating another upload.
  if (proxy && !await getReceipt() && payload.allowDuplicate !== true) {
    const duplicates = await findProxyRecords(db, id.staffId, id.schoolYear);
    if (duplicates.length) return { status: 409, body: { status: "duplicate", success: false,
      message: "이미 제출 기록이 있습니다.", duplicate: { id: duplicates[0].id, checkupDate: duplicates[0].checkupDate || "", status: duplicates[0].status || "submitted" } } };
  }
  const originalRef = db.collection(originals).doc(id.submissionId);
  const saveOriginal = async (saved, file) => {
    const evidence = saved?.evidenceFiles?.[0];
    const receivedAt = saved?.submittedAt ? new Date(saved.submittedAt) : now;
    const evidenceFile = { driveFileId: evidence?.fileId || file.fileId, driveUrl: "", fileName: evidence?.fileName || payload.fileName, mimeType: payload.fileMimeType };
    if (workflow.id === "tb" && runtime === "production") {
      const base = { subject, submissionId: id.submissionId, schoolYear: id.schoolYear,
        checkupDate: payload.fields.checkupDate, documentType: payload.fields.docType, file: evidenceFile, now: receivedAt };
      return saveProxyRecord(db, proxy ? buildProxySubmissionRecord({ ...base, administrator: proxyAdministrator, proxyNote: payload.proxyNote }) : buildSelfSubmissionRecord(base));
    }
    return db.runTransaction(async (tx) => {
      const snapshot = await tx.get(originalRef);
      if (snapshot.exists) {
        const value = snapshot.data();
        if (value.staffId !== id.staffId || value.itemId !== workflow.id || value.submitter?.uid !== submitter.uid) throw new ReceiptError("ORIGINAL_CONFLICT");
        return;
      }
      tx.create(originalRef, { itemId: workflow.id, staffId: id.staffId, submitter,
        ...(workflow.id === "cpr" ? { trainingDate: payload.fields.completionDate || null, institution: payload.fields.institution || null }
          : { checkupDate: payload.fields.checkupDate || null, documentType: payload.fields.docType || null }),
        staffType: payload.fields.staffType || null, file: evidenceFile, status: "submitted", submittedAt: receivedAt, updatedAt: receivedAt });
    });
  };
  const syncStatus = async (saved) => {
    if (workflow.id === "tb" && runtime === "production") return recordTbReceipt(db, saved);
    const statusPayload = workflow.id === "cpr" ? buildCprExternalSubmissionStatus({ staffId: id.staffId, trainingDate: payload.fields.completionDate })
      : buildTbCertificateStatus({ staffId: id.staffId, checkupDate: payload.fields.checkupDate, documentType: payload.fields.docType });
    const injected = workflow.id === "cpr" ? saveCprStatus !== saveCprTrainingStatus : saveTbStatus !== saveTbScreeningStatus;
    if (injected) return (workflow.id === "cpr" ? saveCprStatus : saveTbStatus)({ db, context, payload: statusPayload, collectionName: statuses });
    const statusRef = db.collection(statuses).doc(`${id.staffId}_${statusPayload.taskId}`);
    await db.runTransaction(async (tx) => {
      const [original, current, audit] = await Promise.all([tx.get(originalRef), tx.get(statusRef), tx.get(db.collection(store.collectionName).doc(id.submissionId))]);
      const status = current.exists ? current.data() : {};
      if (!original.exists || original.data().status !== "submitted" ||
        ["confirmed", "invalid", "rejected"].includes(audit.data()?.reviewState) ||
        ["completed", "rejected", "invalidated"].includes(audit.data()?.status) ||
        status.status === "completed" || status.sourceType === "portal_certificate_review") return;
      const currentTime = status.updatedAt?.toMillis?.() || Number(status.updatedAt instanceof Date ? status.updatedAt.getTime() : 0);
      if (status.latestSubmissionId && status.latestSubmissionId !== id.submissionId && currentTime >= Date.parse(saved.submittedAt || "")) return;
      tx.set(statusRef, { ...statusPayload, latestSubmissionId: id.submissionId,
        ...(statusPayload.screening ? { screening: { ...status.screening, ...statusPayload.screening } } : {}),
        syncedAt: now, updatedAt: now }, { merge: true });
    });
  };
  const request = JSON.parse(JSON.stringify({ type: workflow.id, action: payload.action,
    subjectStaffId: payload.subjectStaffId, schoolYear: id.schoolYear, requestId: payload.requestId, proxyNote: payload.proxyNote,
    fileName: payload.fileName, fileMimeType: payload.fileMimeType,
    fields: Object.fromEntries(["name", "dept", "staffType", "completionDate", "institution", "checkupDate", "docType"]
      .filter((key) => payload.fields[key] !== undefined).map((key) => [key, payload.fields[key]])) }));
  return runStaffReceipt({ db, context, identity: id, request, secret: proxySecret, recoveryToken: payload.recoveryToken,
    findReceipt: getReceipt, saveOriginal, syncStatus,
    readState: async () => {
      const [record, original] = await Promise.all([getReceipt(), originalRef.get()]);
      return record?.reviewState === "invalid" ? "invalidated"
        : record?.reviewState === "confirmed" || record?.status === "completed" ? "completed"
        : record?.status === "rejected" ? "rejected" : original.data()?.status || "submitted";
    },
    saveReceipt: async (file) => {
      const saved = await store.createRequest({ staffId: id.staffId, submittedAt: now, submissionId: id.submissionId,
        requestFingerprint: id.requestFingerprint, ...(workflow.id === "tb" ? { schoolYear: id.schoolYear } : {}),
        completionDate: payload.fields.completionDate, institution: payload.fields.institution,
        checkupDate: payload.fields.checkupDate, documentType: payload.fields.docType,
        evidenceFile: { fileId: file.fileId, fileName: payload.fileName, mimeType: payload.fileMimeType },
        submissionMode: proxy ? "admin_proxy" : "self", subject: proxy ? subject : null, submittedBy: proxyAdministrator, proxyNote: payload.proxyNote });
      return saved || { ...id, evidenceFiles: [{ fileId: file.fileId, fileName: payload.fileName }] };
    },
    upload: async (requestId) => {
      if (resumed) throw new ReceiptError("UPLOAD_OUTCOME_UNKNOWN", 503);
      const fields = identity.identity ? { ...payload.fields, name: identity.identity.name, dept: identity.identity.department }
        : proxy ? { ...payload.fields, name: subject.name, dept: subject.department || "", staffType: subject.position || "교직원" } : payload.fields;
      const outbound = buildScriptSubmission(workflow, { ...payload, fields }, { firestoreAudit: true, runtimeEnvironment: runtime, qaEvidenceFolderId: folder });
      const envelope = buildSubmissionProxyEnvelope(outbound, proxySecret, { requestId });
      if (!envelope) throw new ReceiptError("PROXY_SECRET_REQUIRED", 503);
      const response = await postScript(destinationUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(envelope) });
      const result = JSON.parse(await response.text());
      if (response.ok === false || !(result.success === true || result.status === "success" || result.ok === true) || !result.fileId) throw new Error("UPLOAD_UNCONFIRMED");
      return { fileId: result.fileId };
    } });
}
