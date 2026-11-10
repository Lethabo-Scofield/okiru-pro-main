# Okiru — production-readiness & security audit

**Date:** 2026-08-24 · **Branch:** `lethabo/quality-assurance` · **Method:** `audit-sweep` quick mode (inline ripgrep + file-level verification, no code changes) + security/production layer + `pnpm audit`.

> Scope: whole repo, live path first (`apps/web/Toolkit/src/`), plus `apps/api`, `apps/web/server`, infra. Detection only — nothing was edited. Every finding below was verified at `file:line`.

---

## Verdict

**Not yet ready for public launch — but much closer than the June audit.** The critical *product* defect classes (phantom saves, fail-open authorization, health-probe lie) are **fixed and verified**. The remaining blockers are **operational and dependency-level**: no CI/CD gate, a critical/high load of dependency vulnerabilities, and silent save-failures in the UI.

Recommended gate: clear the **P0/P1** items below before opening public traffic; **P2** shortly after.

---

## Resolved since the 2026-06-29 audit (verified fixed)

| Was | Pattern | Verification |
|---|---|---|
| A1/A3/A4/A5/A7 phantom saves | P1 | Every store mutation now calls `api.*` — `updateEmployee`→`api.updateEmployee`, `updateAfs`/`updateEsdBonuses`→`api.updateClient`, `updateFinancialYear`, `addEmployeesBulk`→`api.bulkAddEmployees`. (`store.ts:1838–2064`) |
| A2/B15/B15-srv fail-open RBAC | P9 | Hooks fail **closed** (`pillarInScope` returns `false` out-of-scope, `usePillarPermission.ts:62`); server middleware `verifyPillarAccess`/`verifyFullScorecardAccess` enforces pillarScopes → 403 (`apps/api/src/middleware/auth.ts:56,64,79`) |
| A14 health lie | P12 | Readiness probe pings Mongo and 503s when a critical dep is down; liveness is correctly separate (`apps/api/src/routes/health.ts:23–38`) |
| Committed kubeconfig/az secrets | SEC | Only *templates* tracked; no real secrets in source (single hit is a dummy test key, `azureCertStorage.test.ts:34`) |
| — | CORS | Origin **allowlist**, rejects unknown origins, `credentials:true` scoped — not wide-open (`apps/api/index.ts:52`) |
| — | Auth abuse | `authLimiter` + `checkLimiter` rate-limits on auth routes (`auth.ts:65,74`) |

---

## Open findings — fix for launch

### P0 — blockers

**1. [CRITICAL] Dependency vulnerabilities.** `pnpm audit --prod`: **1 critical, 37 high, 42 moderate, 10 low.**
*Impact:* known-exploitable code shipping to production.
*Fix:* `pnpm audit --fix`; manually bump/replace what can't auto-fix; re-run until critical/high are 0 (or explicitly risk-accepted with a note). Add `pnpm audit` to CI.

**2. [HIGH] No CI/CD gate.** `.github/workflows` is absent — deploys are hand-driven, with no automated typecheck/test/build before ship.
*Impact:* broken code can reach prod unnoticed (we hit exactly this repeatedly this session). No rollback discipline.
*Fix:* restore a pipeline: `tsc --noEmit` + `vitest run` + build, required on merge to the release branch and before deploy.

### P1 — high

**3. [HIGH] Silent save failures (P10).** `store.ts` has **33** `.catch(console.error)` mutations and **0** user-visible error handling.
*Impact:* a save that fails server-side still shows the optimistic local update and no error — the edit is lost on the next `loadClientData` re-hydration. Same *felt* bug as the old phantom-save, one layer down.
*Fix:* surface failures (toast + dirty/error state), and/or debounced autosave with retry; guard re-hydration when local writes are pending.

### P2 — medium

**4. [MEDIUM] CSP disabled.** API helmet is `contentSecurityPolicy: false` (`apps/api/index.ts:33`).
*Impact:* weaker XSS containment in production.
*Fix:* enable a scoped CSP in prod (especially on the web server serving the SPA); keep it relaxed only for the dev/preview iframe.

**5. [MEDIUM] Observability / alerting gap.** No metrics, alerting, or cluster IaC; External-Secrets + GitOps are templates only (per `autoresearch/log/RISKS.md`).
*Impact:* the readiness probe exists but nothing watches it — an outage is invisible until a user reports it.
*Fix:* wire alerting on the readiness endpoint + API 5xx rate before public traffic.

### P3 — low / hygiene

**6. [LOW] Dev-comment clutter (P3).** `// Issue N:` comments across `apps/web/src/components/build/pillar-forms/*` and `BuildPillarsStep.tsx`. Verified **not** UI leaks (they sit in JS object literals / above declarations, not JSX text) — just noise.
*Fix:* remove/convert; add the P-LINT guards below.

**7. [LOW] Regression guards (P-LINT).** Add an ESLint rule banning JSX text nodes that start with `//` (stops P3), and a CI grep gate flagging new `.catch(console.error)` on store mutations (stops P10 regressions).

---

## Not defects — context

- **Certificate OCR** now runs **free-first** (pdf.js → tesseract), with Azure Document Intelligence demoted to a paid backup for the ~5–8% of hard scans; measured ~96% free-path coverage on real certs. PP-OCR (`@gutenye/ocr-node`) is wired but OFF (`CERT_OCR_PPOCR`).
- **Sitemap** is whole-site with real per-cert `lastmod` and indexable-only filtering.

---

## Recommended fix waves

- **Wave 0 (this week, launch-gating):** #1 dep vulns → 0 critical/high; #2 restore CI (typecheck+vitest+build).
- **Wave 1:** #3 surface save failures + autosave/retry.
- **Wave 2:** #4 prod CSP; #5 alerting on readiness + 5xx.
- **Wave 3:** #6 comment cleanup; #7 lint/CI regression guards.

*Detection only — no fixes were applied. Each wave is a separate, approved step.*
