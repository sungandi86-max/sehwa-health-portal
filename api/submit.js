import fetch from "node-fetch";
import { isTbScreeningSubmission, verifyTbSubmissionAllowed } from "../server/lib/tbSubmissionGuard.js";
import { getFirebaseAdminDb } from "../server/lib/firebaseAdmin.js";
import {
  buildTbCertificateStatus,
  buildTbRegistrationStatus,
  saveTbScreeningStatus,
} from "../server/lib/tbScreeningStatus.js";

const SCRIPT_URL =
  process.env.GAS_URL ||
  "https://script.google.com/macros/s/AKfycby74IilU88WnpwbJNNcXxO1llF8VdBuhrMVk5PnFUzZy0DfXm-dSqyBhPB3_Uu2KNQ/exec";

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
  if (payload?.type === "tb" || payload?.sheetName === "응답_결핵검진확인증") {
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
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

    let tbGuard = null;
    if (isTbScreeningSubmission(payload)) {
      tbGuard = await verifyTbSubmissionAllowed(req);
      if (!tbGuard.ok) {
        return res.status(tbGuard.status).json({ status: "error", success: false, message: tbGuard.message });
      }
    }

    const scriptRes = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: rawBody,
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
    if (tbGuard && isSuccessfulResponse(json)) {
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
    return res.status(200).json(json);
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}
