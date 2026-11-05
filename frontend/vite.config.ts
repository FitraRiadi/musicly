import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const API_TARGET = process.env.VITE_PROXY_TARGET || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "robots.txt"],
      manifest: {
        name: "Musicly — feel every beat",
        short_name: "Musicly",
        description:
          "Musicly is a modern music streaming experience: millions of tracks, curated playlists, artists and your own library.",
        theme_color: "#121212",
        background_color: "#121212",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone"],
        start_url: "/",
        scope: "/",
        orientation: "portrait-primary",
        categories: ["music", "entertainment"],
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          { name: "Search music", short_name: "Search", url: "/search" },
          { name: "Your library", short_name: "Library", url: "/library" },
          { name: "Offline downloads", short_name: "Downloads", url: "/downloads" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/django-admin\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.deezer\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "deezer-api",
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.dzcdn\.net\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "deezer-images",
              expiration: { maxEntries: 250, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /\.mp3(\?.*)?$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "musicly-previews",
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: "classic",
        navigateFallback: "index.html",
        suppressWarnings: true,
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    // Keep the browser-facing Host header so Django builds media URLs that
    // point back at the Vite proxy (and stay reachable from another device).
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: false },
      "/media": { target: API_TARGET, changeOrigin: false },
      "/django-admin": { target: API_TARGET, changeOrigin: false },
      "/static": { target: API_TARGET, changeOrigin: false },
    },
  },
});
