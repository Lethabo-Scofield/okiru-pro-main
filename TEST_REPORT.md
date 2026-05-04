# Test Report — Onboarding & B-BBEE Certificates Registry

**Date:** 2026-05-04
**Scope:** Real (non-placeholder) tests for the company onboarding flow and the production-ready B-BBEE Certificates registry.

---

## Summary

| Suite | Tests | Status |
|---|---|---|
| `apiResponse` (envelope helpers) | 6 | ✅ pass |
| `certificateStore` (local fallback) | 13 | ✅ pass |
| `analytics` service | 7 | ✅ pass |
| Onboarding API integration | 9 | ✅ pass |
| Certificates API integration (public + admin) | 20 | ✅ pass |
| **New tests total** | **55** | **✅ all pass** |

Pre-existing failures in `pipeline/__tests__/scoringEngine.test.ts` and
`pipeline/__tests__/lakeTradingUCS.test.ts` (14 failures) are unrelated to this
work — they concern the B-BBEE scoring-engine sector manifests and were
failing before these changes.

---

## How to run

```bash
# All API tests (includes the new suites)
pnpm --filter @okiru/api test

# Same, via root convenience script
pnpm test:api

# Just the unit-level suites (helpers + services, no router)
pnpm test:unit

# Web tests (calculators / scorecard)
pnpm test:web

# Run absolutely everything across the monorepo
pnpm test
```

Run a single new file:

```bash
pnpm --filter @okiru/api exec vitest run src/routes/__tests__/certificates.test.ts
pnpm --filter @okiru/api exec vitest run src/routes/__tests__/onboarding.test.ts
pnpm --filter @okiru/api exec vitest run src/services/__tests__/certificateStore.test.ts
pnpm --filter @okiru/api exec vitest run src/services/__tests__/analytics.test.ts
pnpm --filter @okiru/api exec vitest run src/utils/__tests__/apiResponse.test.ts
```

---

## Files added

| File | Purpose |
|---|---|
| `apps/api/src/utils/__tests__/apiResponse.test.ts` | Locks the `{success, data, error}` envelope contract for `ok` / `fail` / `failWith`. |
| `apps/api/src/services/__tests__/certificateStore.test.ts` | Verifies VAT normalisation, dedupe lookup, status-from-expiry, verification flag toggle, version push, report add/list/count. |
| `apps/api/src/services/__tests__/analytics.test.ts` | Verifies `recordEvent` persists every spec event type and `getAnalyticsSummary` aggregates totals / byType / topCertificates / topQueries. |
| `apps/api/src/routes/__tests__/onboarding.test.ts` | Auth gating, validation, persistence (incl. `toolsUsed` array + Other-style fields), idempotency on second login. |
| `apps/api/src/routes/__tests__/certificates.test.ts` | Public registry, paginated envelope, verified-first sort, by-slug detail, history envelope, report submission validation, admin auth/role gating, verify→unverify roundtrip, duplicate-VAT cluster surfacing. |

## Files changed

| File | Change |
|---|---|
| `apps/api/vitest.config.ts` | Added `src/utils/__tests__/**` and `src/services/__tests__/**` to the include glob so the new suites are picked up. |
| `package.json` (root) | Added `test:api`, `test:web`, `test:unit`, `test:e2e` scripts. |

---

## Spec coverage

### A. Company Onboarding

| # | Spec item | Coverage |
|---|---|---|
| 1 | Signup redirects to /onboarding | Manual checklist (UI/router) — see Gaps |
| 2 | Onboarding form renders all fields | Manual checklist (UI) — see Gaps |
| 3 | Required validation works | ✅ `onboarding.test.ts` "rejects empty / whitespace companyName" |
| 4 | "Other" fields work | ✅ `onboarding.test.ts` "persists Other-style custom values" |
| 5 | Multi-select tools work | ✅ `onboarding.test.ts` "POST persists every supported field including toolsUsed array" |
| 6 | Onboarding saves to database | ✅ Same test asserts every documented field is persisted |
| 7 | Onboarding runs once per user | ✅ "GET /me returns the saved profile after onboarding (runs once per user)" |
| 8 | GET /onboarding/me works (auth + 401) | ✅ "GET /me returns 401 when unauthenticated" + happy-path test |
| 9 | POST /onboarding works (auth + 401) | ✅ "POST / returns 401 when unauthenticated" + happy-path test |
| 10 | Redirect back to certificates after onboarding | Manual checklist (UI flow) — see Gaps |

### B. Certificate Registry

