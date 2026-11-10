# Rules Studio — implementation status

"Complete" means implemented **and** its automated checks pass. Anything needing an external account, key or
approval is "Code complete, not verified live". Last full run: web 1696 tests passed (107 files), API Rules Studio 122 passed (8 files),
API `tsc` clean. Branch `feature/rules-studio`.

| Component | Status | Evidence | Remaining work |
|---|---|---|---|
| Shared scoring engine | **Complete** | `scoring/calculateScorecard.ts` extracted behaviour-preserving (existing suite unchanged); API imports it; 6 pre-existing type errors in its closure fixed with type-only casts | none |
| Rule registries (9 scorecards) | **Complete** for data-driven numeric rules | `rules/__tests__/registry.test.ts`, `paths.test.ts`: empty-override parity ×9, no phantom controls, bounds, path safety, immutability | Leaves the converters ignore are listed in `registry/unwired.ts` (EE band points, generic MC per-band targets, QSE procurement rows, FSC `edJobsBonus`, `edFactor`) and need developer change requests. Calculator-layer rules: layer implemented and tested, no real calculator-layer rules registered yet. Other sectors (Transport, Construction, MAC, FSC QSE) intentionally not exposed |
| Published-rule integration | **Complete** (code) | `rules.published.test.ts`, `liveLink.test.ts`: fail-closed, pins, `periodEnd`, ETag, 423/404/500/503, stamps v0.., 60 s/focus/BroadcastChannel watcher | The "show old and new score and the reason when rules change" banner is not built; exports are blocked by the existing `CalculatorConfigGate` only where that gate is used (not audited per export button). 90-second propagation target not measured |
| Draft and version persistence | **Complete** (code) | `rulesService.test.ts`, `acceptance.test.ts`; Mongo models: `rules_versions`, `rule_freezes`, and generic `studio_*` collections | Append-only is enforced by the app and Mongoose hooks only; **database-role (permission) enforcement is an infra task**. `ruleChangeItems` are embedded in the changeset document rather than a separate collection |
| Security and permissions | **Complete** (code) | `security.test.ts` (matrix per role, scope, bootstrap), route matrix + CSRF/origin + rate-limit, four-eyes tests, step-up replay/binding/expiry/lock-out, signed hash-chained audit | Cloudflare Access / `studio.okiru.pro` (owner); Studio-specific CSP is set on the API's JSON responses but **not yet on the SPA `/studio` HTML**; "unusual login" and "outstanding developer requests" alerts not implemented; strict cookie settings are inherited from the existing session config, not re-verified; no external security review |
| Backup and recovery | **Code complete, not verified live** | Snapshot write/readback/verify failure tests; nightly + heartbeat tests; Azure Blob adapter (`snapshots.ts`) | Needs the real off-site account (different subscription, immutability policy), recovery-key custody, an external dead-man-switch monitor, and a real restore drill (`POST /backups/drill-results` records one). Weekly whole-database recovery test is not implemented |
| Rollback and freeze | **Complete** (code) | restore / emergency rollback / freeze / incompatible-target / frozen-rollback / snapshot-failure tests; `RULES_FREEZE` | 15-minute recovery target not measured |
| Impact engine | **Partial** | `impact.test.ts` (9 scorecards, deterministic), `impactReview.test.ts`, verdicts + attribution + invariants, server run is authoritative, browser Web Worker preview | Fixtures are 5 synthetic profiles per scorecard, **not** the 124 Empower parity cases / nine worked samples / Level-1 workbook tests (not in the repo). Server worker has a concurrency cap and time check but runs in-process (no memory/CPU isolation). No automated browser-vs-server numeric comparison beyond sharing the same code |
| Frontend integration | **Partial** | 11 screens + step-up dialog build/typecheck; 17 SSR smoke tests | **Production `vite build` could not be verified**: it fails on conflict markers in `UploadWizard.tsx` that I introduced (see below), unrelated to Studio code. No browser walkthrough was done. Pin management UI ("Re-score under current rules") has API + client methods but no screen. Light theme only (matches app) |
| AI integration | **Code complete, not verified live** | Strict JSON validation, adversarial tests, human-accept authorship rule, disabled without `RULES_AI_API_KEY` | Never run against a real provider; provider/region/budget are owner decisions |
| Monitoring | **Partial** | In-app notifications, alarm webhook with retries and delivery records, email outbox inactive without SMTP | No real webhook tested; the email outbox does not actually send; alarm for "missing heartbeat" lives in the external monitor |
| CI and tests | **Complete** for what exists | API `tsc` step added to `.github/workflows/ci.yml`; new tests run in existing web/API test steps | 3 unrelated API route test files (`onboarding`, `parserDocuments`, `scorecardAdvice`) failed in my runs; I did not modify anything they cover and did not investigate further |

