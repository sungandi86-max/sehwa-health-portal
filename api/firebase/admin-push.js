import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "../../server/lib/firebaseAdmin.js";
import { getAdminPushTokenId, verifyAdminRequestUser } from "../../server/lib/adminPushNotifications.js";

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const bodyText = Buffer.concat(chunks).toString("utf8");
  return bodyText ? JSON.parse(bodyText) : {};
}

function serializeTimestamp(value) {
  if (!value?.toDate) return null;
  return value.toDate().toISOString();
}

function serializeNotification(docSnapshot) {
  const data = docSnapshot.data();
  return {
    id: docSnapshot.id,
    type: data.type || "admin_notice",
    title: data.title || "온라인 보건실 알림",
    body: data.body || "",
    destination: data.destination || "/firebase-dashboard",
    read: data.read === true,
    createdAt: serializeTimestamp(data.createdAt),
  };
}

function normalizePlatform(value) {
  const platform = String(value || "").trim().replace(/\s+/g, " ");
  return platform.slice(0, 40) || "web";
}

function normalizeUserAgent(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 180);
}

async function getUnreadCount(uid) {
  const inboxRef = getFirebaseAdminDb().collection("admin_notification_inboxes").doc(uid).collection("items");
  const unreadSnapshot = await inboxRef.where("read", "==", false).limit(100).get();
  return unreadSnapshot.size;
}

async function listNotifications(res, uid) {
  const inboxRef = getFirebaseAdminDb().collection("admin_notification_inboxes").doc(uid).collection("items");
  const [recentSnapshot, unreadCount] = await Promise.all([
    inboxRef.orderBy("createdAt", "desc").limit(5).get(),
    getUnreadCount(uid),
  ]);

  return res.status(200).json({
    ok: true,
    unreadCount,
    notifications: recentSnapshot.docs.map(serializeNotification),
  });
}

async function markNotificationRead(res, uid, body) {
  const notificationId = String(body.notificationId || "").trim();
  if (!/^[a-f0-9]{64}$/.test(notificationId)) {
    return res.status(400).json({ ok: false, message: "알림 정보를 확인하지 못했습니다." });
  }

  await getFirebaseAdminDb()
    .collection("admin_notification_inboxes")
    .doc(uid)
    .collection("items")
    .doc(notificationId)
    .set({
      read: true,
      readAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }, { merge: true });

  return res.status(200).json({ ok: true });
}

async function registerToken(res, uid, req, body) {
  const token = String(body.token || "").trim();
  if (!token || token.length < 20) {
    return res.status(400).json({ ok: false, message: "알림 기기 정보를 확인하지 못했습니다." });
  }

  const now = Timestamp.now();
  const tokenRef = getFirebaseAdminDb()
    .collection("admin_push_tokens")
    .doc(uid)
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
}

async function removeToken(res, uid, body) {
  const token = String(body.token || "").trim();
  const tokenId = String(body.tokenId || (token ? getAdminPushTokenId(token) : "")).trim();
  if (!/^[a-f0-9]{64}$/.test(tokenId)) {
    return res.status(400).json({ ok: false, message: "알림 기기 정보를 확인하지 못했습니다." });
  }

  await getFirebaseAdminDb()
    .collection("admin_push_tokens")
    .doc(uid)
    .collection("tokens")
    .doc(tokenId)
    .set({ active: false, updatedAt: Timestamp.now() }, { merge: true });

  return res.status(200).json({ ok: true });
}

async function handleGet(req, res, uid) {
  const action = String(req.query?.action || "listNotifications");
  if (action === "getUnreadCount") {
    return res.status(200).json({ ok: true, unreadCount: await getUnreadCount(uid) });
  }
  if (action === "listNotifications") return listNotifications(res, uid);

  return res.status(400).json({ ok: false, message: "지원하지 않는 알림 요청입니다." });
}

async function handlePost(req, res, uid) {
  const body = await readJsonBody(req);
  const action = String(body.action || "markNotificationRead");

  if (action === "registerToken") return registerToken(res, uid, req, body);
  if (action === "removeToken") return removeToken(res, uid, body);
  if (action === "markNotificationRead") return markNotificationRead(res, uid, body);

  return res.status(400).json({ ok: false, message: "지원하지 않는 알림 요청입니다." });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const verified = await verifyAdminRequestUser(req);
    if (!verified.ok) return res.status(verified.status).json({ ok: false, message: verified.message });

    if (req.method === "GET") return handleGet(req, res, verified.uid);
    if (req.method === "POST") return handlePost(req, res, verified.uid);

    return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });
  } catch (error) {
    console.error("[admin-push] API failed", error?.message || error);
    return res.status(500).json({ ok: false, message: "관리자 알림을 처리하지 못했습니다." });
  }
}
