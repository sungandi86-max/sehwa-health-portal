import fetch from "node-fetch";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "./lib/firebaseAdmin.js";

const CURRENT_SCHOOL_YEAR = 2026;
const CURRENT_SEMESTER = 2;

function getAssignmentId(uid, schoolYear = CURRENT_SCHOOL_YEAR, semester = CURRENT_SEMESTER) {
  return `${uid}_${schoolYear}_${semester}`;
}

function getScriptUrl() {
  return process.env.GAS_URL || process.env.VITE_GAS_BASE_URL || "";
}

async function getRequestParams(req) {
  if (req.method === "GET") {
    return req.query || {};
  }

  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return {};
    }
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const bodyText = Buffer.concat(chunks).toString("utf8");
  if (!bodyText) return {};

  try {
    return JSON.parse(bodyText);
  } catch {
    return {};
  }
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

function getStudentCareProxySecret() {
  return process.env.STUDENT_CARE_PROXY_SECRET || "";
}

function hasRole(assignment, role) {
  return Array.isArray(assignment?.roles) && assignment.roles.includes(role);
}

function hasAnyRole(assignment, roles) {
  return roles.some((role) => hasRole(assignment, role));
}

function isActiveAssignment(assignment) {
  return assignment?.active === true;
}

function isHomeroomAssignment(assignment) {
  return (
    isActiveAssignment(assignment) &&
    hasRole(assignment, "homeroom") &&
    Number.isFinite(Number(assignment.grade)) &&
    Number.isFinite(Number(assignment.classNo))
  );
}

function isAdminAssignment(assignment) {
  return isActiveAssignment(assignment) && hasAnyRole(assignment, ["health_teacher", "admin"]);
}

function isLegacyAdminAction(params) {
  return [
    "verifyAdminMaster",
    "getAdminReceiptSummary",
    "getAdminInfectionReports",
    "updateAdminInfectionReportStatus",
  ].includes(String(params.action || ""));
}

function canUseSubjectScope(assignment) {
  return isActiveAssignment(assignment) && hasAnyRole(assignment, ["staff", "homeroom", "health_teacher", "admin"]);
}

function sanitizeForLog(params) {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      /password|secret|token/i.test(key) ? "[hidden]" : value,
    ])
  );
}

function sanitizeDebugMessage(message) {
  return String(message || "")
    .replace(/([?&](?:proxySecret|password|token)=)[^&\s]+/gi, "$1[hidden]")
    .replace(/(Bearer\s+)[^\s]+/gi, "$1[hidden]");
}

function jsonError(res, status, message, debug) {
  return res.status(status).json({
    success: false,
    result: "error",
    message,
    debug: sanitizeDebugMessage(debug),
  });
}

async function getVerifiedStudentCareAccess(req) {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, message: "로그인이 필요한 기능입니다." };
  }

  const decodedToken = await getFirebaseAdminAuth().verifyIdToken(token);
  const db = getFirebaseAdminDb();
  const assignmentSnapshot = await db.collection("user_assignments").doc(getAssignmentId(decodedToken.uid)).get();

  if (!assignmentSnapshot.exists) {
    return { ok: false, status: 403, message: "현재 학년도/학기 이용 권한이 등록되지 않았습니다." };
  }

  const assignment = assignmentSnapshot.data();
  if (!isActiveAssignment(assignment)) {
    return { ok: false, status: 403, message: "현재 학기 이용 권한이 비활성 상태입니다." };
  }

  return { ok: true, decodedToken, assignment };
}

function buildAuthorizedLegacyAdminParams(params, assignment) {
  if (!isLegacyAdminAction(params)) {
    return { ok: false, status: 400, message: "지원하지 않는 관리자 요청입니다." };
  }
  if (!isAdminAssignment(assignment)) {
    return { ok: false, status: 403, message: "관리자 권한이 없습니다." };
  }

  const proxySecret = getStudentCareProxySecret();
  if (!proxySecret) {
    return { ok: false, status: 500, message: "관리자 서버 보호 설정이 필요합니다." };
  }

  const payload = {
    proxySecret,
    action: String(params.action || ""),
  };

  if (params.action === "updateAdminInfectionReportStatus") {
    payload.rowId = String(params.rowId || "");
    payload.status = String(params.status || "");
  }

  return { ok: true, payload };
}

