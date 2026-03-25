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
    // `@/lib/pipeline/*` lives under apps/web/lib/pipeline (not src/lib). List before `@` → src.
    alias: [
      { find: "@/lib/pipeline", replacement: path.resolve(import.meta.dirname, "lib/pipeline") },
      { find: "@toolkit-assets", replacement: path.resolve(import.meta.dirname, "Toolkit/attached_assets") },
      { find: "@toolkit", replacement: path.resolve(import.meta.dirname, "Toolkit/src") },
      { find: "@shared", replacement: path.resolve(import.meta.dirname, "shared") },
      { find: "@assets", replacement: path.resolve(import.meta.dirname, "attached_assets") },
      { find: "@", replacement: path.resolve(import.meta.dirname, "src") },
    ],
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
    fs: {
      strict: false,
      deny: ["**/.*"],
      allow: [
        path.resolve(import.meta.dirname, "src"),
        path.resolve(import.meta.dirname, "Toolkit/src"),
        path.resolve(import.meta.dirname, "Toolkit/attached_assets"),
        path.resolve(import.meta.dirname, "attached_assets"),
        path.resolve(import.meta.dirname, "shared"),
        path.resolve(import.meta.dirname, "node_modules"),
      ],
    },
  },
});
