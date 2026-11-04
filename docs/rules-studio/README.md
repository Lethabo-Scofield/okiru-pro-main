# Okiru Rules Studio

Controlled, auditable changes to the B-BBEE scoring rules for nine scorecards, on top of the
existing calculation engine. Status of every component is in [STATUS.md](./STATUS.md);
the 3 November test procedure is in [TEST-PLAN.md](./TEST-PLAN.md).

## How it fits together

```
 Studio UI (/studio)  ──►  /api/rules-studio  ──►  Studio service  ──►  rules ledger (Mongo, signed, append-only)
        │                       │ step-up (TOTP)        │ impact engine (shared scorer)     │
        │                       └ /api/auth/step-up     │ signed snapshot ─► off-site store │
        ▼                                               ▼                                   ▼
 Toolkit store.loadCalculatorConfig ◄── /api/rules/published/:sid, /api/rules/heads ◄───────┘
```

* **One scoring engine.** `apps/web/Toolkit/src/lib/scoring/calculateScorecard.ts` is the pure scorer
  extracted from the store. The browser, the server impact engine and the parity tests all call it.
  `apps/api` imports it directly (API typecheck uses `moduleResolution: Bundler`; the API Dockerfile
  copies `apps/web/Toolkit/src/lib` into the builder).
* **Two override layers** (`rules/buildEffectiveConfig.ts`): overrides are applied to a deep clone of the
  shipped `SectorConfig`, the scorecard's own converter runs, then calculator overrides are applied to the
  generated `CalculatorConfig`. Empty overrides reproduce the shipped config exactly (tested for all nine).
* **Registry** (`rules/registry/`): derived from the real sector sources, one rule per numeric leaf, with
  unit, bounds and editability. A test proves every registered rule changes the effective config; leaves the
  converters ignore are listed in `registry/unwired.ts` and are not offered (they are developer change requests).
* **Ledger** (`apps/api/src/rules`): Ed25519-signed, hash-chained, append-only `rules_versions`;
  unique `(scorecardId, version)` is the publish lock. Reads re-verify the whole chain, recompute the config
  hash and check registry compatibility, and fail with 500 + alarm otherwise. Version 0 = the shipped rules.
* **Live link**: launched deployments fail closed (no score, error, Retry) if rules cannot be fetched or
  verified. Before launch (`RULES_LAUNCHED=false`) the shipped rules are used and nothing changes.
* **Pins**: `client.rulesetPins`; publish / freeze / rollback never move a pin; only the audited
  "re-score under current rules" endpoint does.

## Roles (`studioGrants`)

| Role | Can |
|---|---|
| Viewer | read |
| Expert Editor | create/edit drafts, run impact, submit, raise change requests |
| Developer | manage change requests |
| Expert Approver | approve/reject, publish, freeze, emergency rollback |
| Okiru Admin | grants, audit, backups, freeze, emergency rollback — **not** ordinary approval/publish |

Authors (creator, contributors, users who accepted an AI proposal) can never approve or publish their own change.
Platform admin / super-admin roles grant nothing in the Studio. First grants: set `RULES_STUDIO_BOOTSTRAP_ADMINS`.

## Publishing path (all server-side)

draft → authoritative impact (match / deliberate / unexplained / missing, attribution, invariants) → submit →
independent approval bound to the draft hash → `publish/prepare` (12 checks) → step-up TOTP bound to
`(draft hash, next version, effective date)` → signed snapshot written to Mongo **and** off-site, read back and
verified → signed version appended. Any snapshot failure ⇒ `503 snapshot_failed` + critical alarm, nothing published.

## Operations

* **Freeze** (per scorecard or all): append-only event; unpinned clients get the chosen last-known-good version, publishing returns 423.
  Independent of the UI: set `RULES_FREEZE=true` on the API.
* **Emergency rollback** `POST /api/rules-studio/scorecards/:sid/emergency-rollback` (approver/admin + step-up): verified snapshot first,
  then the old overrides are published as a new `rollback` version; incompatible target ⇒ freeze to last known good;
  creates a review task due in two working days. Allowed while frozen. Never skips signature or backup verification.
* **Normal restore**: creates a draft containing the old rules; goes through impact, approval and publish.
* **Nightly**: signed whole-ledger snapshot, off-site read-back, verification of an older snapshot, integrity sweep, heartbeat ping
  (`RULES_HEARTBEAT_URL`). Failures withhold the heartbeat. Configure a dead-man-switch monitor **outside** Okiru to alarm when pings stop.

## Environment

See `apps/api/.env.example` (Rules Studio block) and `apps/web/.env.example` (`VITE_RULES_LAUNCHED`).
Dedicated signing key, TOTP encryption key, off-site connection string — there are no fallbacks. Generate commands are in the template.

## Ingress / proxy

`/api/rules` and `/api/rules-studio` fall under the ingress `/api` catch-all → `api`. `/api/auth/step-up` and
`/api/clients/:id/ruleset-pins` enter via `web` (their ingress prefixes) and are proxied to `api` by
`apps/web/server/apiProxy.ts`. No ingress change is needed. `studio.okiru.pro` / Cloudflare Access is an owner decision (below).

## Differences from the directive's assumptions (documented, not hidden)

* No `review/all-sectors` branch exists; work was done on `feature/rules-studio`, branched from the current branch.
* No `calcReview/registry.ts`, `REVIEW_SCORECARDS` or `components/calc-review` exist in this repository; the nine scorecard ids
  come from the directive's table and live in `rules/scorecards.ts`.
* Directive step 2 says guarantees `0.5 → 0.03`. The shipped value is **already 0.03**
  (`apps/api/pipeline/sectorConfig.ts`, `guarantees.sdFactor`); the acceptance test applies `0.03 → 0.5` instead.
* The calculator carries ONE benefit factor per contribution type (`sdFactor`); `edFactor` is not a separate lever, so it is not offered.
* "124 Empower parity cases" are not in this repository. The impact engine uses 5 synthetic profiles per scorecard
  (`rules/impact/fixtures.ts`); the larger library is a gap (see STATUS).
* Only expert-editable leaves with proven effect are exposed; points (`*MaxPts`, `*Bonus`) are `developer`-only because they restructure a scorecard.

## Owner decisions still needed

Sector approvers and the number of independent approvals (`RULES_REQUIRED_APPROVALS`, default 1); Studio host and
Cloudflare Access identity source; AI provider/region/budget; off-site storage account **in a different subscription** with an immutability policy;
offline recovery-key custodians; alarm webhook destination and heartbeat monitor; security-test provider and release approval;
retention (recommended: 7 years); whether real client uploads may be used for testing (the default is synthetic only).
