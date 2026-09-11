import { app, auth } from "./firebase.js";

const ADMIN_PUSH_API_PATH = "/api/firebase/admin-push";

export function getBrowserNotificationPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export function getPushCapability() {
  if (typeof window === "undefined") return { supported: false, iPhone: false, standalone: false };

  const userAgent = window.navigator.userAgent || "";
  const iPhone = /iphone|ipad|ipod/i.test(userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches === true
    || window.navigator.standalone === true;
  const supported = "Notification" in window
    && "serviceWorker" in window.navigator
    && "PushManager" in window;

  return { supported, iPhone, standalone };
}

async function getIdToken(firebaseUser = auth.currentUser) {
  if (!firebaseUser) throw new Error("로그인이 필요합니다.");
  return firebaseUser.getIdToken();
}

async function requestAdminJson(path, firebaseUser, options = {}) {
  const idToken = await getIdToken(firebaseUser);
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const result = await response.json().catch(() => null);

  if (!response.ok || result?.ok !== true) {
    throw new Error(result?.message || "관리자 알림을 처리하지 못했습니다.");
  }

  return result;
}

async function getCurrentAdminPushToken() {
  const capability = getPushCapability();
  if (!capability.supported) throw new Error("이 브라우저는 알림을 지원하지 않습니다.");

  const vapidKey = String(import.meta.env.VITE_FIREBASE_VAPID_KEY || "").trim();
  if (!vapidKey) throw new Error("알림 설정 키가 아직 등록되지 않았습니다.");

  const [{ getMessaging, getToken, isSupported }] = await Promise.all([
    import("firebase/messaging"),
    window.navigator.serviceWorker.register("/sw.js", { scope: "/" }),
  ]);

  const messagingSupported = await isSupported();
  if (!messagingSupported) throw new Error("이 브라우저에서는 Firebase 알림을 사용할 수 없습니다.");

  const serviceWorkerRegistration = await window.navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration });
  if (!token) throw new Error("알림 기기 정보를 생성하지 못했습니다.");

  return token;
}

export async function fetchAdminNotifications(firebaseUser) {
  const result = await requestAdminJson(`${ADMIN_PUSH_API_PATH}?action=listNotifications`, firebaseUser);
  return {
    unreadCount: Number(result.unreadCount || 0),
    notifications: Array.isArray(result.notifications) ? result.notifications : [],
  };
}

export async function fetchAdminPushRegistrationStatus(firebaseUser) {
  if (getBrowserNotificationPermission() !== "granted") return { registered: false };

  const token = await getCurrentAdminPushToken();
  const result = await requestAdminJson(ADMIN_PUSH_API_PATH, firebaseUser, {
    method: "POST",
    body: JSON.stringify({ action: "getRegistrationStatus", token }),
  });

  return { registered: result.registered === true };
}

export async function markAdminNotificationRead(firebaseUser, notificationId) {
  return requestAdminJson(ADMIN_PUSH_API_PATH, firebaseUser, {
    method: "POST",
    body: JSON.stringify({ action: "markNotificationRead", notificationId }),
  });
}

export async function fetchAdminNoticeAcknowledgement(firebaseUser, notificationId) {
  const result = await requestAdminJson(ADMIN_PUSH_API_PATH, firebaseUser, {
    method: "POST",
    body: JSON.stringify({ action: "getNoticeAcknowledgement", notificationId }),
  });

  return { acknowledged: result.acknowledged === true };
}

export async function acknowledgeAdminNotice(firebaseUser, notificationId) {
  return requestAdminJson(ADMIN_PUSH_API_PATH, firebaseUser, {
    method: "POST",
    body: JSON.stringify({ action: "acknowledgeNotice", notificationId }),
  });
}

export async function registerAdminPushToken(firebaseUser) {
  const capability = getPushCapability();
  if (!capability.supported) throw new Error("이 브라우저는 알림을 지원하지 않습니다.");
  if (capability.iPhone && !capability.standalone) {
    throw new Error("iPhone에서는 홈 화면에 추가한 뒤 알림을 받을 수 있습니다.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("브라우저 알림 권한이 필요합니다.");

  const token = await getCurrentAdminPushToken();

  await requestAdminJson(ADMIN_PUSH_API_PATH, firebaseUser, {
    method: "POST",
    body: JSON.stringify({
      action: "registerToken",
      token,
      platform: getDevicePlatform(),
    }),
  });

  return { ok: true };
}

export async function subscribeToForegroundAdminNotifications(onNotification) {
  const capability = getPushCapability();
  if (!capability.supported) return () => {};

  const { getMessaging, isSupported, onMessage } = await import("firebase/messaging");
  if (!(await isSupported())) return () => {};

  return onMessage(getMessaging(app), (payload) => {
    onNotification({
      id: payload.data?.eventId || payload.messageId || "",
      type: payload.data?.type || "admin_notice",
      title: payload.notification?.title || payload.data?.title || "온라인 보건실 알림",
      body: payload.notification?.body || payload.data?.body || "",
      destination: payload.data?.url || "/firebase-dashboard",
    });
  });
}

function getDevicePlatform() {
  const userAgent = window.navigator.userAgent || "";
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  if (/windows/i.test(userAgent)) return "windows";
  if (/macintosh/i.test(userAgent)) return "mac";
  return "web";
}
