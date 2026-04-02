# Okiru Pro - Comprehensive Testing & Bug Report

**Date:** 2026-04-02  
**Tested Services:** Web App (port 5000), API Server (port 3000), Computation Engine (port 8000)

---

## Test Summary

| Suite | Tests Run | Passed | Failed |
|-------|----------|--------|--------|
| Web App (Vitest) | 181 | 176 | 5 |
| API Server (Vitest) | 50 | 45 | 5 |
| Computation Engine (Pytest) | 1 | 1 | 0 |
| API Endpoint Tests (Manual) | 30+ | 25+ | 5 |
| **Total** | **262+** | **247+** | **15** |

---

## CRITICAL BUGS

### BUG-001: `/api/calculate` endpoint crashes with 500 error
- **Type:** Runtime / Server Crash
- **Severity:** Critical
- **Location:** `apps/api/src/routes/scorecardBuilder.ts` line 99
- **Error:** `TypeError: Cannot convert undefined or null to object` at `Object.entries(entityValues)`
- **Cause:** The `entityValues` field in the request body is not validated before being passed to `Object.entries()`. When it's `undefined` or `null`, the server crashes.
- **Reproduction:** `POST /api/calculate` with body `{"sectorCode":"RCOGP","scorecardType":"Generic","inputs":[...]}` (missing `entityValues` field)
- **Fix:** Add null check: `const valuesMap = new Map(); if (entityValues) { for (const [key, value] of Object.entries(entityValues)) { ... } }`

### BUG-002: `/api/auth/toggle-2fa` crashes with 500 error
- **Type:** Runtime / Server Crash
- **Severity:** Critical
- **Location:** `apps/web/server/routes.ts` line 518
- **Error:** `TypeError: Cannot destructure property 'enabled' of 'req.body' as it is undefined`
- **Cause:** The route destructures `req.body` without verifying `req.body` exists. If the POST request arrives without a JSON body (or with wrong Content-Type), `req.body` is `undefined`.
- **Reproduction:** `POST /api/auth/toggle-2fa` without a body or without Content-Type header
- **Fix:** Change `const { enabled } = req.body;` to `const { enabled } = req.body || {};`

### BUG-003: `/api/extract-excel` returns HTML instead of error JSON
- **Type:** Route handling / 404 fallthrough
- **Severity:** High
- **Location:** `apps/web/server/excelExtractRoute.ts`
- **Description:** When POST `/api/extract-excel` is called without a file upload (no body), the route falls through to the Vite catch-all handler and returns the full HTML page with a 200 status code instead of a proper JSON error response.
- **Impact:** API consumers receive HTML instead of a JSON error, breaking any automated integration.
- **Fix:** Add input validation at the top of the route handler to return `400` with a JSON error if `fileBase64` is missing.

---

## UNIT TEST FAILURES

### BUG-004: ESD benefit factor not differentiating grants from interest-free loans
- **Type:** Logic / Calculation
- **Severity:** Medium
- **Location:** `apps/web/Toolkit/src/lib/calculators/esd-sed.ts`
- **Test:** `esd-sed.test.ts` line 99: "should apply higher factor for grants than interest-free loans"
- **Details:** Both grants and interest-free loans have a benefit factor of 1.0 (`DEFAULT_BENEFIT_FACTORS`), so `grantResult.sdSpend` equals `loanResult.sdSpend` (both 100,000). The test expects grants to produce a higher spend. Either the test expectation is wrong (if the B-BBEE codes indeed assign the same factor to both), or the benefit factor for interest-free loans should be lower than 1.0 (e.g., 0.7 as used for standard loans).

### BUG-005: Management exec black percentage uses rounding that loses precision
- **Type:** Calculation Precision
- **Severity:** Medium
- **Location:** `apps/web/Toolkit/src/lib/calculators/management.ts`
- **Test:** `management.test.ts` line 155: "should count Executive and Executive Director designations together"
- **Details:** The `execBlackPct` field returns `0.67` instead of `0.6666...`. The `pctOf` helper rounds to 2 decimal places, but the test expects precision to 5 decimal places. Either the `pctOf` function should preserve more precision in `rawStats`, or the test tolerance should be relaxed.

### BUG-006: Skills target overall uses 3.5% instead of test-expected 6%
- **Type:** Calculation Logic Mismatch
- **Severity:** High
- **Location:** `apps/web/Toolkit/src/lib/calculators/skills.ts`
- **Tests:** Multiple failures in `skills.test.ts`:
  - Line 94: "50% spend = ~50% score" — expects `learningProgrammes ≈ 3` but gets `5.14` (target is 3.5% not 6%)
  - Line 229: "targetOverall = 6% of leviable amount" — expects 300,000 but gets 175,000 (3.5% of 5M)
  - Line 191: "absorption rate" — expects `0.6667` but gets `0` (absorption rate calculation appears broken)
- **Root Cause:** The calculator was updated to use 3.5% as the skills development target (noted as a "critical fix" in code comments), but the tests still expect 6%. The absorption rate calculation also returns 0 when it should return 2/3.

