import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["brand-mark.svg"],
      manifest: {
        name: "逐光英语",
        short_name: "逐光英语",
        description: "以考核和间隔复习驱动的个人英语掌握系统",
        theme_color: "#174b3a",
        background_color: "#faf7ef",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/brand-mark.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /\/api\/lessons\/\d+\/assessment/,
            handler: "NetworkFirst",
            options: { cacheName: "assessments", expiration: { maxEntries: 40, maxAgeSeconds: 604800 } },
          },
          {
            urlPattern: /(?:\.(?:mp3|m4a|ogg)$|\/api\/lessons\/\d+\/audio\/(?:us|uk))/,
            handler: "CacheFirst",
            options: { cacheName: "lesson-audio", expiration: { maxEntries: 80, maxAgeSeconds: 2592000 } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  build: {
    outDir: "dist",
  },
});
