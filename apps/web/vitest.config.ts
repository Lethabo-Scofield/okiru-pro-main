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
    /**
     * Vitest defaults to five seconds, which is under what this suite's slowest
     * honest tests need. Several parse real .xlsx workbooks off disk — the
     * information-gathering corpus, the sector golden files — and take six to
     * twelve seconds when workers are competing for CPU, while passing in one
     * to four seconds run alone.
     *
     * The cost was not the wasted reruns, it was the misreading: a timeout
     * prints as a failed test, so a green suite looked broken and real failures
     * had to be picked out of the noise. It sent me hunting a scoring bug that
     * did not exist more than once. Thirty seconds is far longer than any of
     * these need and still short enough to catch a genuine hang.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
