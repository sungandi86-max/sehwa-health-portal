import fetch from "node-fetch";

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxuO7QSiuGGBH5IngMlpMqpZvDhs-mpQhcrYa1SD40gB5gewx-Gs5EUHfuZX0eRDr68/exec";

export const config = {
  api: { bodyParser: false }
};

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

    const scriptRes = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: rawBody,
    });

    const text = await scriptRes.text();
    console.log("Apps Script response:", text);
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { status: "success" };
    }
    return res.status(200).json(json);
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}
