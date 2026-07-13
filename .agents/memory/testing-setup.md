---
name: Testing setup quirks (Okiru monorepo)
description: Non-obvious facts about running vitest + jsdom DOM tests in this pnpm monorepo.
---

# Where vitest actually lives
- `apps/web` (pnpm name `rest-express`) has a **hoisted** `vitest` (not declared in its package.json, but the `.bin` exists). Run web/Toolkit tests with `pnpm --filter rest-express exec vitest run <files>`.
- `apps/api` has a `vitest.config.ts` AND replit.md documents `pnpm --filter @okiru/api exec vitest ...`, **but vitest is NOT installed there** — the command fails with "vitest: command not found". Those documented api test claims cannot run as-is.

**How to apply:** To prove something in `apps/api` (e.g. Mongoose schema paths in `apps/api/models.ts`) without adding a dependency, write the test in the **web** suite and import via relative path (`apps/web/__tests__/x.test.ts` → `../../api/models`). `models.ts` only imports `mongoose` + `uuid`, both resolvable from the web package. Architect flagged this as pragmatic-but-cross-package; a cleaner long-term fix is to install vitest in `apps/api`.

# jsdom DOM tests
- vitest env is global `node`; opt a file into jsdom per-file with a top docblock `// @vitest-environment jsdom`. The web `vitest.config.ts` include must match `*.test.tsx` (it does).
- **Do NOT `import '@testing-library/jest-dom/vitest'`** — under pnpm hoisting it fails with `Cannot find package 'vitest' imported from .../jest-dom/dist/vitest.mjs`. Use plain assertions instead (`toBeNull()`, `.textContent` `toContain(...)`).
- In a `.test.tsx` running under jsdom, `import.meta.url` is **not** a `file://` URL, so `fileURLToPath(new URL(..., import.meta.url))` throws "URL must be of scheme file". For fs reads use `path.resolve(process.cwd(), 'src/...')` (cwd is the package root, `apps/web`). In `node`-env `.test.ts` the `import.meta.url` form works fine.

**Why:** Learned closing out Toolkit feedback QA — three separate failures (jest-dom resolve, import.meta.url scheme, missing api vitest) all stem from the hoisted/loose test setup.

# okiru-ai-parser package
- `okiru-ai-parser` is **NOT** in the pnpm workspace (own package.json/lockfile, `node_modules` empty). Its `schemas/` + `graph/` modules are dependency-free TS and can be imported cross-package via relative paths (e.g. from `apps/api` tests: `../../../okiru-ai-parser/schemas/...`).
- vitest is firewalled in this Replit env (all versions blocked as "Critical CVE"). Pattern that works: write vitest-style tests for CI/Docker AND a mirror script of plain `node:assert` checks run via `cd apps/api && pnpm exec tsx scripts/<check>.ts`. tsx resolves relative imports from the script's own dir; absolute paths work in throwaway /tmp scripts.

**How to apply:** Any future parser↔api contract test should follow `apps/api/scripts/checkSectorParserCoverage.ts` (mirror of the vitest suites, runnable here).
