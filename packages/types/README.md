# @okiru/types

Shared TypeScript domain types used by every Okiru Node.js service.

This package contains **zero runtime code** — it only exports interfaces and
type aliases describing the wire shapes for users, organisations, clients,
and related insert payloads. Because it has no runtime, every published
type change is either:

- a strictly additive MINOR (a new optional field, a new type), or
- a MAJOR (renaming, removing, or narrowing an existing field).

See `docs/governance/versioning-policy.md` for the full SemVer rules.

## Install

In any Okiru workspace package:

```jsonc
// package.json
{
  "dependencies": {
    "@okiru/types": "workspace:*"
  }
}
```

## Usage

```ts
import type { User, Organization, Client } from "@okiru/types";

function welcome(user: User, org: Organization): string {
  return `Welcome, ${user.fullName ?? user.username} of ${org.name}.`;
}
```

## Public API (covered by SemVer)

| Symbol                 | Kind      |
| ---------------------- | --------- |
| `User`                 | interface |
| `InsertUser`           | interface |
| `Organization`         | interface |
| `InsertOrganization`   | interface |
| `Client`               | interface |
| `InsertClient`         | interface |
| ...                    | ...       |

The authoritative list lives in `src/index.ts`. Anything that file does not
re-export is internal and may change without a MAJOR bump.

## Cross-language contracts

The types in this package are the canonical Node-side representation of the
contracts listed in `catalog.json#contractsImplemented`. The Python services
must implement the same contracts (e.g. `okiru.user@1`) — see
`docs/governance/versioning-policy.md` § Cross-language contracts.
