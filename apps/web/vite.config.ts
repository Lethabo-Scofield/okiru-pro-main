import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  define: {
    "process.env": JSON.stringify({
      NODE_ENV: process.env.NODE_ENV || "development",
    }),
  },
  resolve: {
    alias: {
      "@toolkit-assets": path.resolve(import.meta.dirname, "Toolkit/attached_assets"),
      "@toolkit": path.resolve(import.meta.dirname, "Toolkit/src"),
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      "@api": path.resolve(import.meta.dirname, "../api"),
      "node:async_hooks": path.resolve(import.meta.dirname, "src/lib/stubs/async_hooks.ts"),
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    hmr: {
      clientPort: 443,
    },
    proxy: {
      // Local development reads the public certificate directory from the live
      // registry because the legacy local Blob Storage account is disabled.
      // Keep this deliberately narrow: protected files and every write/admin
      // operation must continue through the local API and its authorization.
      "^/api/certificates(?:\\?.*)?$": {
        target: process.env.VITE_CERTIFICATE_READ_API_URL || "https://okiru.pro",
        changeOrigin: true,
        secure: true,
      },
      "^/api/certificates/stats(?:\\?.*)?$": {
        target: process.env.VITE_CERTIFICATE_READ_API_URL || "https://okiru.pro",
        changeOrigin: true,
        secure: true,
      },
      "^/api/certificates/by-slug/": {
        target: process.env.VITE_CERTIFICATE_READ_API_URL || "https://okiru.pro",
        changeOrigin: true,
        secure: true,
      },
      // Proxy all /api/* requests to the API server when running pure Vite dev
      // mode (i.e. without the Express wrapper in apps/web/server/index.ts).
      // The Express wrapper already handles this via apiProxy.ts, so these
      // entries are only active for `vite dev --port 5173` standalone runs.
      // Auth. Without this entry a pure-Vite dev run answers every
      // /api/auth/* call with an empty 404, which the sign-in screen reported
      // as "Invalid username or password" — a correct password looked wrong.
      "/api/auth": {
        target: process.env.VITE_API_SERVER_URL || process.env.API_SERVER_URL || "http://127.0.0.1:3000",
        changeOrigin: true,
      },
      "/api/parser": {
        target: process.env.VITE_PARSER_SERVICE_URL || "http://127.0.0.1:3200",
        changeOrigin: true,
      },
      "/api/sectors": {
        target: process.env.VITE_API_SERVER_URL || process.env.API_SERVER_URL || "http://127.0.0.1:3000",
        changeOrigin: true,
      },
      "/api/import": {
        target: process.env.VITE_API_SERVER_URL || process.env.API_SERVER_URL || "http://127.0.0.1:3000",
        changeOrigin: true,
      },
      "/api/processor-sessions": {
        target: process.env.VITE_API_SERVER_URL || process.env.API_SERVER_URL || "http://127.0.0.1:3000",
        changeOrigin: true,
      },
      "/api/assessments": {
        target: process.env.VITE_API_SERVER_URL || process.env.API_SERVER_URL || "http://127.0.0.1:3000",
        changeOrigin: true,
      },
      "/api/feedback": {
        target: process.env.VITE_API_SERVER_URL || process.env.API_SERVER_URL || "http://127.0.0.1:3000",
        changeOrigin: true,
      },
      "/api": {
        target: process.env.VITE_API_SERVER_URL || process.env.API_SERVER_URL || "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
    fs: {
      strict: false,
      deny: ["**/.*"],
      allow: [
        path.resolve(import.meta.dirname, "src"),
        path.resolve(import.meta.dirname, "Toolkit/src"),
        path.resolve(import.meta.dirname, "Toolkit/attached_assets"),
        path.resolve(import.meta.dirname, "attached_assets"),
        path.resolve(import.meta.dirname, "shared"),
        path.resolve(import.meta.dirname, "../api"),
        path.resolve(import.meta.dirname, "node_modules"),
      ],
    },
  },
});
