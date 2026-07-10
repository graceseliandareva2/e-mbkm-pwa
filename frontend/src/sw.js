import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ url }) => /\.(js|css|png|jpg|jpeg|svg|ico|woff2?)$/.test(url.pathname),
  new CacheFirst({
    cacheName: "static-assets",
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  })
);

registerRoute(
  ({ url }) => /^\/api\/.*/.test(url.pathname),
  new NetworkFirst({
    cacheName: "api-data-cache",
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 14 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  console.log("[SW] Push event diterima:", event.data);

  if (!event.data) {
    console.log("[SW] Push event tidak ada data, skip.");
    return;
  }

  const data = event.data.json();
  console.log("[SW] Payload:", data);
  const { title, body, url } = data;

  event.waitUntil(
    self.registration.showNotification(title || "e-MBKM ITBSS", {
      body: body || "",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-72x72.png",
      data: { url: url || "/" },
    }).then(() => console.log("[SW] showNotification berhasil dipanggil"))
      .catch((err) => console.error("[SW] showNotification gagal:", err))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});