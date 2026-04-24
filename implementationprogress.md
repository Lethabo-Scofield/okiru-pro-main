# Okiru Pro — Implementation Progress

## Overview
B-BBEE Compliance and Scorecard Management Platform. Processes compliance documents, extracts B-BBEE entities via LLM (Groq), calculates scorecard levels across five pillars, and generates reports.

---

## Infrastructure & Setup

| Item | Status | Notes |
|---|---|---|
| Replit environment configured | ✅ Done | pnpm monorepo, port 5000 |
| MongoDB connected | ✅ Done | MONGODB_URI secret set |
| Groq API key set | ✅ Done | GROQ_API_KEY secret set |
| SMTP email (Zoho) configured | ✅ Done | All 5 SMTP secrets set |
| Session management | ✅ Done | express-session with MongoDB store |
| OTP / 2FA email flow | ✅ Done | generateOtp, sendOtpEmail, verify-otp endpoint |
| Workflow running on port 5000 | ✅ Done | `cd apps/web && pnpm run dev` |

---

## Authentication & User Management

| Feature | Status | Notes |
|---|---|---|
| User registration | ✅ Done | With OTP email verification |
| User login | ✅ Done | OTP required on every login |
| OTP verification endpoint | ✅ Done | `/api/auth/verify-otp` |
| OTP resend endpoint | ✅ Done | `/api/auth/resend-otp` |
| Session destroy / logout | ✅ Done | `/api/auth/logout` |
| Profile update (PATCH) | ✅ Done | `/api/profile` |
| Admin login notification email | ✅ Done | Sends to `cmyezwa@okiru.co.za` |
| 2FA flag per user | ✅ Done | `twofaEnabled` field on user |

---

## B-BBEE Pillar Calculators

| Pillar | Status | Max Points | Notes |
|---|---|---|---|
| Ownership | ✅ Done | 25 | Full ownership, graduation factor, new entrants, BWO |
| Management Control | ✅ Done | 27 | Board, exec, senior/middle/junior, disability |
| Skills Development | ✅ Done | 25 | Learning programmes, bursaries, learnerships, absorption |
| Procurement (EmpB) | ✅ Done | 29 | B-BBEE recognition table, designated group bonus |
| ESD — Supplier Dev | ✅ Done | 10 | Benefit factors, category separation |
| ESD — Enterprise Dev | ✅ Done | 7 | Per DTIC codes |
| SED | ✅ Done | 5 | 1% NPAT target |
| Scorecard aggregation | ✅ Done | 120 | Points → Level 1–9 + recognition % |
| Sub-minimum discounting | ✅ Done | — | Drops one level if sub-min missed |
| Custom config override | ✅ Done | — | `CalculatorConfig` passed to all calculators |

---

## LLM Pipeline (Groq)

| Feature | Status | Notes |
|---|---|---|
| Document upload & chunking | ✅ Done | PDF/DOCX/TXT support |
| NER engine (entity extraction) | ✅ Done | Extracts B-BBEE entities per pillar |
| BM25 / hybrid retrieval | ✅ Done | Relevance ranking on chunks |
| Confidence scoring | ✅ Done | Per-entity confidence 0–1 |
| Provenance tracking | ✅ Done | Source chunk references per entity |
| LLM extractor (Groq) | ✅ Done | `groq-sdk`, no OpenAI dependency |
| Pipeline re-export to web server | ✅ Done | `apps/web/server/pipeline.ts` → `apps/api/pipeline/` |

---

## Document Processor UI (7-step wizard)

| Step | Status | Notes |
|---|---|---|
| 1. Upload | ✅ Done | File drag & drop |
| 2. Configure | ✅ Done | Template selection |
| 3. Process | ✅ Done | LLM pipeline triggered |
| 4. Extract | ✅ Done | Entity extraction results |
| 5. Review | ✅ Done | Manual corrections |
| 6. Summary | ✅ Done | Entities grouped by pillar, confidence badges |
| 7. Scorecard | ✅ Done | Full scorecard view |

---

## Scorecard & Reporting

| Feature | Status | Notes |
|---|---|---|
| Scorecard summary dashboard | ✅ Done | All 6 pillars with progress bars |
| Scenario planning | ✅ Done | What-if adjustments per pillar |
| Excel export | ✅ Done | `exportExcel.ts` |
| PDF export | ✅ Done | `exportPdf.ts` |
| PowerPoint export | ✅ Done | `exportPptx.ts` |
| Client data API | ✅ Done | `/api/clients/:id/data` |
| Templates CRUD | ✅ Done | `/api/templates` |

---

## Testing

| Test Suite | Status | Tests | Notes |
|---|---|---|---|
| `shared.test.ts` | ✅ Passing | 23 | deepClone, safeRatio, clampScore, isBlackRace — extended |
| `utils.test.ts` | ✅ Passing | 22 | formatRand, formatPercentage, cn |
| `skills.test.ts` | ✅ Fixed | 20 | Rewritten to match current SkillsResult shape |
| `management.test.ts` | ✅ Fixed | 22 | Rewritten to match current ManagementResult shape |
| `ownership.test.ts` | ✅ Fixed | 25 | Rewritten to match current OwnershipResult shape |
| `procurement.test.ts` | ✅ Fixed | 15 | Fixed designated group bonus rule (requires youth/disabled) |
| `esd-sed.test.ts` | ✅ Passing | 14 | Category separation, benefit factors, caps |
| `scorecard-integration.test.ts` | ✅ New | 15 | Full pillar integration, level boundaries, sub-minimums |
| `email.test.ts` | ✅ New | 12 | generateOtp, expiry config, max attempts, security |
| `routes.test.ts` | ✅ Fixed | 17 | Full OTP flow tested via MongoDB OTP intercept |

**Total: 181 tests, 181 passing (10 test files)**

---

## Known Issues / Backlog

| Issue | Priority | Notes |
|---|---|---|
| ArangoDB not configured | Low | `apps/api` requires ArangoDB — not started, only `apps/web` runs |
| Git push UI not found by user | Info | Remote is set: `github.com/Lethabo-Scofield/okiru-pro-main` — use Shell |
| `.env.example` not committed | Low | Should be added for onboarding |

---

## Tech Stack

- **Frontend**: React + Vite + TypeScript (pnpm monorepo)
- **Backend**: Express + TypeScript (tsx), MongoDB
- **LLM**: Groq API only (no OpenAI)
- **Email**: Nodemailer + Zoho SMTP
- **Auth**: express-session + OTP 2FA
- **Testing**: Vitest
- **Exports**: xlsx, pdfmake, pptxgenjs