| # | Spec item | Coverage |
|---|---|---|
| 1 | Public registry access (no login) | ✅ `certificates.test.ts` "GET /list returns a bare array with no auth" |
| 2 | Upload requires login (safe redirect) | Manual checklist (frontend redirect param) — see Gaps |
| 3 | Certificate list renders metadata | ✅ Asserts `companyName`, `vatNumber`, `slug`, `id` shape; full row schema covered by `rowFromLocal` test via list |
| 4 | Search works | Covered indirectly: search filter via `/list?search=…` returns matching items in by-slug test |
| 5 | Filters work | The `applyFilters` path is exercised by the `?search=Slug Co` test; deeper filter coverage gap noted |
| 6 | Certificate detail page works | ✅ "GET /by-slug/:slug surfaces id + verified + vatNumber" |
| 7 | SEO metadata exists | Manual checklist (HTML/SSR) — see Gaps |
| 8 | Google indexability | Manual checklist (sitemap + robots) — see Gaps |
| 9 | Verification badge works | ✅ "Verify / unverify roundtrip" + "GET /list?sort=verified surfaces verified certificates first" |
| 10 | Admin permissions work | ✅ Parameterised "401 unauth, 403 user, envelope admin" tests across all admin routes |
| 11 | Duplicate VAT prevention | ✅ `certificateStore` "getByVatNumber" + `/admin/duplicates` cluster test |
| 12 | Certificate versioning works | ✅ `certificateStore` "pushVersion appends snapshot and updates latest fields" |
| 13 | Validation works | ✅ Report endpoint validates `INVALID_REASON` + `INVALID_MESSAGE`; certificate-create field validation is enforced inside the upload handler (covered by store add tests for type coercion) |
| 14 | OCR extraction flow | Mocked at the route boundary (extractor is a heavy external dep) — see Gaps |
| 15 | Report incorrect data | ✅ "accepts a valid report and returns 201 with envelope + bumps reportCount" |
| 16 | Pagination works | ✅ "GET /list?limit=N returns the paginated envelope" |
| 17 | Caching does not break freshness | The cache-invalidation hook is exercised by the verify roundtrip test (verify → list returns fresh order). Direct cache-eviction unit test — see Gaps |
| 18 | Analytics tracking works | ✅ `analytics.test.ts` covers every spec event type + summary aggregation |
| 19 | API response format consistent | ✅ `apiResponse.test.ts` locks the success + failure envelope; routes assert envelope on every admin/report path |
| 20 | Existing MVP features still work | ✅ "GET /list returns a bare array with no auth (existing MVP shape preserved)" guards the legacy contract |

---

## Test types implemented

- **Unit:** `apiResponse`, `certificateStore` (normaliseVat, statusFromExpiry, version push, verify, reports), `analytics` (event persistence, summary aggregation).
- **API integration:** Onboarding GET/POST with auth + validation + persistence; certificates list/by-slug/history/reports/admin endpoints/verify/unverify with auth + role gating + envelope shape + duplicate-VAT clustering.
- **UI tests (component-level):** Not added — see Gaps.
- **E2E (Playwright):** Not added — see Gaps.

---

## Gaps & follow-ups

These are real gaps the spec calls for that were intentionally left for a separate task because adding them safely requires new dependencies / infrastructure:

1. **Frontend component tests** (Onboarding.tsx, CertificateHub.tsx, CertificateDetail.tsx, AdminCertificates.tsx).
   - Blocker: `@testing-library/react` and `jsdom` aren't installed. The web app already has `vitest` set to `environment: "node"` for calculator unit tests, so adding RTL needs a config split.
   - Recommendation: add `@testing-library/react` + `@testing-library/jest-dom` + `jsdom`, then a second vitest project entry for `*.tsx` tests. Out of scope for this task.

2. **Playwright E2E.**
   - Blocker: `playwright` isn't installed. The full critical path (logged-out → /certificates → Upload → Sign up → Onboarding → return to /certificates → upload → public listing) needs a real browser harness.
   - Recommendation: `pnpm add -D -w @playwright/test`, scaffold `e2e/critical-path.spec.ts`, run in CI with `pnpm exec playwright install`.
   - In the meantime, `pnpm test:e2e` is wired but exits 0 with a notice pointing here.

3. **SEO / indexability assertions** (titles, canonicals, OG tags, JSON-LD, robots.txt, sitemap.xml). The endpoints that produce JSON-LD (`/certificates/seo/...`) and the static `robots.txt` / `sitemap.xml` files are in place, but verifying their served HTML needs an HTTP fetch against the running web server — best done at the E2E layer.

4. **OCR extraction round-trip.** The `certificateExtractor` is mocked at the route boundary because the real implementation pulls `tesseract.js`, `pdf2pic`, and `canvas` (heavy / non-deterministic). Recommend a separate fixture-driven extractor unit test using a tiny embedded PNG.

5. **Cache eviction unit test.** `certificateListCache` is module-scoped and not exported, so a direct unit test would require widening its surface area. The behavior is exercised indirectly via the verify-then-list ordering test.

6. **Pre-existing scoring-engine failures** (14 tests in `pipeline/__tests__/scoringEngine.test.ts` + `lakeTradingUCS.test.ts`). These were red before this task and concern sector-pack point totals, not certificates or onboarding. Tracking separately.

---

## Engineering notes

- **Module-load side effects:** `certificateStore` and `analytics` resolve their disk paths from `process.cwd()` at import time. The integration tests `chdir` to a fresh `os.tmpdir()` directory inside `beforeAll` and dynamically `await import(...)` the router after the chdir, so disk artifacts stay sandboxed.
- **Mocking surface:** The certificates router pulls in `@azure/storage-blob`, `tesseract.js` (via `certificateExtractor`), Mongoose models, and the Mongo connector. Each is mocked at the import boundary — no network, DB, or OCR runs in the test process. The router itself, the store, the analytics service, and the apiResponse helpers all run real code.
- **Auth:** Production middleware is replaced with a header-driven shim (`x-test-auth: <userId>|<role>`) so every test can choose unauth / user / admin per request without spinning up sessions.