### BUG-007: Scoring engine max points expectations are outdated
- **Type:** Test-Code Mismatch
- **Severity:** Medium
- **Location:** `apps/api/pipeline/__tests__/scoringEngine.test.ts`
- **Tests:** 5 failures in sector max points assertions:
  - RCOGP Generic: Test expects 116, actual is 120 (updated MC: 19, Procurement: 29)
  - ICT Generic: Test expects 118, actual is 133 (now includes EE pillar: 15 points)
  - FSC Generic: Test expects 105, actual is 117 (now includes EE pillar: 12 points)
  - AGRI Generic: Test expects 114, actual is 125 (now includes EE pillar: 11 points)
- **Root Cause:** `sectorConfig.ts` was updated with new pillar definitions (Employment Equity pillar added, Management Control and Procurement points adjusted) but the test expectations were never updated to match.

---

## CONFIGURATION / INFRASTRUCTURE ISSUES

### BUG-008: Python test runner has incorrect module path configuration
- **Type:** Test Infrastructure
- **Severity:** Low
- **Location:** `apps/Computation-Engine/pytest.ini`
- **Description:** Running `pytest` from the `apps/Computation-Engine/` directory fails with `ModuleNotFoundError: No module named 'app'` because `pytest.ini` sets `testpaths = tests` but the test imports `from app.services...` which requires `backend/` to be on the Python path. Tests only pass when run from within the `backend/` directory.
- **Fix:** Update `pytest.ini` to set `testpaths = backend/tests` and add `pythonpath = backend` to the config.

### BUG-009: Computation Engine admin routes return 403 without admin authentication
- **Type:** Configuration / Documentation
- **Severity:** Low
- **Location:** `apps/Computation-Engine/backend/app/`
- **Description:** All Computation Engine admin routes (`/admin/models/*`) require admin authentication headers that are not documented. The API Server proxies to these routes but the authentication mechanism between services is unclear. When calling directly, all endpoints return `{"detail":"Admin access required"}`.

### BUG-010: Scorecard proxy route mismatch between web and API server
- **Type:** Integration
- **Severity:** Medium
- **Location:** `apps/web/server/apiProxy.ts` and `apps/api/src/routes/scorecard.ts`
- **Description:** The web server proxies `/api/scorecard/evaluate-by-sector` to the API server, but the API server's route handler expects `sectorCode` and `scorecardType` fields (not `sector` and `type`), returning a 400 error. The naming convention is inconsistent between what the frontend sends and what the backend expects.

---

## SECURITY OBSERVATIONS

### SEC-001: No input sanitization on XSS payloads in registration
- **Type:** Security
- **Severity:** Medium
- **Description:** The registration endpoint accepts `<script>alert(1)</script>` as a username without sanitization. While the error returned is "Organization is required" (blocking registration for a different reason), the username itself is not validated or sanitized. If registration succeeds, the XSS payload could be stored and rendered.

### SEC-002: No password length/complexity validation on registration
- **Type:** Security
- **Severity:** Medium
- **Description:** A 10,000-character password is accepted without rejection at the validation level. This could lead to denial-of-service through expensive bcrypt hashing of extremely long passwords.

### SEC-003: Demo user is auto-seeded with known credentials
- **Type:** Security
- **Severity:** Low (Development only)
- **Description:** A demo user with credentials `demo/demo` is automatically seeded when MongoDB is unavailable. The `isVerified` flag is `false` but the user can still access all authenticated endpoints. This should be disabled or clearly gated in production builds.

---

## WARNINGS / NON-CRITICAL ISSUES

### WARN-001: SMTP not configured
- **Description:** All email-related features (OTP verification, login notifications, password reset) silently fail because no SMTP server is configured. Users can register but cannot complete email verification.

### WARN-002: External databases not connected
- **Description:** MongoDB, ArangoDB, and Redis are all unavailable. The application falls back to in-memory storage, meaning all data is lost on restart. This is expected for development but should be addressed for any production use.

### WARN-003: AI/LLM API keys not configured
- **Description:** GROQ_API_KEY and Azure OpenAI credentials are not set. AI-powered extraction features (`/api/extract-entities`, `/api/generate-entities`) return placeholder/mock results instead of actual AI extractions.

### WARN-004: openpyxl deprecation warning in Python engine
- **Description:** `datetime.datetime.utcnow()` is deprecated in Python 3.12. The `openpyxl` library uses this deprecated method, generating warnings during test runs.

### WARN-005: Vite WebSocket connection fails intermittently
- **Description:** Browser console shows `[vite] failed to connect to websocket (Error: WebSocket closed without opened.)`. This is a known Replit proxy issue affecting HMR but does not impact functionality.

---

## FRONTEND OBSERVATIONS

### UI-001: Protected routes redirect to login
- **Description:** Navigating to `/hub` while unauthenticated correctly redirects to the login page (`/auth`). Route protection is working as expected.

### UI-002: Login form shows "Work Email" but accepts username
- **Description:** The login form displays "Work Email" as the field label, but the demo user logs in with a username (`demo`), not an email. This could confuse users. The backend accepts both, but the UI should reflect that.

---

## RECOMMENDATIONS

1. **Immediate:** Fix BUG-001, BUG-002, and BUG-003 — these are server crashes and broken API responses that affect reliability.
2. **High Priority:** Resolve BUG-006 (skills calculator) — determine whether 3.5% or 6% is the correct B-BBEE target and align tests with implementation.
3. **Medium Priority:** Update test expectations in BUG-004, BUG-005, BUG-007 to match the current implementation, or fix the implementation if the tests represent the correct business logic.
4. **Low Priority:** Fix BUG-008 (pytest config) and address security observations.
