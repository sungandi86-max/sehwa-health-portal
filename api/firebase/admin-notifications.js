import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "../lib/firebaseAdmin.js";
import { verifyAdminRequestUser } from "../lib/adminPushNotifications.js";

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

async function listNotifications(res, uid) {
  const db = getFirebaseAdminDb();
  const inboxRef = db.collection("admin_notification_inboxes").doc(uid).collection("items");
  const [recentSnapshot, unreadSnapshot] = await Promise.all([
    inboxRef.orderBy("createdAt", "desc").limit(5).get(),
    inboxRef.where("read", "==", false).limit(100).get(),
  ]);

  return res.status(200).json({
    ok: true,
    unreadCount: unreadSnapshot.size,
    notifications: recentSnapshot.docs.map(serializeNotification),
  });
}

async function markRead(res, uid, body) {
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const verified = await verifyAdminRequestUser(req);
    if (!verified.ok) return res.status(verified.status).json({ ok: false, message: verified.message });

    if (req.method === "GET") return listNotifications(res, verified.uid);
    if (req.method === "POST") return markRead(res, verified.uid, await readJsonBody(req));

    return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });
  } catch (error) {
    console.error("[admin-push] notification API failed", error?.message || error);
    return res.status(500).json({ ok: false, message: "관리자 알림을 불러오지 못했습니다." });
  }
}
