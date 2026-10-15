import fetch from "node-fetch";
import { verifyCurrentStaffSubmissionIdentity, verifyTbSubmissionAllowed } from "../server/lib/tbSubmissionGuard.js";
import { getFirebaseAdminDb } from "../server/lib/firebaseAdmin.js";
import {
  buildTbCertificateStatus,
  buildTbRegistrationStatus,
  saveTbScreeningStatus,
} from "../server/lib/tbScreeningStatus.js";
import { buildCprExternalSubmissionStatus, saveCprTrainingStatus } from "../server/lib/cprTrainingStatus.js";
import { buildScriptSubmission, resolveSubmissionWorkflow, validateSubmissionPayload } from "../server/lib/submissionWorkflows.js";
import { buildSubmissionProxyEnvelope, qaStudentSubmissionIdentity, submissionVisitor } from "../server/lib/submissionProxyEnvelope.js";
import { assertRegistrationOpen, readSubmissionConfig, SubmissionConfigError } from "../server/lib/submissionConfig.js";
import { inbodyRequestStore } from "../server/lib/inbodyRequestStore.js";
import { tbRegistrationRequestStore } from "../server/lib/tbRegistrationRequestStore.js";
import { cprCertificateSubmissionStore } from "../server/lib/cprCertificateSubmissionStore.js";
import { tbCertificateSubmissionStore } from "../server/lib/tbCertificateSubmissionStore.js";
import { studentSubmissionAuditStore } from "../server/lib/studentSubmissionAuditStore.js";
import { trainingEnvironment } from "../server/lib/trainingDeployment.js";
import { CURRENT_SCHOOL_YEAR } from "../src/config/school.js";
import { validatedSchoolYear } from "../src/lib/tbScreeningWorkflowModel.js";
import { QaTbSubmissionError, qaTbSubmissionIdentity, receiveQaTbSubmission } from "../server/lib/qaTbSubmission.js";
import { recordQaTbReceipt } from "../server/lib/tbScreeningWorkflowStore.js";
import { verifyQaTbProxyAdmin } from "../server/lib/qaTbSubmissionAuth.js";
import { submissionScriptUrl } from "../server/lib/submissionScriptUrl.js";
import { readStaffDirectory } from "../server/lib/staffDirectory.js";
import { buildProxySubmissionRecord, createProxySubmission, findProxyDuplicates,
  proxySubmissionCollection, resolveProxySubject } from "../server/lib/adminProxySubmission.js";

export const config = {
  api: { bodyParser: false }
};

function parseJsonBody(rawBody) {
  try {
    return JSON.parse(rawBody || "{}");
  } catch {
    return null;
  }
}

function isLegacyInfectionSubmit(payload) {
  return payload?.action === "infectionReport" || payload?.type === "infection";
}

function isSuccessfulResponse(payload) {
  return payload?.status === "success" || payload?.success === true || payload?.ok === true;
}

function buildTbStatusPayload(payload, staffId) {
  if (payload?.type === "tb") {
    return buildTbCertificateStatus({
      staffId,
      checkupDate: payload?.fields?.checkupDate,
      documentType: payload?.fields?.docType,
    });
  }
  return buildTbRegistrationStatus({
    staffId,
    registrationType: payload?.fields?.registrationType,
  });
}

