const CACHE_NAME = "online-health-room-shell-v1";
const APP_SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

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
