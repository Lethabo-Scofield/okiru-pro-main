# Versioning & Compatibility Policy (COM-002)

> All shared components in this monorepo follow Semantic Versioning 2.0.0
> (https://semver.org). This document defines the org-specific rules layered
> on top of SemVer.

## SemVer rules

| Bump  | When                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------- |
| MAJOR | Any backward-incompatible change to the public API, exported types, log envelope, or error shape. |
| MINOR | New backward-compatible feature, new exports, optional parameters with safe defaults.             |
| PATCH | Bug fix that does not change the public surface; perf improvement; doc-only changes.              |

The **public API** is everything reachable from the package's `exports` field
(JS) or top-level package symbols (Python). Internal modules MUST live under
`src/_internal/` (JS) or `_internal/` (Python) and are not subject to SemVer.

## Pre-1.0 components

A package with `0.x.y` is considered **experimental**. MINOR bumps may be
breaking. Consumers must pin exact versions (`0.3.1`, not `^0.3.0`).

## Lockfile & resolver policy

* Applications: lockfiles MUST be committed (`pnpm-lock.yaml`, `uv.lock` or
  generated `requirements.txt`). CI installs frozen.
* Libraries: never commit a lockfile; declare semver-flexible ranges so
  consumers control resolution.

## Breaking-change process

1. **Open a Breaking-Change Proposal** issue with: motivation, before/after API,
   migration steps, named consumers, and target removal date.
2. **Ship a deprecation MINOR** first if possible: add the new API, mark the
   old one `@deprecated` (JS) or emit a `DeprecationWarning` (Python). Keep
   both for one release cycle.
3. **Cut the MAJOR** with a `MIGRATION-vX.md` in the package root. Update
   `catalog.json` `breakingChanges` array.
4. **Notify consumers** listed in `consumers` of the package's `catalog.json`
   at least 14 days before release.
5. **Update consumers** (PRs against each app) in the same release window.

## Cross-language contracts

If Node and Python services share a wire-level contract (HTTP payloads, queue
messages, log envelope), the contract is owned by a `schemas-types` component
and version-bumped independently. SDKs in each language declare which contract
versions they support in `catalog.json` under `contractsImplemented`.

## PR checklist for releases

Every PR that bumps a shared package's version MUST include:

- [ ] Updated `package.json`/`pyproject.toml` version
- [ ] Updated `CHANGELOG.md` with the new version, date, and notes
- [ ] Bump category (PATCH/MINOR/MAJOR) justified in the PR description
- [ ] For MAJOR: link to Breaking-Change Proposal issue + `MIGRATION-vX.md`
- [ ] For new public exports: reflected in `catalog.json`
- [ ] Consumer apps that need to update are listed (or "none")
