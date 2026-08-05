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

// ── APP BADGE HELPERS ──────────────────────────────────────
// Service worker gak punya state persisten antar event, jadi counter
// badge disimpan lewat Cache API (bukan localStorage -- gak bisa diakses
// dari SW context).
async function getBadgeCount() {
  try {
    const cache = await caches.open("badge-store");
    const res = await cache.match("badge-count");
    return res ? (await res.json()).count : 0;
  } catch (err) {
    console.error("[SW] getBadgeCount gagal:", err);
    return 0;
  }
}

async function setBadgeCount(count) {
  try {
    const cache = await caches.open("badge-store");
    await cache.put("badge-count", new Response(JSON.stringify({ count })));
  } catch (err) {
    console.error("[SW] setBadgeCount gagal:", err);
  }
}

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
    (async () => {
      // Increment & set app badge (Android/desktop PWA, iOS 16.4+ PWA installed)
      try {
        const newCount = (await getBadgeCount()) + 1;
        await setBadgeCount(newCount);

        if ("setAppBadge" in self.navigator) {
          await self.navigator.setAppBadge(newCount);
          console.log("[SW] App badge di-set ke:", newCount);
        }
      } catch (err) {
        console.error("[SW] Gagal set app badge:", err);
      }

      try {
        await self.registration.showNotification(title || "e-MBKM ITBSS", {
          body: body || "",
          icon: "/icons/icon-192x192.png",
          badge: "/icons/icon-72x72.png",
          data: { url: url || "/" },
        });
        console.log("[SW] showNotification berhasil dipanggil");
      } catch (err) {
        console.error("[SW] showNotification gagal:", err);
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      // Reset badge begitu notif diklik
      await setBadgeCount(0);
      if ("clearAppBadge" in self.navigator) {
        await self.navigator.clearAppBadge();
      }

      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })()
  );
});

// Dipanggil dari React app (lewat navigator.serviceWorker.controller.postMessage)
// pas app dibuka/difokus, buat clear badge tanpa harus klik notifikasi dulu.
self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_BADGE") {
    event.waitUntil(
      (async () => {
        await setBadgeCount(0);
        if ("clearAppBadge" in self.navigator) {
          await self.navigator.clearAppBadge();
        }
        console.log("[SW] Badge di-clear via message dari app.");
      })()
    );
  }
});