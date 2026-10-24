import { FirebaseConfigurationError } from "../common/firebaseEnvironment.js";
import { isRetiredStudentReply, STUDENT_REPLY_RETIRED_CODE, STUDENT_REPLY_RETIRED_MESSAGE } from "../common/studentReplyRetirement.js";
import { handleStaffFileSubmission } from "../server/lib/staffFileSubmission.js";
import { ReceiptError } from "../server/lib/staffReceiptProtocol.js";
import { serverFirestoreResource } from "../server/lib/firestoreResources.js";
import { resourceEnvironment, gasResource, resourceSecret, driveFolderResource, ResourcePolicyError, sendResourceError } from "../server/lib/environmentResources.js";
import fetch from "node-fetch";
import { verifyCurrentStaffSubmissionIdentity, verifyTbSubmissionAllowed } from "../server/lib/tbSubmissionGuard.js";
import { getFirebaseAdminDb } from "../server/lib/firebaseAdmin.js";
import {
  buildTbCertificateStatus,
  buildTbRegistrationStatus,
  saveTbScreeningStatus,
} from "../server/lib/tbScreeningStatus.js";
import { saveCprTrainingStatus } from "../server/lib/cprTrainingStatus.js";
import { buildScriptSubmission, resolveSubmissionWorkflow, validateSubmissionPayload } from "../server/lib/submissionWorkflows.js";
import { buildSubmissionProxyEnvelope, studentSubmissionIdentity, submissionVisitor } from "../server/lib/submissionProxyEnvelope.js";
import { assertRegistrationOpen, readSubmissionConfig, SubmissionConfigError } from "../server/lib/submissionConfig.js";
import { inbodyRequestStore } from "../server/lib/inbodyRequestStore.js";
import { tbRegistrationRequestStore } from "../server/lib/tbRegistrationRequestStore.js";
import { studentSubmissionAuditStore } from "../server/lib/studentSubmissionAuditStore.js";
import { trainingEnvironment } from "../server/lib/trainingDeployment.js";
import { recordProductionTbReceipt } from "../server/lib/tbScreeningWorkflowStore.js";
import { createProxySubmission, findProxyDuplicates, resolveProxySubject } from "../server/lib/adminProxySubmission.js";
import { readStaffDirectory, verifyDirectoryAdmin } from "../server/lib/staffDirectory.js";


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

