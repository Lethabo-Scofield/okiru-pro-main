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
