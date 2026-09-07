const CACHE_NAME = "online-health-room-shell-v1";
const APP_SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCSIwxcdU2x5g8BhNLUckWoNFU7uWSHU94",
  authDomain: "sehwa-health-portal-v2.firebaseapp.com",
  projectId: "sehwa-health-portal-v2",
  storageBucket: "sehwa-health-portal-v2.firebasestorage.app",
  messagingSenderId: "30487759503",
  appId: "1:30487759503:web:c97b1169e3bc2318647efa",
};

try {
  importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js");

  if (self.firebase?.initializeApp && !self.firebase.apps?.length) {
    self.firebase.initializeApp(FIREBASE_CONFIG);
  }

  const messaging = self.firebase?.messaging?.();
  messaging?.onBackgroundMessage?.((payload) => {
    const data = payload?.data || {};
    const title = data.title || "온라인 보건실 알림";
    const url = data.url && data.url.startsWith("/") ? data.url : "/firebase-dashboard";

    self.registration.showNotification(title, {
      body: data.body || "확인이 필요한 관리자 알림이 있습니다.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.eventId || payload?.messageId,
      renotify: false,
      data: {
        eventId: data.eventId || "",
        url,
      },
    });
  });
} catch (error) {
  console.warn("[pwa] firebase messaging unavailable", error);
}

function isSensitiveOrDynamicRequest(requestUrl) {
  return (
    requestUrl.pathname.startsWith("/api") ||
    requestUrl.pathname.includes("apps-script") ||
    requestUrl.searchParams.has("student") ||
    requestUrl.searchParams.has("name") ||
    requestUrl.searchParams.has("class") ||
    requestUrl.searchParams.has("number")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url && event.notification.data.url.startsWith("/")
    ? event.notification.data.url
    : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const targetUrl = new URL(path, self.location.origin).href;
      const appWindow = windows.find((client) => new URL(client.url).origin === self.location.origin);

      if (appWindow) {
        return appWindow.navigate(targetUrl).then((client) => (client || appWindow).focus());
      }

      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const requestUrl = new URL(request.url);

  if (
    request.method !== "GET" ||
    requestUrl.origin !== self.location.origin ||
    isSensitiveOrDynamicRequest(requestUrl)
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/")));
    return;
  }

  if (APP_SHELL_URLS.includes(requestUrl.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});