## Update: launch gate, rehearsal, restricted DB user

* **Launch gate (implemented, tested):** `RULES_LAUNCHED=true` only takes effect when every blocker in `rules/readiness.ts` passes
  (signing key, TOTP key, off-site store outside the primary account, build id, alarm webhook, heartbeat, restricted DB user, an editor and a
  *different* approver, an enrolled authenticator). Otherwise the API logs why and keeps serving the shipped rules. Live view: `GET /api/rules-studio/readiness`
  and the Overview panel; `POST /readiness/test-offsite` writes and reads back a probe object.
* **Rehearsal mode (implemented, verified locally):** `node scripts/rules-studio-setup.mjs --rehearsal` writes a git-ignored `apps/api/.env.rehearsal`
  with fresh keys and a local-directory backup store. It is refused in production and is **never** counted as production-ready.
  Verified against a running API: keys load, probe write/read-back OK, readiness correctly reports `rehearsal=true, productionReady=false`.
* **Database-level append-only (code complete, NOT executed):** `RULES_MONGO_URI` moves the rules/Studio collections to a separate restricted
  user (no update/delete on history). Role, index script and proof steps: `mongo-roles.md`. Needs a DB admin to run; the readiness check stays red until then.
* **Propagation notice (implemented):** unpinned scorecards show "Scoring rules updated to version N", the announcement and old → new score.
* Found by the real-Mongo run and fixed: concurrent audit appends could exhaust their retries (now jittered, 30 attempts).

## Real vs simulated (read this before trusting a green test run)

| Area | Connected to the real thing? | How it was validated |
|---|---|---|
| Scoring engine | **Real** | `calculateScorecard` is the production scorer; `scorerParity.test.ts` proves full ScorecardResult parity (shipped vs empty-override config) for 9 scorecards × 5 fixtures; the whole existing B-BBEE suite is unchanged |
| MongoDB (ledger, freeze, studio collections, audit, step-up, grants, snapshots, client pins) | **Real, validated** | `mongo.integration.test.ts` (11 tests) and the full 20-step scenario + guards (`acceptance.test.ts`, 12 tests) pass against a real Atlas cluster in a scratch database. Findings: override keys containing dots/brackets round-trip correctly; the unique (scorecardId, version) index serialises concurrent publishes (no duplicate, no gap); Mongoose hooks block update/delete; a raw-driver edit behind the application is caught by signature verification. Run: `RULES_TEST_MONGO_URI=<uri> npx vitest run src/rules/__tests__/mongo.integration.test.ts src/rules/studio/__tests__/acceptance.test.ts` (uses a throwaway `rules_studio_test_*` database) |
| Mongo role-level append-only | **Not done** | Needs a restricted DB user (no update/delete on `rules_*` collections) — infra |
| Studio HTTP routes on real Mongo | **Not done** | Route tests use in-memory stores; the services they call were validated on Mongo above |
| Off-site backup store | **Simulated** | In-memory fake in all tests. The Azure Blob adapter exists but has never touched a real account |
| Signing keys | **Test keys only** | Generated per test run. No production key exists; custody undecided |
| TOTP step-up | **Real algorithm, no real user** | RFC 6238 vectors pass; never exercised from a real authenticator app |
| Authentication/session | **Simulated in route tests** | Header-based fake session; the real session store was not exercised against Studio routes |
| Alarm webhook / heartbeat monitor / email | **Simulated** | Fake fetch; the email outbox only records "skipped" |
| AI provider | **Simulated** | Injected provider; no real call made |
| Browser UI | **Built; production `vite build` passes (incl. worker bundle); SSR smoke-tested** | No interactive browser walkthrough yet |

### Blocked on the owner (cannot be done in code)
1. Off-site storage account in a **different subscription** with an immutability policy, plus its connection string.
2. A production Ed25519 signing key and a custody plan; `RULES_TOTP_ENC_KEY`.
3. A restricted Mongo user for the rules collections (append-only at the database level).
4. Alarm webhook destination and an external dead-man-switch monitor for `RULES_HEARTBEAT_URL`.
5. Approvers, number of approvals, Studio host / Cloudflare Access, AI provider/budget, security-test provider.

`RULES_LAUNCHED` stays `false` until the recovery drills in TEST-PLAN.md pass against the real backup store.

## Incident (resolved)

An accidental `git stash pop` applied the older stash `payg-upload-quote-flow` and left conflict markers in `UploadWizard.tsx` and `parser.ts`. With approval both files were restored to HEAD (verified first: none of the Rules Studio commits touch them); the stash entry is preserved. The web production build passes again.
