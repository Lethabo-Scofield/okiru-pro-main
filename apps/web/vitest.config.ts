import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@toolkit-assets": path.resolve(import.meta.dirname, "Toolkit/attached_assets"),
      "@toolkit": path.resolve(import.meta.dirname, "Toolkit/src"),
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  // Match the app build (@vitejs/plugin-react = automatic JSX runtime) so
  // component modules without a React import compile in tests exactly as they
  // do in the app.
  esbuild: { jsx: "automatic" },
  test: {
    globals: true,
    environment: "node",
    include: ["**/__tests__/**/*.test.ts", "**/*.test.ts", "**/__tests__/**/*.test.tsx", "**/*.test.tsx"],
    exclude: ["node_modules", "dist"],
  },
});
