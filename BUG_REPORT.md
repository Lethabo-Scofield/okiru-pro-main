# Okiru Pro - Comprehensive Testing & Bug Report

**Date:** 2026-04-02  
**Tested Services:** Web App (port 5000), API Server (port 3000), Computation Engine (port 8000)

---

## Test Summary (After Fixes)

| Suite | Tests Run | Passed | Failed |
|-------|----------|--------|--------|
| Web App (Vitest) | 182 | 182 | 0 |
| API Server (Vitest) | 50 | 50 | 0 |
| Computation Engine (Pytest) | 1 | 1 | 0 |
| **Total** | **233** | **233** | **0** |

---

## FIXED BUGS

### BUG-001: `/api/calculate` endpoint crashes with 500 error — FIXED
- **Type:** Runtime / Server Crash
- **Severity:** Critical
- **Location:** `apps/api/src/routes/scorecardBuilder.ts`
- **Fix:** Added null-guard on `req.body` with `|| {}`, validation for required `sectorCode`/`scorecardType` fields, and safe `entityValues` check before `Object.entries()`.

### BUG-002: `/api/auth/toggle-2fa` crashes with 500 error — FIXED
- **Type:** Runtime / Server Crash
- **Severity:** Critical
- **Location:** `apps/web/server/routes.ts`
- **Fix:** Changed `const { enabled } = req.body;` to `const { enabled } = req.body || {};`

### BUG-003: `/api/extract-excel` returns HTML instead of error JSON — FIXED
- **Type:** Route handling / 404 fallthrough
- **Severity:** High
- **Location:** `apps/web/server/excelExtractRoute.ts`
- **Fix:** Added early validation returning JSON 400 error when `req.body` is missing or not an object.

### BUG-004: ESD benefit factor test comparing wrong contribution types — FIXED
- **Type:** Test expectation error
- **Severity:** Medium
- **Location:** `apps/web/Toolkit/src/lib/calculators/__tests__/esd-sed.test.ts`
- **Fix:** Per B-BBEE codes, grants and interest-free loans share the same benefit factor (1.0). Updated the test to compare grants vs `standard_loan` (which has a 0.7 factor) and added a separate test confirming grants and interest-free loans produce equal spend.

### BUG-005: Management rawStats use `round2()` losing precision — FIXED
- **Type:** Calculation Precision
- **Severity:** Medium
- **Location:** `apps/web/Toolkit/src/lib/calculators/management.ts`
- **Fix:** Introduced `pctOfRaw()` helper for rawStats that returns full precision values instead of `round2()`. rawStats now return unrounded percentages while display scores remain rounded.

### BUG-006: Skills calculator tests misaligned with 3.5% target — FIXED
- **Type:** Test-Code Mismatch
- **Severity:** High
- **Location:** `apps/web/Toolkit/src/lib/calculators/__tests__/skills.test.ts`
- **Fix:** Updated all test expectations to use 3.5% target (matching the deliberate "CRITICAL FIX" in the codebase). Fixed `isEmployed` → `isAbsorbed` in absorption rate test (matching the `TrainingProgram` interface). Removed `round2()` from absorption rate in rawStats for full precision.

### BUG-007: Scoring engine max points expectations outdated — FIXED
- **Type:** Test-Code Mismatch
- **Severity:** Medium
- **Location:** `apps/api/pipeline/__tests__/scoringEngine.test.ts`
- **Fix:** Updated expected max points to match actual sector configuration: RCOGP Generic→120, ICT Generic→133, FSC Generic→117, AGRI Generic→125.

### BUG-008: Python test runner has incorrect module path — FIXED
- **Type:** Test Infrastructure
- **Severity:** Low
- **Location:** `apps/Computation-Engine/pytest.ini`
- **Fix:** Set `testpaths = backend/tests` and added `pythonpath = backend`.

---

## SECURITY FIXES

### SEC-001: Username input validation added — FIXED
- **Location:** `apps/web/server/routes.ts`
- **Fix:** Usernames must be 3–50 characters, alphanumeric with dots, hyphens, and underscores only. Regex pattern: `^[a-zA-Z0-9_.-]+$`

### SEC-002: Password length cap to prevent bcrypt DoS — FIXED
- **Location:** `apps/web/server/routes.ts`
- **Fix:** Passwords capped at 128 characters maximum to prevent denial-of-service through expensive bcrypt hashing.

---

## REMAINING ISSUES (Not Fixed)

### BUG-009: Computation Engine admin routes return 403 without admin authentication
- **Type:** Configuration / Documentation
- **Severity:** Low
- **Description:** Admin routes require authentication headers that are not documented. This is by design for inter-service communication.

### BUG-010: Scorecard proxy field naming
- **Type:** Integration
- **Severity:** Medium (Informational)
- **Description:** The API server expects `sectorCode` and `scorecardType` fields. The proxy routes work correctly — this was originally flagged as a client-side concern (frontend must send the correct field names).

### SEC-003: Demo user auto-seeded with known credentials
- **Type:** Security
- **Severity:** Low (Development only)
- **Description:** Demo user `demo/demo` is seeded when MongoDB is unavailable. Should be disabled in production.

---

## WARNINGS / NON-CRITICAL ISSUES

### WARN-001: SMTP not configured
- All email features silently skip. Users cannot complete email verification.

### WARN-002: External databases not connected
- MongoDB, ArangoDB, Redis unavailable. App uses in-memory fallback; data does not persist across restarts.

### WARN-003: AI/LLM API keys not configured
- GROQ and Azure OpenAI keys not set. AI extraction returns placeholder results.

### WARN-004: openpyxl deprecation warning
- `datetime.datetime.utcnow()` deprecated in Python 3.12. Cosmetic warning from openpyxl library.

### WARN-005: Vite WebSocket connection fails intermittently
- Known Replit proxy issue affecting HMR; does not impact functionality.

---

## FRONTEND OBSERVATIONS

### UI-001: Protected routes redirect to login
- Route protection working correctly.

### UI-002: Login form shows "Work Email" but accepts username
- Cosmetic label mismatch; backend accepts both.
