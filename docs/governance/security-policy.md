# Security & Compliance for Published Artifacts (COM-004)

This is the **minimum bar** a shared component MUST clear before its
`catalog.json` `tier` can be set to `stable`.

## 1. No secrets in artifacts

* `.env*`, kubeconfigs, `*.pem`, `*.key`, `kubeconfig*.yaml` MUST be in
  `.npmignore` / `MANIFEST.in` exclusions and in repo `.gitignore`.
* CI MUST run a secret scanner (e.g. trufflehog, gitleaks) on every PR;
  failures block merge.
  * **Current status:** the existing repo-wide `.github/workflows/security-scan.yml`
    is the source of truth for secret scanning. The shared-components CI
    deliberately does NOT duplicate it.
* Tests MUST use fixtures or `vi.mock`/`unittest.mock`; never real credentials.

## 2. License allowlist

Permitted production dependency licenses:

```
MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, MPL-2.0, CC0-1.0,
Unlicense, 0BSD, Python-2.0
```

Anything else (GPL family, AGPL, SSPL, BUSL, "see LICENSE", `UNLICENSED`)
requires a written exemption from legal and a note in the package README.

**Current status:** automated license-allowlist enforcement is on the
roadmap (COM-040 follow-up). Until it lands, owning teams enforce manually
during code review; the allowlist above is the source of truth.

## 3. Vulnerability scanning

* **Node**: workspace-wide `pnpm audit --prod` is run by the existing
  `.github/workflows/security-scan.yml`. Shared-components CI does NOT
  duplicate it (avoids gating PRs on app-level transitive vulns).
* **Python**: `pip-audit` (or equivalent) is run by the existing security
  workflow. Auto-updates via Dependabot / Renovate are enabled per package;
  PRs are triaged by the owning team within the SLA.

## 4. Provenance & signing (when published externally)

When a shared component starts being published to the org's private registry
(rather than consumed only via the workspace), it MUST also:

* Build via CI with OIDC, never with long-lived publish tokens (see COM-040).
* Generate provenance attestations (npm `--provenance`, Python `pypi-attestations`).
* Be signed (Sigstore / cosign) and verified at install time in CI.

## 5. Artifact retention

* Production registries retain all `stable` and `experimental` versions
  indefinitely.
* `deprecated` versions remain available for at least the announced sunset
  window plus 12 months.
* Pre-release / `0.x` snapshots: 90 days, then garbage-collected.

## 6. Secrets handling inside components

Shared components MUST NOT:

* Read `process.env`/`os.environ` directly outside of an explicit
  `loadConfig()` style entry point.
* Log secret values, even at DEBUG level. The shared logger redacts known
  secret keys (`password`, `token`, `apiKey`, `authorization`); contributors
  MUST extend the redaction list when adding new secret-bearing fields.
* Persist secrets to disk or any cache.

## "Production-ready" checklist

A package may set `catalog.json` `tier: "stable"` only when all of:

- [ ] Owned (`OWNERS.md` populated, on-call defined)
- [ ] CI green: lint, typecheck, tests, license scan, vuln scan, secret scan
- [ ] At least one consumer outside the originating app
- [ ] Public API documented (`README.md`)
- [ ] Migration guide template exists for future MAJOR bumps
- [ ] No HIGH/CRITICAL vulns open against runtime deps
