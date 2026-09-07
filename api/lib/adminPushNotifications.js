import crypto from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminAuth, getFirebaseAdminDb, getFirebaseAdminMessaging } from "./firebaseAdmin.js";

const CURRENT_SCHOOL_YEAR = 2026;
const CURRENT_SEMESTER = 2;
const ADMIN_ROLES = new Set(["health_teacher", "admin"]);
const MAX_MULTICAST_TOKENS = 500;

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

export function getAdminPushTokenId(token) {
  return hashValue(token);
}

function cleanText(value, fallback = "") {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return (text || fallback).slice(0, 80);
}

function hasAdminRole(assignment) {
  const roles = Array.isArray(assignment?.roles) ? assignment.roles : [];
  return assignment?.active === true
    && Number(assignment.schoolYear) === CURRENT_SCHOOL_YEAR
    && Number(assignment.semester) === CURRENT_SEMESTER
    && roles.some((role) => ADMIN_ROLES.has(role));
}

export async function verifyAdminRequestUser(req) {
  const header = req.headers.authorization || "";
  const idToken = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!idToken) return { ok: false, status: 401, message: "로그인이 필요합니다." };

  const decodedToken = await getFirebaseAdminAuth().verifyIdToken(idToken);
  const db = getFirebaseAdminDb();
  const assignmentSnapshot = await db
    .collection("user_assignments")
    .doc(`${decodedToken.uid}_${CURRENT_SCHOOL_YEAR}_${CURRENT_SEMESTER}`)
    .get();

  if (!assignmentSnapshot.exists || !hasAdminRole(assignmentSnapshot.data())) {
    return { ok: false, status: 403, message: "관리자 권한을 확인해 주세요." };
  }

  return { ok: true, uid: decodedToken.uid, decodedToken, assignment: assignmentSnapshot.data() };
}

async function getAdminRecipientUids(db) {
  const snapshot = await db.collection("user_assignments").where("active", "==", true).get();
  const uids = new Set();

  snapshot.docs.forEach((doc) => {
    const assignment = doc.data();
    if (hasAdminRole(assignment) && assignment.uid) uids.add(assignment.uid);
  });

  return [...uids];
}

async function getActiveTokensForRecipients(db, recipientUids) {
  const tokens = [];
  const tokenRefs = new Map();

  for (const uid of recipientUids) {
    const tokenSnapshot = await db
      .collection("admin_push_tokens")
      .doc(uid)
      .collection("tokens")
      .where("active", "==", true)
      .limit(20)
      .get();

    tokenSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (typeof data.token === "string" && data.token) {
        tokens.push(data.token);
        tokenRefs.set(data.token, doc.ref);
      }
    });
  }

  return { tokens: tokens.slice(0, MAX_MULTICAST_TOKENS), tokenRefs };
}

async function deactivateInvalidTokens(response, tokens, tokenRefs) {
  const invalidCodes = new Set([
    "messaging/invalid-registration-token",
    "messaging/registration-token-not-registered",
  ]);

  const updates = [];
  response.responses.forEach((item, index) => {
    const code = item.error?.code || "";
    const tokenRef = tokenRefs.get(tokens[index]);
    if (tokenRef && invalidCodes.has(code)) {
      updates.push(tokenRef.set({ active: false, updatedAt: Timestamp.now() }, { merge: true }));
    }
  });

  await Promise.all(updates);
}

export async function notifyAdminPushSubscribers(event) {
  try {
    const dedupeKey = String(event.dedupeKey || "").trim();
    if (!dedupeKey) return { ok: false, reason: "missing-dedupe-key" };

    const db = getFirebaseAdminDb();
    const eventId = hashValue(dedupeKey);
    const eventRef = db.collection("admin_notifications").doc(eventId);
    const now = Timestamp.now();
    const notification = {
      type: cleanText(event.type, "admin_notice"),
      title: cleanText(event.title, "온라인 보건실 알림"),
      body: cleanText(event.body, "확인이 필요한 새 알림이 있습니다.").slice(0, 140),
      destination: String(event.destination || "/firebase-dashboard").startsWith("/")
        ? event.destination
        : "/firebase-dashboard",
    };

    const createResult = await db.runTransaction(async (transaction) => {
      const eventSnapshot = await transaction.get(eventRef);
      if (eventSnapshot.exists) return { created: false };

      transaction.set(eventRef, {
        dedupeKey,
        ...notification,
        createdAt: now,
        sentAt: null,
      });
      return { created: true };
    });

    if (!createResult.created) return { ok: true, deduped: true, eventId };

    const recipientUids = await getAdminRecipientUids(db);
    await Promise.all(recipientUids.map((uid) =>
      db
        .collection("admin_notification_inboxes")
        .doc(uid)
        .collection("items")
        .doc(eventId)
        .set({
          eventId,
          ...notification,
          read: false,
          createdAt: now,
          updatedAt: now,
        }, { merge: true })
    ));

    const { tokens, tokenRefs } = await getActiveTokensForRecipients(db, recipientUids);
    let successCount = 0;
    let failureCount = 0;

    if (tokens.length > 0) {
      const response = await getFirebaseAdminMessaging().sendEachForMulticast({
        tokens,
        data: {
          eventId,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          url: notification.destination,
        },
        webpush: {
          fcmOptions: {
            link: notification.destination,
          },
        },
      });
      successCount = response.successCount;
      failureCount = response.failureCount;
      await deactivateInvalidTokens(response, tokens, tokenRefs);
    }

    await eventRef.set({
      recipientCount: recipientUids.length,
      tokenCount: tokens.length,
      successCount,
      failureCount,
      sentAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }, { merge: true });

    return { ok: true, eventId, recipientCount: recipientUids.length, tokenCount: tokens.length, successCount, failureCount };
  } catch (error) {
    console.error("[admin-push] notification dispatch failed", error?.message || error);
    return { ok: false, reason: "dispatch-failed" };
  }
}
