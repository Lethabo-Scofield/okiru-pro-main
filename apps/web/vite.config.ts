import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@toolkit-assets": path.resolve(import.meta.dirname, "Toolkit/attached_assets"),
      "@toolkit": path.resolve(import.meta.dirname, "Toolkit/src"),
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      "@api": path.resolve(import.meta.dirname, "../api"),
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
      port: 24680,
    },
    proxy: {
      // Proxy all /api/* requests to the API server when running pure Vite dev
      // mode (i.e. without the Express wrapper in apps/web/server/index.ts).
      // The Express wrapper already handles this via apiProxy.ts, so these
      // entries are only active for `vite dev --port 5173` standalone runs.
      "/api/sectors": {
        target: process.env.VITE_API_SERVER_URL || process.env.API_SERVER_URL || "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/api/import": {
        target: process.env.VITE_API_SERVER_URL || process.env.API_SERVER_URL || "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/api/processor-sessions": {
        target: process.env.VITE_API_SERVER_URL || process.env.API_SERVER_URL || "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/api/assessments": {
        target: process.env.VITE_API_SERVER_URL || process.env.API_SERVER_URL || "http://127.0.0.1:3001",
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
