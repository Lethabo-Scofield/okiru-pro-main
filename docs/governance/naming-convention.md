# Naming & Namespace Convention (COM-005)

## Node / TypeScript packages

* All shared components use the **`@okiru/`** npm scope.
* Package name: lowercase, kebab-case, single noun or noun-phrase.
  * Good: `@okiru/logger`, `@okiru/types`, `@okiru/arango-client`,
    `@okiru/express-request-id`.
  * Bad: `@okiru/Logger`, `@okiru/utils` (too vague), `@okiru/fix-it`
    (verb), `@okiru/api-v2-helpers-final` (versioning in name).
* Adapter packages use the pattern `@okiru/<vendor>-adapter`
  (e.g. `@okiru/openai-adapter`, `@okiru/azure-search-adapter`).
* Express/Koa/FastAPI middleware uses the pattern
  `@okiru/<framework>-<purpose>-mw` (e.g. `@okiru/express-logger-mw`).
* Folder name under `packages/` MUST equal the unscoped package name
  (`@okiru/logger` → `packages/logger/`).

## Python packages

* PyPI distribution name: **`okiru-<name>`** (lowercase, hyphenated).
* Import name: **`okiru.<name>`** (lowercase, snake_case if multi-word).
  Use a namespace package so multiple `okiru-*` distributions can coexist
  under the same `okiru.` import root.
* Folder name under `packages/`: `py-<name>` (e.g. `packages/py-shared/`,
  `packages/py-arango-client/`) to disambiguate from JS folders.

## Reserved prefixes

These prefixes are reserved and MUST NOT be used by shared components
unless the platform team explicitly approves:

| Prefix              | Reason                                               |
| ------------------- | ---------------------------------------------------- |
| `@okiru/internal-`  | Reserved for tooling not meant for product apps.     |
| `@okiru/legacy-`    | Reserved for frozen, unmaintained code awaiting EOL. |
| `@okiru/_*`         | Reserved for templates and scaffolding.              |
| `okiru_test_*` (py) | Reserved for test fixtures.                          |

## Versioning in names — never

Do NOT encode major versions in the package name (`@okiru/foo-v2`). Use
SemVer (`@okiru/foo` `2.0.0`) and the migration process from
`versioning-policy.md`. The single accepted exception is when running
two majors in parallel during a long migration; that is a platform-team
escalation, not a default.

## Lint enforcement

* CI runs a name lint for any new directory under `packages/` (regex:
  `^[a-z][a-z0-9-]*$` for JS, `^py-[a-z][a-z0-9-]*$` for Python).
* `package.json#name` MUST start with `@okiru/`.
* `pyproject.toml#project.name` MUST start with `okiru-`.
