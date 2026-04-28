# Okiru Shared Component Governance

This folder is the source of truth for how shared backend components are
defined, owned, versioned, secured, and named inside the Okiru monorepo and
(eventually) inside the org-wide private package registries.

The structure mirrors the Component Registries program (Epics COM-001..COM-005).

| File                               | Jira ref | Topic                                                 |
| ---------------------------------- | -------- | ----------------------------------------------------- |
| `component-taxonomy.md`            | COM-001  | What counts as a shared component vs. in-app code     |
| `versioning-policy.md`             | COM-002  | SemVer rules, breaking-change process, contract specs |
| `ownership-model.md`               | COM-003  | OWNERS.md format, on-call, SLAs                       |
| `security-policy.md`               | COM-004  | License allowlist, secret hygiene, scanning, signing  |
| `naming-convention.md`             | COM-005  | Package naming, scopes, namespacing                   |
| `../../packages/_template/`        | COM-012  | Standard package scaffold (TypeScript)                |
| `../../packages/py-shared/`        | COM-021  | Standard package scaffold (Python)                    |
| `../../catalog.json`               | COM-031  | Machine-readable catalog of all shared components     |
| `../../catalog.schema.json`        | COM-031  | JSON Schema for per-package `catalog.json`            |
| `../../catalog.registry.schema.json` | COM-031 | JSON Schema for the root `catalog.json` aggregator    |

## Lifecycle of a shared component

```
proposal  ──►  experimental  ──►  stable  ──►  deprecated  ──►  removed
   │              │                 │              │
   ADR     ≥1 consumer        ≥2 consumers   migration guide
                              + SLA owner    + sunset date
```

Tier transitions are recorded in the package's `catalog.json` under `tier`.

## Quick start

* **I want to consume a shared package** → add it to `package.json`/`pyproject.toml`
  using its workspace name (`@okiru/<name>` or `okiru-<name>`). No registry
  config is required while we ship from the monorepo.
* **I want to publish a new shared component** → copy `packages/_template/` (TS)
  or `packages/py-shared/` (Python), populate `OWNERS.md` and `catalog.json`,
  and follow `versioning-policy.md`.
* **I'm shipping a breaking change** → see `versioning-policy.md` § Breaking
  changes and the migration guide checklist.