function buildAuthorizedStudentCareParams(params, assignment) {
  const action = String(params.action || "");
  const mode = String(params.mode || "");
  const accessType = String(params.accessType || "subject");
  const nextParams = new URLSearchParams();

  const proxySecret = getStudentCareProxySecret();
  if (!proxySecret) {
    return { ok: false, status: 500, message: "보건실 학생 건강관리 서버 보호 설정이 필요합니다." };
  }

  nextParams.set("proxySecret", proxySecret);

  if (action === "getHealthRoomLocation") {
    if (accessType === "subject") {
      if (!canUseSubjectScope(assignment)) {
        return { ok: false, status: 403, message: "보건실 소재 확인 권한이 없습니다." };
      }
      nextParams.set("action", "getHealthRoomLocationByAssignment");
      nextParams.set("accessType", "subject");
      return { ok: true, params: nextParams };
    }

    if (accessType === "homeroom") {
      if (!isHomeroomAssignment(assignment)) {
        return { ok: false, status: 403, message: "담임 학급 확인 권한이 없습니다." };
      }
      nextParams.set("action", "getHealthRoomLocationByAssignment");
      nextParams.set("accessType", "homeroom");
      nextParams.set("grade", String(assignment.grade));
      nextParams.set("classNo", String(assignment.classNo));
      return { ok: true, params: nextParams };
    }

    if (accessType === "admin") {
      if (!isAdminAssignment(assignment)) {
        return { ok: false, status: 403, message: "관리자 통계 권한이 없습니다." };
      }
      nextParams.set("action", "getHealthRoomLocationByAssignment");
      nextParams.set("accessType", "admin");
      return { ok: true, params: nextParams };
    }

    return { ok: false, status: 400, message: "접근 유형을 확인할 수 없습니다." };
  }

  if (action === "confirmHealthRoomHomeroom") {
    if (!isHomeroomAssignment(assignment)) {
      return { ok: false, status: 403, message: "담임 학급 확인 권한이 없습니다." };
    }
    nextParams.set("action", "confirmHealthRoomHomeroomByAssignment");
    nextParams.set("rowId", String(params.rowId || ""));
    nextParams.set("grade", String(assignment.grade));
    nextParams.set("classNo", String(assignment.classNo));
    return { ok: true, params: nextParams };
  }

  if (mode === "monthlyVisit") {
    if (!isHomeroomAssignment(assignment)) {
      return { ok: false, status: 403, message: "담임 학급 월별 조회 권한이 없습니다." };
    }
    nextParams.set("mode", "monthlyVisitByAssignment");
    nextParams.set("month", String(params.month || ""));
    nextParams.set("grade", String(assignment.grade));
    nextParams.set("classNo", String(assignment.classNo));
    return { ok: true, params: nextParams };
  }

  if (mode === "adminVisitStats") {
    if (!isAdminAssignment(assignment)) {
      return { ok: false, status: 403, message: "관리자 통계 권한이 없습니다." };
    }
    nextParams.set("mode", "adminVisitStatsByRole");
    nextParams.set("month", String(params.month || ""));
    return { ok: true, params: nextParams };
  }

  return { ok: false, status: 400, message: "지원하지 않는 학생 건강관리 요청입니다." };
}

