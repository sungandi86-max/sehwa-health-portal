const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxuO7QSiuGGBH5IngMlpMqpZvDhs-mpQhcrYa1SD40gB5gewx-Gs5EUHfuZX0eRDr68/exec";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ status: "error", message: "Method not allowed" });
  }

  try {
    const scriptRes = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(req.body),
    });

    const json = await scriptRes.json();
    return res.status(200).json(json);
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
}