function isRecordedStudentSubmission(record, identity, environment, mimeType, fileId = null) {
  const evidence = record?.evidenceFiles?.[0];
  return record?.submissionId && record.environment === environment &&
    record.source === `${environment}_signed_submission` && record.status === "recorded" &&
    record.signedPath === true && record.manualReview === false &&
    record.evidenceSha256 === identity.evidenceSha256 && evidence?.exists === true &&
    evidence.fileId && evidence.mimeType?.toLowerCase() === mimeType.toLowerCase() &&
    (!fileId || evidence.fileId === fileId) &&
    (record.submissionId !== identity.submissionId || record.requestFingerprint === identity.requestFingerprint);
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

export default async function handler(req, res, { postScript = fetch, verifyStaff = verifyCurrentStaffSubmissionIdentity, verifyTb = verifyTbSubmissionAllowed, context = process.env, destinationUrl, proxySecret,
  qaCprFolderId = process.env.QA_CPR_DRIVE_FOLDER_ID,
  qaTbCertificateFolderId = process.env.QA_TB_CERTIFICATE_DRIVE_FOLDER_ID,
  qaStudentReplyFolderId = process.env.QA_STUDENT_REPLY_DRIVE_FOLDER_ID,
  loadSubmissionConfig = () => readSubmissionConfig(getFirebaseAdminDb()), inbodyStore = inbodyRequestStore,
  tbRegistrationStore = tbRegistrationRequestStore, cprCertificateStore,
  tbCertificateStore,
  studentAuditStore = studentSubmissionAuditStore,
  saveTbStatus = saveTbScreeningStatus, saveCprStatus = saveCprTrainingStatus,
  environment = () => trainingEnvironment(context), recordTbReceipt = recordProductionTbReceipt,
  verifyAdmin = verifyDirectoryAdmin, readDirectory = readStaffDirectory,
  findProxyRecords = findProxyDuplicates, saveProxyRecord = createProxySubmission, now = new Date() } = {}) {
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

    if (isLegacyInfectionSubmit(payload)) {
      return res.status(410).json({
        status: "error",
        success: false,
        message: "감염병 보고는 로그인 후 새 감염병 보고 화면에서 제출해 주세요.",
        redirectTo: "/firebase-submit/infection",
      });
    }

    if (isRetiredStudentReply(payload?.type)) {
      return res.status(410).json({ status: "error", success: false,
        code: STUDENT_REPLY_RETIRED_CODE, message: STUDENT_REPLY_RETIRED_MESSAGE });
    }
    const workflow = resolveSubmissionWorkflow(payload);
    const resume = payload?.resumeReceiptId !== undefined;
    const validation = resume
      ? { ok: ["cpr", "tb"].includes(workflow?.id) && typeof payload.resumeReceiptId === "string" &&
          /^(cpr|tb)-[a-f0-9]{32}$/.test(payload.resumeReceiptId), status: 400, message: "접수 확인 요청을 확인해 주세요." }
      : validateSubmissionPayload(workflow, payload);
    if (!validation.ok) return res.status(validation.status).json({ status: "error", success: false, message: validation.message });

    const runtime = resourceEnvironment(context);
    if (environment() !== runtime) throw new ResourcePolicyError("RESOURCE_ENV_MISMATCH");
    if (workflow.acceptsFile) {
      destinationUrl = gasResource("submission", context);
      proxySecret = resourceSecret("submission", context);
      const folder = driveFolderResource(workflow.id, context);
      qaCprFolderId = workflow.id === "cpr" ? folder : "";
      qaTbCertificateFolderId = workflow.id === "tb" ? folder : "";
      qaStudentReplyFolderId = workflow.id === "student_tb_reply" ? folder : "";
    }

    const proxyMode = workflow.id === "tb" && payload.action === "admin_proxy";
    let proxyAccess = null;
    let proxySubject = null;
    let proxyAdministrator = null;
    if (proxyMode) {
      if (environment() !== "production") return res.status(403).json({ status: "error", success: false, message: "운영 관리자 대리등록 경로가 아닙니다." });
      proxyAccess = await verifyAdmin(req);
      if (!proxyAccess.ok) return res.status(proxyAccess.status).json({ status: "error", success: false, message: proxyAccess.message });
      const actor = proxyAccess.assignment;
      if (actor?.uid !== proxyAccess.decodedToken?.uid || actor?.schoolYear !== 2026 || actor?.semester !== 2 || actor?.active !== true ||
          !actor.roles?.some((role) => ["admin", "health_teacher"].includes(role))) {
        return res.status(403).json({ status: "error", success: false, code: "ADMIN_ASSIGNMENT_MISMATCH", message: "현재 학기 관리자 권한이 필요합니다." });
      }
      serverFirestoreResource(proxyAccess.db, "submissions", context);
      const { directory } = await readDirectory({ allowInvalidEmploymentStatus: false });
      try { proxySubject = resolveProxySubject(directory, payload.subjectStaffId); }
      catch (error) { return res.status(400).json({ status: "error", success: false, message: error.message }); }
      proxyAdministrator = { staffId: proxyAccess.assignment.staffId,
        name: proxyAccess.assignment.displayName || proxyAccess.assignment.name || proxyAccess.decodedToken?.name || "관리자" };
    }
    let tbGuard = null;
    let cprIdentity = null;
    if (workflow.authPolicy === "current_staff_tb_guard" && !proxyMode) {
      tbGuard = await verifyTb(req, { context, allowRecordedRetry: workflow.id === "tb", allowQaTbCertificateSynthetic: workflow.id === "tb" && environment() === "qa",
        ...(workflow.id === "tb" ? { schoolYear: payload.schoolYear } : {}) });
      if (!tbGuard.ok) {
        return res.status(tbGuard.status).json({ status: "error", success: false, message: tbGuard.message });
      }
    }
    if (workflow.authPolicy === "current_staff") {
      cprIdentity = await verifyStaff(req, {
        context,
        allowQaInbodySynthetic: workflow.id === "inbody" && trainingEnvironment(context) === "qa",
        allowQaCprSynthetic: workflow.id === "cpr" && trainingEnvironment(context) === "qa",
      });
      if (!cprIdentity.ok) return res.status(cprIdentity.status).json({ status: "error", success: false, message: cprIdentity.message });
    }
    const identity = proxyMode ? { staffId: proxySubject.staffId, roles: proxyAccess.assignment.roles || [] } : tbGuard || cprIdentity;
    const qaInbodyOnly = workflow.id === "inbody" && inbodyStore.backend === "firestore" && identity?.qaSynthetic === true;
    const qaCprOnly = workflow.id === "cpr" && environment() === "qa" && identity?.qaCprSynthetic === true;
    const qaTbCertificateOnly = workflow.id === "tb" && environment() === "qa" && identity?.qaTbCertificateSynthetic === true;
    if (workflow.requiresCanonicalStaffId && (!identity?.staffId ||
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
          context,
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

    if (["cpr", "tb"].includes(workflow.id)) {
      const result = await handleStaffFileSubmission({ payload, workflow, identity, context, runtime, postScript, destinationUrl, proxySecret,
        folder: workflow.id === "cpr" ? qaCprFolderId : qaTbCertificateFolderId,
        proxyAccess, proxySubject, proxyAdministrator, cprCertificateStore, tbCertificateStore,
        saveTbStatus, saveCprStatus, saveProxyRecord, recordTbReceipt, readDirectory, findProxyRecords, now });
      return res.status(result.status).json(result.body);
    }

    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(destinationUrl)) {
      return res.status(503).json({ status: "error", success: false, message: "제출 저장소가 설정되지 않았습니다." });
    }
    const studentEnvironment = workflow.id === "student_tb_reply" ? environment() : null;
    const qaStudentAudit = studentEnvironment === "qa";
    const studentAudit = ["qa", "production"].includes(studentEnvironment);
    const visitor = workflow.id === "student_tb_reply"
      ? submissionVisitor(req, proxySecret, { trustedVercel: studentAudit }) : "";
    if (workflow.id === "student_tb_reply" && !visitor) {
      return res.status(503).json({ status: "error", success: false, message: "익명 제출 보호 설정을 확인해 주세요." });
    }
    if (workflow.id === "student_tb_reply" && !["qa", "production"].includes(studentEnvironment)) {
      return res.status(403).json({ status: "error", success: false, message: "승인된 배포 환경에서만 제출할 수 있습니다." });
    }
    if (qaStudentAudit && !qaStudentReplyFolderId) {
      return res.status(503).json({ status: "error", success: false,
        message: "QA 학생 증빙 저장소가 설정되지 않았습니다." });
    }
    if (qaStudentAudit && (String(payload.fields?.studentName || "").trim() !== "[QA] synthetic" ||
      !String(payload.fileName || "").includes("QA"))) {
      return res.status(403).json({ status: "error", success: false, message: "QA 합성 제출만 허용됩니다." });
    }
    if (studentEnvironment === "production" &&
      /\[QA(?:-|\])/.test(String(payload.fields?.studentName || ""))) {
      return res.status(403).json({ status: "error", success: false, message: "QA 테스트 제출은 운영에서 허용되지 않습니다." });
    }
    const studentIdentity = studentAudit ? studentSubmissionIdentity(payload, proxySecret, studentEnvironment) : null;
    if (studentAudit && !studentIdentity) return res.status(503).json({ status: "error", success: false,
      message: "접수 식별자를 생성할 수 없습니다." });
    if (studentAudit) {
      if (studentAuditStore.environment !== studentEnvironment) throw new Error("감사 원장 환경이 일치하지 않습니다.");
      const existing = await studentAuditStore.getRequest(studentIdentity.submissionId) ||
        await studentAuditStore.getEvidenceMatch({ evidenceSha256: studentIdentity.evidenceSha256,
          fileMimeType: payload.fileMimeType, fields: payload.fields });
      if (existing) {
        if (!isRecordedStudentSubmission(existing, studentIdentity, studentEnvironment, payload.fileMimeType)) {
          return res.status(409).json({ status: "error", success: false,
            message: "기존 접수의 증빙 파일을 확인할 수 없습니다. 관리자에게 문의해 주세요." });
        }
        return res.status(200).json({ status: "success", success: true, duplicate: true,
          submissionId: existing.submissionId, submittedAt: existing.submittedAt });
      }
    }
    const scriptSubmission = buildScriptSubmission(workflow, payload, {
      firestoreAudit: studentAudit, runtimeEnvironment: studentEnvironment || "",
      qaEvidenceFolderId: qaStudentAudit ? qaStudentReplyFolderId : "",
    });
    if (studentIdentity) {
      scriptSubmission.qaSubmissionId = studentIdentity.submissionId;
      scriptSubmission.qaRequestFingerprint = studentIdentity.requestFingerprint;
    }
    const envelope = buildSubmissionProxyEnvelope(scriptSubmission, proxySecret, { visitor });
    if (!envelope) {
      return res.status(503).json({ status: "error", success: false, message: "제출 보안 설정이 필요합니다." });
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
    if (studentAudit) {
      if (!json.fileId) return res.status(502).json({ status: "error", success: false,
        message: "증빙 파일 ID를 확인할 수 없습니다." });
      try {
        await studentAuditStore.createRequest({ requestId: studentIdentity.submissionId,
          requestFingerprint: studentIdentity.requestFingerprint, evidenceSha256: studentIdentity.evidenceSha256,
          idempotencyVersion: studentIdentity.idempotencyVersion, fields: payload.fields,
          evidenceFile: { fileId: json.fileId, fileName: payload.fileName, mimeType: payload.fileMimeType }, now });
      } catch {
        try {
          const recorded = await studentAuditStore.getRequest(studentIdentity.submissionId);
          if (isRecordedStudentSubmission(recorded, studentIdentity, studentEnvironment, payload.fileMimeType, json.fileId)) {
            return res.status(200).json({ status: "success", success: true, duplicate: true,
              submissionId: recorded.submissionId, submittedAt: recorded.submittedAt });
          }
          if (recorded) return res.status(409).json({ status: "error", success: false,
            submissionId: studentIdentity.submissionId, message: "접수 기록과 증빙 파일이 일치하지 않습니다. 관리자에게 문의해 주세요." });
        } catch (readError) {
          console.error("[STUDENT_REPLY_AUDIT_READ] Unable to verify recorded submission", { environment: studentEnvironment,
            submissionId: studentIdentity.submissionId, code: readError?.code || "unknown" });
        }
        console.error("[STUDENT_REPLY_AUDIT_WRITE] Partial failure", {
          environment: studentEnvironment, submissionId: studentIdentity.submissionId, fileId: json.fileId,
          requestFingerprint: studentIdentity.requestFingerprint, status: "partial_failure" });
        return res.status(503).json({ status: "error", success: false,
          submissionId: studentIdentity.submissionId,
          message: "증빙 파일은 저장되었지만 접수 이력을 기록하지 못했습니다. 관리자에게 문의해 주세요." });
      }
      return res.status(200).json({ status: "success", success: true, submittedAt: json.submittedAt,
        submissionId: studentIdentity.submissionId });
    }
    if (workflow.id === "student_tb_reply") {
      const { folderId, fileUrl, ...safeJson } = json;
      json = safeJson;
    }
    return res.status(200).json(json);
  } catch (err) {
    if (err instanceof FirebaseConfigurationError) return res.status(503).json({ status: "error", success: false, code: "FIREBASE_CONFIGURATION_REJECTED", message: "제출 저장소 설정을 확인해 주세요." });
    if (err instanceof ReceiptError) return res.status(err.status).json({ status: "error", success: false, code: err.code, message: err.message });
    if (err instanceof ResourcePolicyError) return sendResourceError(res, err);
    console.error("[SUBMISSION_PROXY_FAILED]", { name: err?.name || "Error" });
    return res.status(500).json({ status: "error", message: "제출을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
  }
}
