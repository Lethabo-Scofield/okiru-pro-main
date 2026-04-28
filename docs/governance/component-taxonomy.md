# Component Taxonomy & Boundaries (COM-001)

> **ADR-0001** — Status: accepted — Deciders: platform team
> Last reviewed: see git history of this file.

## Purpose

Define **what counts as a shared backend component** and **when code should be
extracted out of an application** into a versioned, separately-owned package.

## Categories

Every shared component must fit into exactly one of these categories. The
category is recorded in the package's `catalog.json` under `category`.

| Category                   | Examples in this repo                                                  | Allowed runtime deps                          |
| -------------------------- | ---------------------------------------------------------------------- | --------------------------------------------- |
| `shared-library`           | `@okiru/logger`                                                        | Stdlib only or pure-JS/Python utilities       |
| `internal-sdk`             | (future) `@okiru/arango-client`, `@okiru/scoring-sdk`                  | Network clients allowed; no framework lock-in |
| `integration-adapter`      | (future) `@okiru/openai-adapter`, `@okiru/azure-search-adapter`        | Single third-party SDK                        |
| `observability-middleware` | (future) `@okiru/express-logger-mw`                                    | Framework-coupled (Express, FastAPI)          |
| `schemas-types`            | `@okiru/types`                                                         | Zero runtime deps                             |
| `test-utilities`           | (future) `@okiru/test-fixtures`                                        | dev-only deps                                 |

## When code MUST become a shared component

Any **one** of the following is a sufficient trigger:

1. **Duplication.** The same logic exists in ≥ 2 apps (`apps/api`, `apps/web`,
   `apps/Computation-Engine`) and they have drifted or are likely to.
2. **Stability contract.** External callers depend on a specific output shape
   (e.g. log envelope, error payload, scoring output), and a breaking change
   would require coordinated rollouts.
3. **Cross-language contract.** Behaviour must be consistent across Node and
   Python (use a `schemas-types` package + a per-language SDK).
4. **Security review surface.** Code handles secrets, signing, crypto, or
   auth — centralising it lets one team own the audit.

## When code SHOULD STAY in-app

* Used by exactly one app and unlikely to be reused.
* Tightly coupled to that app's domain model (e.g. a route handler, a Vite
  plugin specific to `apps/web`).
* Experimental / pre-MVP — promote it once it stabilises.

## Examples in this repo

| Code                                       | Decision                          | Rationale                                                  |
| ------------------------------------------ | --------------------------------- | ---------------------------------------------------------- |
| `apps/api/src/logger.ts` ⇆ `apps/web/server/logger.ts` | **Extract** → `@okiru/logger` (done) | Identical content, used by 40+ files across two apps.       |
| `apps/api/pipeline/extraction/llmExtractor.ts`         | Stay in-app                       | Single consumer, deeply coupled to API's pipeline graph.    |
| `apps/web/server/replit_integrations/`                 | Stay in-app (for now)             | Used only by web; revisit when API needs the same adapters. |
| `apps/api/arango/connection.ts`                        | **Candidate** → `@okiru/arango-client` | Likely to be needed by Compute Engine and API both.        |
| `apps/api/pipeline/rules/calculationEngine.ts`         | Stay in-app                       | Domain-specific to BBBEE scoring, single owner.            |

## Promotion checklist

Before promoting in-app code to a shared component:

- [ ] At least one consumer outside the originating app has signed up.
- [ ] Public API is documented in the package README.
- [ ] Tests cover the public surface (not internal helpers).
- [ ] `OWNERS.md` and `catalog.json` are populated.
- [ ] SemVer policy (COM-002) is understood by the owning team.
- [ ] No secrets, no per-environment URLs, no app-private types leak through
      the public surface.
