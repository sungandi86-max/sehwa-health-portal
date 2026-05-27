import fetch from "node-fetch";

function getScriptUrl() {
  return process.env.GAS_URL || process.env.VITE_GAS_BASE_URL || "";
}

function jsonError(res, status, message, debug) {
  return res.status(status).json({
    success: false,
    result: "error",
    message,
    debug,
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    return jsonError(res, 405, "허용되지 않는 요청 방식입니다.", `method=${req.method}`);
  }

  const scriptUrl = getScriptUrl();
  if (!scriptUrl) {
    return jsonError(
      res,
      500,
      "포털 데이터 Apps Script URL이 설정되지 않았습니다. Vercel의 GAS_URL 또는 VITE_GAS_BASE_URL 환경변수를 확인해 주세요.",
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

  const targetUrl = `${scriptUrl}?mode=portal`;
  console.log("[portal] proxy request", { mode: "portal" });

  try {
    const scriptRes = await fetch(targetUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const text = await scriptRes.text();
    const contentType = scriptRes.headers.get("content-type") || "";

    console.log("[portal] Apps Script response", {
      status: scriptRes.status,
      ok: scriptRes.ok,
      contentType,
      body: text,
    });

    if (!scriptRes.ok) {
      return jsonError(
        res,
        502,
        "Apps Script 포털 데이터 응답 상태가 정상 범위가 아닙니다. 웹앱 배포 권한과 GAS_URL을 확인해 주세요.",
        `Apps Script HTTP ${scriptRes.status}: ${text.slice(0, 500)}`
      );
    }

    const trimmed = text.trim();
    if (trimmed.startsWith("<") || /<html|<!doctype/i.test(trimmed)) {
      return jsonError(
        res,
        502,
        "Apps Script가 JSON이 아닌 HTML을 반환했습니다. 로그인 페이지, 권한 오류, 또는 잘못된 배포 URL일 수 있습니다.",
        text.slice(0, 500)
      );
    }

    try {
      const json = JSON.parse(text);
      return res.status(200).json(json);
    } catch (error) {
      console.error("[portal] JSON parse failed", error);
      return jsonError(
        res,
        502,
        "Apps Script 포털 데이터 응답을 JSON으로 해석할 수 없습니다.",
        text.slice(0, 500)
      );
    }
  } catch (error) {
    console.error("[portal] proxy failed", error);
    return jsonError(
      res,
      502,
      "Apps Script 포털 데이터 요청에 실패했습니다. 네트워크, 배포 URL, Vercel 환경변수를 확인해 주세요.",
      error.message
    );
  }
}
