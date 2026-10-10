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
import { buildSubmissionProxyEnvelope, submissionVisitor } from "../server/lib/submissionProxyEnvelope.js";
import { assertRegistrationOpen, readSubmissionConfig, SubmissionConfigError } from "../server/lib/submissionConfig.js";
import { inbodyRequestStore } from "../server/lib/inbodyRequestStore.js";

function scriptUrl() {
  return process.env.GAS_URL || process.env.VITE_GAS_BASE_URL || "";
}

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

export default async function handler(req, res, { postScript = fetch, verifyStaff = verifyCurrentStaffSubmissionIdentity, verifyTb = verifyTbSubmissionAllowed, destinationUrl = scriptUrl(), proxySecret = process.env.SUBMISSION_PROXY_SECRET,
  loadSubmissionConfig = () => readSubmissionConfig(getFirebaseAdminDb()), inbodyStore = inbodyRequestStore, now = new Date() } = {}) {
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

    const workflow = resolveSubmissionWorkflow(payload);
    const validation = validateSubmissionPayload(workflow, payload);
    if (!validation.ok) return res.status(validation.status).json({ status: "error", success: false, message: validation.message });

    let tbGuard = null;
    let cprIdentity = null;
    if (workflow.authPolicy === "current_staff_tb_guard") {
      tbGuard = await verifyTb(req);
      if (!tbGuard.ok) {
        return res.status(tbGuard.status).json({ status: "error", success: false, message: tbGuard.message });
      }
    }
    if (workflow.authPolicy === "current_staff") {
      cprIdentity = await verifyStaff(req);
      if (!cprIdentity.ok) return res.status(cprIdentity.status).json({ status: "error", success: false, message: cprIdentity.message });
    }
    const identity = tbGuard || cprIdentity;
    if (workflow.requiresCanonicalStaffId && (!identity?.staffId || !identity.roles?.some((role) => workflow.allowedRoles.includes(role)))) {
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
      if (inbodyStore.backend === "firestore") {
        const saved = await inbodyStore.createRequest({ staffId: identity.staffId, fields: payload.fields, now });
        return res.status(200).json({ status: "success", success: true, requestId: saved.requestId,
          submittedAt: saved.submittedAt, staffId: saved.staffId });
      }
      if (inbodyStore.backend !== "sheet") throw new Error("인바디 신청 저장 환경을 확인할 수 없습니다.");
    }

    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(destinationUrl)) {
      return res.status(503).json({ status: "error", success: false, message: "제출 저장소가 설정되지 않았습니다." });
    }
    const visitor = workflow.id === "student_tb_reply" ? submissionVisitor(req, proxySecret) : "";
    if (workflow.id === "student_tb_reply" && !visitor) {
      return res.status(503).json({ status: "error", success: false, message: "익명 제출 보호 설정을 확인해 주세요." });
    }
    const envelope = buildSubmissionProxyEnvelope(buildScriptSubmission(workflow, payload), proxySecret, { visitor });
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
      return res.status(200).json({ status: "error", success: false, message: "제출을 처리하지 못했습니다. 보건실에 문의해 주세요." });
    }
    if (tbGuard) {
      try {
        await saveTbScreeningStatus({
          db: getFirebaseAdminDb(),
          payload: buildTbStatusPayload(payload, tbGuard.staffId),
        });
      } catch {
        console.error("[TB_STATUS_WRITE] Firestore status update failed.");
        return res.status(503).json({
          status: "error",
          success: false,
          message: "신청 자료는 접수되었지만 결핵검진 현황을 갱신하지 못했습니다. 보건실에 문의해 주세요.",
        });
      }
      json = { ...json, staffId: tbGuard.staffId };
    }
    if (workflow.id === "cpr" && cprIdentity) {
      try {
        await saveCprTrainingStatus({
          db: cprIdentity.db,
          payload: buildCprExternalSubmissionStatus({
            staffId: cprIdentity.staffId,
            trainingDate: payload?.fields?.completionDate,
            submissionStatus: "submitted",
          }),
        });
      } catch {
        console.error("[CPR_STATUS_WRITE] Firestore status update failed.");
        return res.status(503).json({ status: "error", success: false, message: "이수증은 접수되었지만 CPR 현황을 갱신하지 못했습니다. 보건실에 문의해 주세요." });
      }
      json = { ...json, staffId: cprIdentity.staffId };
    }
    if (workflow.id === "inbody" && cprIdentity) json = { ...json, staffId: cprIdentity.staffId };
    if (workflow.id === "student_tb_reply") {
      const { folderId, fileUrl, ...safeJson } = json;
      json = safeJson;
    }
    return res.status(200).json(json);
  } catch (err) {
    console.error("[SUBMISSION_PROXY_FAILED]", { name: err?.name || "Error" });
    return res.status(500).json({ status: "error", message: "제출을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
  }
}
