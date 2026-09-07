import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "../lib/firebaseAdmin.js";
import { getAdminPushTokenId, verifyAdminRequestUser } from "../lib/adminPushNotifications.js";

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const bodyText = Buffer.concat(chunks).toString("utf8");
  return bodyText ? JSON.parse(bodyText) : {};
}

function normalizePlatform(value) {
  const platform = String(value || "").trim().replace(/\s+/g, " ");
  return platform.slice(0, 40) || "web";
}

function normalizeUserAgent(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 180);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });

  try {
    const verified = await verifyAdminRequestUser(req);
    if (!verified.ok) return res.status(verified.status).json({ ok: false, message: verified.message });

    const body = await readJsonBody(req);
    const token = String(body.token || "").trim();
    if (!token || token.length < 20) {
      return res.status(400).json({ ok: false, message: "알림 기기 정보를 확인하지 못했습니다." });
    }

    const now = Timestamp.now();
    const tokenRef = getFirebaseAdminDb()
      .collection("admin_push_tokens")
      .doc(verified.uid)
      .collection("tokens")
      .doc(getAdminPushTokenId(token));

    await getFirebaseAdminDb().runTransaction(async (transaction) => {
      const tokenSnapshot = await transaction.get(tokenRef);
      transaction.set(tokenRef, {
        token,
        platform: normalizePlatform(body.platform),
        userAgent: normalizeUserAgent(req.headers["user-agent"] || body.userAgent),
        active: true,
        createdAt: tokenSnapshot.exists ? tokenSnapshot.data().createdAt || now : now,
        updatedAt: now,
      }, { merge: true });
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[admin-push] token registration failed", error?.message || error);
    return res.status(500).json({ ok: false, message: "알림 기기를 등록하지 못했습니다." });
  }
}
