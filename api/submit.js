import fetch from "node-fetch";

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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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

    const scriptRes = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: rawBody,
    });

    const text = await scriptRes.text();
    console.log("Apps Script response:", text.slice(0, 500));
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
    return res.status(200).json(json);
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}
