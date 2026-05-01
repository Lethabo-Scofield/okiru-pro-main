# @okiru/data-layer

Centralized data-access abstractions for Okiru Pro: **Repository**, **Unit of
Work**, and **Data Access Factory**.

This package contains **interfaces and testing fakes only** — no database
drivers. Concrete providers live alongside the apps that use them
(e.g. `apps/api/src/data-layer/mongo`).

## What's inside

```
src/
  abstractions/
    repository.ts          IRepository<T, TId>
    unit-of-work.ts        IUnitOfWork
    data-access-factory.ts IDataAccessFactory
    provider-registry.ts   IProviderRegistry, InMemoryProviderRegistry
  testing/
    fake-unit-of-work.ts   FakeUnitOfWork
    fake-data-access-factory.ts FakeDataAccessFactory
```

## Usage in app code

Application code (route handlers, services) imports interfaces only:

```ts
import type { IDataAccessFactory, IUnitOfWork } from "@okiru/data-layer";
```

Tests import fakes from the `/testing` subpath:

```ts
import { FakeUnitOfWork, FakeDataAccessFactory } from "@okiru/data-layer/testing";
```

The composition root (e.g. `apps/api/index.ts`) is the **only** place that
imports a concrete provider class.

## Why no Postgres / Mongo packages?

The architecture doc that inspired this design assumed greenfield apps and
shipped six separate packages (TS+Py × core+postgres+mongo). Okiru is a single
monorepo using MongoDB + ArangoDB, so the concrete providers live next to the
code that uses them. The interfaces and testing helpers are shared here.

See `replit.md` and `attached_assets/ARCHITECTURE_*.md` for the full design.