async function forwardToAppsScript(searchParams, scriptUrl, res) {
  const targetUrl = `${scriptUrl}?${searchParams.toString()}`;

  try {
    const scriptRes = await fetch(targetUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const text = await scriptRes.text();
    const contentType = scriptRes.headers.get("content-type") || "";

    console.log("[health-room-status] Apps Script response", {
      status: scriptRes.status,
      ok: scriptRes.ok,
      contentType,
    });

    if (!scriptRes.ok) {
      return jsonError(
        res,
        502,
        "Apps Script 응답 상태가 정상 범위가 아닙니다. 웹앱 배포 권한과 GAS_URL을 확인해 주세요.",
        `Apps Script HTTP ${scriptRes.status}`
      );
    }

    const trimmed = text.trim();
    if (trimmed.startsWith("<") || /<html|<!doctype/i.test(trimmed)) {
      return jsonError(
        res,
        502,
        "Apps Script가 JSON이 아닌 HTML을 반환했습니다. 로그인 페이지, 권한 오류, 또는 잘못된 배포 URL일 수 있습니다.",
        "Apps Script returned HTML"
      );
    }

    try {
      const json = JSON.parse(text);
      return res.status(200).json(json);
    } catch (error) {
      console.error("[health-room-status] JSON parse failed", error);
      return jsonError(
        res,
        502,
        "Apps Script 응답을 JSON으로 해석할 수 없습니다.",
        "Invalid JSON from Apps Script"
      );
    }
  } catch (error) {
    console.error("[health-room-status] proxy failed", {
      name: error?.name || "Error",
      message: sanitizeDebugMessage(error?.message || "unknown"),
    });
    return jsonError(
      res,
      502,
      "Apps Script 요청에 실패했습니다. 네트워크, 배포 URL, Vercel 환경변수를 확인해 주세요.",
      error.message
    );
  }
}

async function postToAppsScript(payload, scriptUrl, res) {
  try {
    const scriptRes = await fetch(scriptUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await scriptRes.text();
    const contentType = scriptRes.headers.get("content-type") || "";

    console.log("[health-room-status] Apps Script POST response", {
      status: scriptRes.status,
      ok: scriptRes.ok,
      contentType,
    });

    if (!scriptRes.ok) {
      return jsonError(
        res,
        502,
        "Apps Script 응답 상태가 정상 범위가 아닙니다. 웹앱 배포 권한과 GAS_URL을 확인해 주세요.",
        `Apps Script HTTP ${scriptRes.status}`
      );
    }

    const trimmed = text.trim();
    if (trimmed.startsWith("<") || /<html|<!doctype/i.test(trimmed)) {
      return jsonError(
        res,
        502,
        "Apps Script가 JSON이 아닌 HTML을 반환했습니다. 로그인 페이지, 권한 오류, 또는 잘못된 배포 URL일 수 있습니다.",
        "Apps Script returned HTML"
      );
    }

    try {
      const json = JSON.parse(text);
      return res.status(200).json(json);
    } catch (error) {
      console.error("[health-room-status] POST JSON parse failed", error);
      return jsonError(
        res,
        502,
        "Apps Script 응답을 JSON으로 해석할 수 없습니다.",
        "Invalid JSON from Apps Script"
      );
    }
  } catch (error) {
    console.error("[health-room-status] POST proxy failed", {
      name: error?.name || "Error",
      message: sanitizeDebugMessage(error?.message || "unknown"),
    });
    return jsonError(
      res,
      502,
      "Apps Script 요청에 실패했습니다. 네트워크, 배포 URL, Vercel 환경변수를 확인해 주세요.",
      error.message
    );
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonError(res, 405, "허용되지 않는 요청 방식입니다.", `method=${req.method}`);
  }

  const scriptUrl = getScriptUrl();
  if (!scriptUrl) {
    return jsonError(
      res,
      500,
      "보건실 소재 확인 Apps Script URL이 설정되지 않았습니다. Vercel의 GAS_URL 또는 VITE_GAS_BASE_URL 환경변수를 확인해 주세요.",
      "missing GAS_URL and VITE_GAS_BASE_URL"
    );
  }

  if (!/\/exec(?:\?|$)/.test(scriptUrl)) {
    return jsonError(
      res,
      500,
      "Apps Script 웹앱 URL은 /exec 배포 URL이어야 합니다.",
      "GAS URL does not look like a web app /exec URL"
    );
  }

  const params = await getRequestParams(req);
  const token = getBearerToken(req);
  if (token) {
    try {
      const access = await getVerifiedStudentCareAccess(req);
      if (!access.ok) return jsonError(res, access.status, access.message);

      if (isLegacyAdminAction(params)) {
        const authorizedAdmin = buildAuthorizedLegacyAdminParams(params, access.assignment);
        if (!authorizedAdmin.ok) {
          return jsonError(res, authorizedAdmin.status, authorizedAdmin.message);
        }

        console.log("[health-room-status] firebase legacy admin request", {
          action: params.action || "",
        });
        return postToAppsScript(authorizedAdmin.payload, scriptUrl, res);
      }

      const authorized = buildAuthorizedStudentCareParams(params, access.assignment);
      if (!authorized.ok) return jsonError(res, authorized.status, authorized.message);

      console.log("[health-room-status] firebase student care request", {
        action: params.action || "",
        mode: params.mode || "",
        accessType: params.accessType || "",
      });
      return forwardToAppsScript(authorized.params, scriptUrl, res);
    } catch (error) {
      console.error("[health-room-status] firebase authorization failed", {
        code: error?.code || "",
        message: error?.message || "unknown",
      });
      return jsonError(res, 500, "학생 건강관리 권한 확인 중 오류가 발생했습니다.", error?.code || error?.message);
    }
  }

  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  });

  if (isLegacyAdminAction(params)) {
    return jsonError(res, 401, "Firebase 관리자 로그인이 필요한 요청입니다.");
  }

  console.log("[health-room-status] proxy request", {
    action: params.action,
    params: sanitizeForLog(params),
  });

  return forwardToAppsScript(searchParams, scriptUrl, res);
}