export default async function handler(req, res, { context = process.env, postScript = fetch, verifyStaff = verifyCurrentStaffSubmissionIdentity, verifyTb = verifyTbSubmissionAllowed, destinationUrl = submissionScriptUrl(context), proxySecret = process.env.SUBMISSION_PROXY_SECRET,
  qaCprFolderId = process.env.QA_CPR_DRIVE_FOLDER_ID,
  qaTbCertificateFolderId = process.env.QA_TB_CERTIFICATE_DRIVE_FOLDER_ID,
  qaStudentReplyFolderId = process.env.QA_STUDENT_REPLY_DRIVE_FOLDER_ID,
  loadSubmissionConfig = () => readSubmissionConfig(getFirebaseAdminDb()), inbodyStore = inbodyRequestStore,
  tbRegistrationStore = tbRegistrationRequestStore, cprCertificateStore = cprCertificateSubmissionStore,
  tbCertificateStore = tbCertificateSubmissionStore,
  studentAuditStore = studentSubmissionAuditStore,
  saveTbStatus = saveTbScreeningStatus, saveCprStatus = saveCprTrainingStatus,
  verifyProxyAdmin = verifyQaTbProxyAdmin, readDirectory = readStaffDirectory,
  findDuplicates = findProxyDuplicates, saveProxySubmission = createProxySubmission,
  environment = () => trainingEnvironment(context),
  recordTbReceipt = recordQaTbReceipt,
  now = new Date() } = {}) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") return res.status(405).end();
  if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers?.["content-type"] || ""))) {
    return res.status(415).json({ status: "error", success: false, message: "JSON 제출 요청만 허용됩니다." });
  }

  try {
    const chunks = [];
    let requestBytes = 0;
    for await (const chunk of req) {
      requestBytes += chunk.length;
      if (requestBytes > 4_250_000) return res.status(413).json({ status: "error", success: false, message: "파일 크기는 3MiB 이하로 줄여 주세요." });
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString("utf-8");
    const payload = parseJsonBody(rawBody);
    const isAdminProxyTb = payload?.action === "admin_proxy" && payload?.type === "tb";

    if (isLegacyInfectionSubmit(payload)) {
      return res.status(410).json({
        status: "error",
        success: false,
        message: "감염병 보고는 로그인 후 새 감염병 보고 화면에서 제출해 주세요.",
        redirectTo: "/firebase-submit/infection",
      });
    }

    const workflow = resolveSubmissionWorkflow(payload);
    const validation = validateSubmissionPayload(workflow, payload);
    if (!validation.ok) return res.status(validation.status).json({ status: "error", success: false, message: validation.message });
    const tbEnvironment = workflow.id === "tb" ? environment() : null;
    let tbSchoolYear;
    if (workflow.id === "tb" && !["qa", "production"].includes(tbEnvironment)) {
      return res.status(403).json({ status: "error", success: false, message: "승인된 배포 환경에서만 제출할 수 있습니다." });
    }
    if (tbEnvironment === "qa") {
      try { tbSchoolYear = validatedSchoolYear(payload.schoolYear); }
      catch { return res.status(400).json({ status: "error", success: false, message: "학년도를 명시해 주세요." }); }
      if (tbSchoolYear !== CURRENT_SCHOOL_YEAR) return res.status(400).json({ status: "error", success: false,
        message: "현재 학년도 자료만 제출할 수 있습니다." });
    }

    let proxyAccess = null;
    let proxySubject = null;
    let proxyAdministrator = null;
    let proxyFields = null;
    let proxyCollectionName = "staff_submissions";
    if (isAdminProxyTb) {
      proxyAccess = await verifyProxyAdmin(req, tbEnvironment === "qa" ? { workflowEnvironment: "qa", schoolYear: tbSchoolYear } : undefined);
      if (!proxyAccess.ok) {
        return res.status(proxyAccess.status).json({ status: "error", success: false, message: proxyAccess.message });
      }
      const { directory } = await readDirectory({ allowInvalidEmploymentStatus: true });
      try {
        proxySubject = resolveProxySubject(directory, payload?.subjectStaffId);
        proxyAdministrator = resolveProxySubject(directory, proxyAccess.assignment?.staffId);
      } catch (error) {
        return res.status(409).json({ status: "error", success: false, message: error.message });
      }
      proxyFields = { ...payload.fields, name: proxySubject.name, dept: proxySubject.department,
        staffType: proxySubject.position || "교직원" };
      proxyCollectionName = proxySubmissionCollection(environment());
      const duplicates = await findDuplicates(proxyAccess.db, proxySubject.staffId,
        { collectionName: proxyCollectionName, ...(tbEnvironment === "qa" ? { schoolYear: tbSchoolYear } : {}) });
      const repeatFingerprint = tbEnvironment === "qa" ? qaTbSubmissionIdentity({ ...payload, fields: proxyFields,
        schoolYear: tbSchoolYear, staffId: proxySubject.staffId, actorStaffId: proxyAdministrator.staffId,
        submissionMode: "admin_proxy" }, proxySecret).requestFingerprint : null;
      if (duplicates.length && payload?.allowDuplicate !== true &&
        !(repeatFingerprint && duplicates.some((item) => item.requestFingerprint === repeatFingerprint))) {
        const latest = duplicates[0];
        return res.status(409).json({ status: "duplicate", success: false,
          message: "이미 제출 기록이 있습니다.", duplicate: {
            checkupDate: latest.checkupDate || "", status: latest.status || "submitted",
          } });
      }
    }

    let tbGuard = null;
    let cprIdentity = null;
    if (workflow.authPolicy === "current_staff_tb_guard" && !isAdminProxyTb) {
      tbGuard = await verifyTb(req, { allowQaTbCertificateSynthetic: workflow.id === "tb" && environment() === "qa",
        ...(tbEnvironment === "qa" ? { workflowEnvironment: "qa", schoolYear: tbSchoolYear,
          allowCompletedReceiptRecovery: true } : {}) });
      if (!tbGuard.ok) {
        return res.status(tbGuard.status).json({ status: "error", success: false, message: tbGuard.message });
      }
    }
    if (workflow.authPolicy === "current_staff") {
      cprIdentity = await verifyStaff(req, {
        allowQaInbodySynthetic: workflow.id === "inbody" && trainingEnvironment() === "qa",
        allowQaCprSynthetic: workflow.id === "cpr" && trainingEnvironment() === "qa",
      });
      if (!cprIdentity.ok) return res.status(cprIdentity.status).json({ status: "error", success: false, message: cprIdentity.message });
    }
    const identity = tbGuard || cprIdentity;
    const qaInbodyOnly = workflow.id === "inbody" && inbodyStore.backend === "firestore" && identity?.qaSynthetic === true;
    const qaCprOnly = workflow.id === "cpr" && environment() === "qa" && identity?.qaCprSynthetic === true;
    const qaTbCertificateOnly = workflow.id === "tb" && environment() === "qa" && identity?.qaTbCertificateSynthetic === true;
    if (!isAdminProxyTb && workflow.requiresCanonicalStaffId && (!identity?.staffId ||
      (!qaInbodyOnly && !qaCprOnly && !qaTbCertificateOnly
        && !identity.roles?.some((role) => workflow.allowedRoles.includes(role))))) {
      return res.status(403).json({ status: "error", success: false, message: "이 제출 유형을 이용할 권한이 없습니다." });
    }
    if (workflow.id === "tb_registration") {
      try {
        assertRegistrationOpen(await loadSubmissionConfig(), now);
      } catch (error) {
        return res.status(error instanceof SubmissionConfigError ? 409 : 503).json({
          status: "error", success: false, message: error instanceof SubmissionConfigError ? error.message : "단체검진 신청 설정을 확인할 수 없습니다.",
        });
      }
    }

    if (workflow.id === "inbody") {
      if (inbodyStore.backend !== "firestore") throw new Error("인바디 Firestore 원장을 확인할 수 없습니다.");
      const fields = qaInbodyOnly ? { ...payload.fields, name: identity.identity.name, dept: identity.identity.department } : payload.fields;
      const saved = await inbodyStore.createRequest({ staffId: identity.staffId, fields, now });
      return res.status(200).json({ status: "success", success: true, requestId: saved.requestId,
        submittedAt: saved.submittedAt, staffId: saved.staffId });
    }

    if (workflow.id === "tb_registration") {
      const saved = await tbRegistrationStore.createRequest({
        staffId: tbGuard.staffId,
        selectedType: payload?.fields?.registrationType,
        now,
      });
      try {
        await saveTbStatus({
          db: tbGuard.db || getFirebaseAdminDb(),
          payload: buildTbStatusPayload(payload, tbGuard.staffId),
          collectionName: tbRegistrationStore.environment === "qa" ? "staff_submission_status_qa" : undefined,
        });
      } catch {
        console.error("[TB_STATUS_WRITE] Firestore status update failed.");
        return res.status(503).json({
          status: "error",
          success: false,
          message: "신청 자료는 접수되었지만 결핵검진 현황을 갱신하지 못했습니다. 보건실에 문의해 주세요.",
        });
      }
      return res.status(200).json({
        status: "success",
        success: true,
        requestId: saved.requestId,
        submittedAt: saved.submittedAt,
        staffId: tbGuard.staffId,
      });
    }

    if (workflow.id === "student_tb_reply" && !["qa", "production"].includes(environment())) {
      return res.status(403).json({ status: "error", success: false, message: "승인된 배포 환경에서만 제출할 수 있습니다." });
    }
    if (!["qa", "production"].includes(environment()) ||
      !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(destinationUrl)) {
      return res.status(503).json({ status: "error", success: false, message: "제출 저장소가 설정되지 않았습니다." });
    }
    const studentEnvironment = workflow.id === "student_tb_reply" ? environment() : null;
    const qaStudentAudit = studentEnvironment === "qa";
    const visitor = workflow.id === "student_tb_reply"
      ? submissionVisitor(req, proxySecret, { trustedVercel: qaStudentAudit }) : "";
    if (workflow.id === "student_tb_reply" && !visitor) {
      return res.status(503).json({ status: "error", success: false, message: "익명 제출 보호 설정을 확인해 주세요." });
    }
    if (qaStudentAudit && !qaStudentReplyFolderId) {
      return res.status(503).json({ status: "error", success: false,
        message: "QA 학생 증빙 저장소가 설정되지 않았습니다." });
    }
    if (qaStudentAudit && (String(payload.fields?.studentName || "").trim() !== "[QA] synthetic" ||
      !String(payload.fileName || "").includes("QA"))) {
      return res.status(403).json({ status: "error", success: false, message: "QA 합성 제출만 허용됩니다." });
    }
    const qaIdentity = qaStudentAudit ? qaStudentSubmissionIdentity(payload, proxySecret) : null;
    if (qaStudentAudit && !qaIdentity) return res.status(503).json({ status: "error", success: false,
      message: "QA 접수 식별자를 생성할 수 없습니다." });
    if (qaStudentAudit) {
      const existing = await studentAuditStore.getQaRequest(qaIdentity.submissionId) ||
        await studentAuditStore.getQaEvidenceMatch({ evidenceSha256: qaIdentity.evidenceSha256,
          fileMimeType: payload.fileMimeType, fields: payload.fields });
      if (existing) {
        if (!existing.evidenceFiles?.[0]?.fileId || existing.evidenceFiles[0].exists !== true) {
          return res.status(409).json({ status: "error", success: false,
            message: "기존 QA 접수의 증빙 파일을 확인할 수 없습니다. 관리자에게 문의해 주세요." });
        }
        return res.status(409).json({ status: "error", success: false,
          submissionId: existing.submissionId, message: "이미 접수된 QA 제출입니다." });
      }
    }
    const cprEnvironment = workflow.id === "cpr" ? environment() : null;
    const cprAudit = workflow.id === "cpr" && ["qa", "production"].includes(cprEnvironment);
    const qaCprAudit = cprAudit && cprEnvironment === "qa";
    if (qaCprAudit && !qaCprFolderId) {
      return res.status(503).json({ status: "error", success: false, message: "QA CPR 증빙 저장소가 설정되지 않았습니다." });
    }
    const tbCertificateEnvironment = workflow.id === "tb" ? environment() : null;
    const tbCertificateAudit = workflow.id === "tb" &&
      ["qa", "production"].includes(tbCertificateEnvironment);
    const qaTbCertificateAudit = tbCertificateAudit && tbCertificateEnvironment === "qa";
    if (qaTbCertificateAudit && !qaTbCertificateFolderId) {
      return res.status(503).json({ status: "error", success: false,
        message: "QA 결핵검진 확인증 증빙 저장소가 설정되지 않았습니다." });
    }
    const scriptPayload = isAdminProxyTb
      ? { ...payload, fields: proxyFields }
      : (qaCprOnly || qaTbCertificateOnly)
      ? { ...payload, fields: { ...payload.fields, name: identity.identity.name, dept: identity.identity.department } }
      : payload;
    const scriptSubmission = buildScriptSubmission(workflow, scriptPayload, {
      firestoreAudit: cprAudit || tbCertificateAudit || qaStudentAudit,
      runtimeEnvironment: cprEnvironment || tbCertificateEnvironment || studentEnvironment || "",
      qaEvidenceFolderId: qaCprAudit ? qaCprFolderId : qaTbCertificateAudit ? qaTbCertificateFolderId
        : qaStudentAudit ? qaStudentReplyFolderId : "",
    });
    if (qaIdentity) {
      scriptSubmission.qaSubmissionId = qaIdentity.submissionId;
      scriptSubmission.qaRequestFingerprint = qaIdentity.requestFingerprint;
    }
    const envelope = buildSubmissionProxyEnvelope(scriptSubmission, proxySecret, { visitor });
    if (!envelope) {
      return res.status(503).json({ status: "error", success: false, message: "제출 보안 설정이 필요합니다." });
    }
    if (qaTbCertificateAudit) {
      const probe = buildSubmissionProxyEnvelope({ type: "qa-tb-upload-capability", runtimeEnvironment: "qa",
        recordMode: "firestore", qaEvidenceFolderId: qaTbCertificateFolderId }, proxySecret);
      const probeResponse = await postScript(destinationUrl, { method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(probe) });
      const capability = JSON.parse(await probeResponse.text());
      if (capability.contract !== "qa-tb-idempotency-v1" || capability.folderId !== qaTbCertificateFolderId ||
        capability.private !== true) throw new QaTbSubmissionError("QA 결핵검진 업로드 복구 계약이 준비되지 않았습니다.");
      const qaTbUploadContract = capability.contract;
      const subject = isAdminProxyTb ? proxySubject : identity.identity ? { ...identity.identity, staffId: identity.staffId } :
        resolveProxySubject((await readDirectory({ allowInvalidEmploymentStatus: false })).directory, identity.staffId);
      const actor = isAdminProxyTb ? proxyAdministrator : subject;
      const receipt = await receiveQaTbSubmission({ ...scriptPayload, schoolYear: tbSchoolYear,
        staffId: subject.staffId, actorStaffId: actor.staffId, subject, actor,
        completedStatus: !isAdminProxyTb && identity.statusValue === "completed",
        submissionMode: isAdminProxyTb ? "admin_proxy" : "self" }, {
        db: isAdminProxyTb ? proxyAccess.db : identity.db, secret: proxySecret, folderId: qaTbCertificateFolderId,
        uploadContract: qaTbUploadContract, certificateStore: tbCertificateStore, recordReceipt: recordTbReceipt, now,
        upload: async (stableIdentity) => {
          const stableSubmission = { ...scriptSubmission, qaSubmissionId: stableIdentity.submissionId,
            qaRequestFingerprint: stableIdentity.requestFingerprint, schoolYear: tbSchoolYear,
            qaUploadContract: qaTbUploadContract };
          const signed = buildSubmissionProxyEnvelope(stableSubmission, proxySecret);
          const response = await postScript(destinationUrl, { method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(signed) });
          const result = JSON.parse(await response.text());
          if (!isSuccessfulResponse(result)) throw new Error("QA upload failed");
          return result;
        },
      });
      return res.status(200).json(receipt);
    }
    const scriptRes = await postScript(destinationUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(envelope),
    });

    const text = await scriptRes.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return res.status(502).json({
        status: "error",
        success: false,
        message: "Apps Script 응답을 JSON으로 해석할 수 없습니다.",
      });
    }
    if (!isSuccessfulResponse(json)) {
      if (qaStudentAudit && json.qaFailureStage) console.error("[STUDENT_REPLY_QA_SCRIPT]", json.qaFailureStage);
      return res.status(200).json({ status: "error", success: false, message: "제출을 처리하지 못했습니다. 보건실에 문의해 주세요." });
    }
    if (qaStudentAudit) {
      if (!json.fileId) return res.status(502).json({ status: "error", success: false,
        message: "QA 증빙 파일 ID를 확인할 수 없습니다." });
      try {
        await studentAuditStore.createQaRequest({ requestId: qaIdentity.submissionId,
          requestFingerprint: qaIdentity.requestFingerprint, evidenceSha256: qaIdentity.evidenceSha256,
          idempotencyVersion: qaIdentity.idempotencyVersion, fields: payload.fields,
          evidenceFile: { fileId: json.fileId, fileName: payload.fileName, mimeType: payload.fileMimeType }, now });
      } catch {
        console.error("[STUDENT_REPLY_QA_AUDIT_WRITE] Partial failure", {
          submissionId: qaIdentity.submissionId, fileId: json.fileId,
          requestFingerprint: qaIdentity.requestFingerprint, status: "partial_failure" });
        return res.status(503).json({ status: "error", success: false,
          submissionId: qaIdentity.submissionId,
          message: "증빙 파일은 저장되었지만 QA 접수 이력을 기록하지 못했습니다. 관리자에게 문의해 주세요." });
      }
      return res.status(200).json({ status: "success", success: true, submittedAt: json.submittedAt,
        submissionId: qaIdentity.submissionId });
    }
    if (isAdminProxyTb) {
      const evidenceFile = { fileId: json.fileId, fileName: payload.fileName, mimeType: payload.fileMimeType };
      try {
        await tbCertificateStore.createRequest({ staffId: proxySubject.staffId, submittedAt: now,
          checkupDate: payload?.fields?.checkupDate, documentType: payload?.fields?.docType, evidenceFile,
          submissionMode: "admin_proxy", subject: proxySubject, submittedBy: proxyAdministrator,
          proxyNote: payload?.proxyNote });
        const file = { driveFileId: json.fileId, fileName: payload.fileName, mimeType: payload.fileMimeType,
          driveUrl: json.fileUrl || json.fileLink || json.driveUrl || null };
        const record = buildProxySubmissionRecord({ subject: proxySubject, administrator: proxyAdministrator,
          checkupDate: payload?.fields?.checkupDate, documentType: payload?.fields?.docType,
          proxyNote: payload?.proxyNote, file, now });
        const saved = await saveProxySubmission(proxyAccess.db, record,
          { collectionName: proxyCollectionName });
        await saveTbStatus({ db: proxyAccess.db,
          payload: buildTbStatusPayload(payload, proxySubject.staffId),
          collectionName: environment() === "qa" ? "staff_submission_status_qa" : undefined });
        return res.status(200).json({ status: "success", success: true, submissionId: saved.id,
          staffId: proxySubject.staffId });
      } catch {
        console.error("[ADMIN_PROXY_TB_WRITE] Partial failure");
        return res.status(503).json({ status: "error", success: false,
          message: "파일은 저장되었지만 대리등록 기록을 완료하지 못했습니다. 보건실 관리자에게 문의해 주세요." });
      }
    }
    if (tbGuard) {
      if (tbCertificateAudit) {
        try {
          await tbCertificateStore.createRequest({ staffId: tbGuard.staffId, submittedAt: now,
            checkupDate: payload?.fields?.checkupDate, documentType: payload?.fields?.docType,
            evidenceFile: { fileId: json.fileId, fileName: payload.fileName, mimeType: payload.fileMimeType } });
        } catch {
          console.error("[TB_CERTIFICATE_AUDIT_WRITE] Firestore audit write failed.");
          return res.status(503).json({ status: "error", success: false,
            message: "확인증 파일은 저장되었지만 접수 이력을 기록하지 못했습니다. 보건실에 문의해 주세요." });
        }
      }
      try {
        await saveTbStatus({
          db: tbGuard.db || getFirebaseAdminDb(),
          payload: buildTbStatusPayload(payload, tbGuard.staffId),
          collectionName: qaTbCertificateAudit ? "staff_submission_status_qa" : undefined,
        });
      } catch {
        console.error("[TB_STATUS_WRITE] Firestore status update failed.");
        return res.status(503).json({
          status: "error",
          success: false,
          message: "신청 자료는 접수되었지만 결핵검진 현황을 갱신하지 못했습니다. 보건실에 문의해 주세요.",
        });
      }
      json = tbCertificateAudit
        ? { status: "success", success: true, staffId: tbGuard.staffId }
        : { ...json, staffId: tbGuard.staffId };
    }
    if (workflow.id === "cpr" && cprIdentity) {
      if (cprAudit) {
        try {
          await cprCertificateStore.createRequest({
            staffId: cprIdentity.staffId,
            submittedAt: now,
            completionDate: payload?.fields?.completionDate,
            institution: payload?.fields?.institution,
            evidenceFile: { fileId: json.fileId, fileName: payload.fileName, mimeType: payload.fileMimeType },
          });
        } catch {
          console.error("[CPR_AUDIT_WRITE] Firestore audit write failed.");
          return res.status(503).json({ status: "error", success: false,
            message: "이수증 파일은 저장되었지만 접수 이력을 기록하지 못했습니다. 보건실에 문의해 주세요." });
        }
      }
      try {
        await saveCprStatus({
          db: cprIdentity.db,
          payload: buildCprExternalSubmissionStatus({
            staffId: cprIdentity.staffId,
            trainingDate: payload?.fields?.completionDate,
            submissionStatus: "submitted",
          }),
          collectionName: qaCprAudit ? "staff_submission_status_qa" : undefined,
        });
      } catch {
        console.error("[CPR_STATUS_WRITE] Firestore status update failed.");
        return res.status(503).json({ status: "error", success: false, message: "이수증은 접수되었지만 CPR 현황을 갱신하지 못했습니다. 보건실에 문의해 주세요." });
      }
      json = cprAudit
        ? { status: "success", success: true, staffId: cprIdentity.staffId }
        : { ...json, staffId: cprIdentity.staffId };
    }
    if (workflow.id === "inbody" && cprIdentity) json = { ...json, staffId: cprIdentity.staffId };
    if (workflow.id === "student_tb_reply") {
      const { folderId, fileUrl, ...safeJson } = json;
      json = safeJson;
    }
    return res.status(200).json(json);
  } catch (err) {
    if (err instanceof QaTbSubmissionError) return res.status(err.status).json({ status: "error", success: false,
      message: err.message, ...(err.identity ? { submissionId: err.identity.submissionId, fileId: err.identity.fileId } : {}) });
    console.error("[SUBMISSION_PROXY_FAILED]", { name: err?.name || "Error" });
    return res.status(500).json({ status: "error", message: "제출을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
  }
}
