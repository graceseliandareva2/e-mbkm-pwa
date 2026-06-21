import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "e-MBKM ITBSS",
        short_name: "e-MBKM",
        description: "Sistem Pengelolaan MBKM & Capstone",
        theme_color: "#1e4db7",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-72x72.png",   sizes: "72x72",   type: "image/png" },
          { src: "/icons/icon-96x96.png",   sizes: "96x96",   type: "image/png" },
          { src: "/icons/icon-128x128.png", sizes: "128x128", type: "image/png" },
          { src: "/icons/icon-144x144.png", sizes: "144x144", type: "image/png" },
          { src: "/icons/icon-152x152.png", sizes: "152x152", type: "image/png" },
          { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-384x384.png", sizes: "384x384", type: "image/png" },
          { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/uploads\//, /^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\.(js|css|png|jpg|jpeg|svg|ico|woff2?)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          // ── Caching data riwayat (GET /api/...) agar tetap bisa dibuka saat offline ──
          // NetworkFirst: saat online selalu ambil data terbaru dari server (dan
          // cache-nya di-update). Saat offline / request gagal, fallback ke data
          // terakhir yang sempat di-cache. Workbox runtimeCaching secara default
          // hanya menangkap method GET, jadi POST/PUT/DELETE (submit/ubah data)
          // TIDAK terpengaruh oleh aturan ini — itu tetap ditangani manual lewat
          // offlineQueue.js seperti sekarang.
          {
            urlPattern: /^https?:\/\/[^/]+\/api\/.*$/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-data-cache",
              networkTimeoutSeconds: 5, // kalau server tidak respon dalam 5 detik, anggap offline & pakai cache
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 14, // cache data riwayat disimpan maksimal 14 hari
              },
              cacheableResponse: {
                statuses: [0, 200], // hanya cache response sukses
              },
            },
          },
        ],
        navigateFallback: null,
      },
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});