# Data Layer Migration Playbook

This document is the recipe for migrating an entity from the legacy
`apps/api/storage.ts` facade to the centralized data layer
(`packages/data-layer` + `apps/api/src/data-layer`).

It was written from the **two reference migrations that exist in the codebase
today**: `User` (proof of concept) and `Client` (production route, mounted at
`/api/clients`). Follow it step-by-step for the next entity and you will end
up with the same structure.

## Why bother?

The legacy `storage.ts` facade has 50+ methods, mixes 12 entities, returns
raw Mongoose documents, and gives you no control over transaction boundaries.
The data layer pattern fixes all four:

- Each entity gets its **own repository interface** (small, focused).
- Repositories return **domain projections** (no `_id`, no `__v`, no Mongoose
  internals leaking into routes or the frontend).
- A single **Unit of Work** opens one Mongo session per request, so reads and
  writes across multiple repositories share a transaction boundary.
- Routes never import Mongoose models. They depend on interfaces, so unit
  tests can swap in a fake repository (see `data-layer.test.ts` §
  `IClientRepository contract`).

## The 6-step recipe

### Step 1 — Domain types & repository contract

Create `apps/api/src/data-layer/domain/<entity>.ts`. Define:

- A `<Entity>View` projection — the exact shape routes consume. **Do not**
  reuse the Mongoose document type. Spell out every field with primitive
  types.
- A `<Entity>CreateInput` and `<Entity>UpdateInput` for mutations.
- An `I<Entity>Repository` interface that extends
  `IRepository<<Entity>View, string>` (which gives you `findById`) and adds
  the access patterns your routes actually use — nothing speculative.

Reference: `apps/api/src/data-layer/domain/client.ts`.

### Step 2 — Mongo implementation

Create `apps/api/src/data-layer/mongo/mongo-<entity>-repository.ts`.

- Import the existing Mongoose model from `apps/api/models.ts`. Do not
  re-declare the schema.
- Constructor takes a `ClientSession | null` (the per-request session from
  the UoW). Pass it to every query via `.session(this.session)`.
- Map every Mongoose document through a private `toView(doc)` method that
  returns `<Entity>View`. **This is the bridge** between persistence and
  the domain — keep it pure.
- Implement every method on `I<Entity>Repository`. No extras, no unused
  methods.

Reference: `apps/api/src/data-layer/mongo/mongo-client-repository.ts`.

### Step 3 — Wire into the Unit of Work

Edit `apps/api/src/data-layer/mongo/mongo-unit-of-work.ts`:

1. Add `readonly <entity>: I<Entity>Repository;` to `IAppUnitOfWork`.
2. In the `MongoUnitOfWork` constructor, instantiate it with the same
   session as the others: `this.<entity> = new Mongo<Entity>Repository(session);`.

That's it — every per-request UoW now exposes the new repository, and it
shares the session (and therefore the transaction) with all the others.

Reference: `apps/api/src/data-layer/mongo/mongo-unit-of-work.ts`.

### Step 4 — Migrate the route

Edit `apps/api/src/routes/<entity>.ts`:

1. Convert the module from `export default Router` to
   `export function create<Entity>Router(factory: AppDataAccessFactory): Router`.
   This is the dependency injection point — the composition root passes the
   factory in.
2. Mount `attachUow(factory)` once at the top of the router. This opens a
   per-request UoW and attaches `req.uow`, `req.commitUow`, `req.rollbackUow`.
3. In each handler:
   - Read/write via `req.uow!.<entity>.<method>(...)`. **Never** import
     Mongoose models or `storage.ts` for entity-shaped operations.
   - On success, `await req.commitUow!()` and respond.
   - On error, call `next(err)` — `withUowErrorHandler` rolls back.
4. Mount `withUowErrorHandler()` at the **bottom** of the router so any
   uncaught error rolls back the UoW before the global error handler runs.
5. Operations that touch entities **not yet migrated** stay on
   `storage.ts`. Comment them clearly so the next migrator knows where to
   look.
6. Keep a default export that throws if mounted without the factory — this
   prevents anyone from accidentally re-introducing the legacy code path.

Reference: `apps/api/src/routes/clients.ts`.

### Step 5 — Wire it into the composition root

Edit `apps/api/src/routes/index.ts`:

```ts
import { create<Entity>Router } from './<entity>.js';

const dataLayer = app.locals.dataLayer as DataLayer | undefined;
if (dataLayer) {
  app.use('/api/<entity>', create<Entity>Router(dataLayer.factory));
} else {
  app.use('/api/<entity>', (_req, res) => res.status(503).json({ message: "Data layer unavailable" }));
}
```

The 503 fallback is intentional: if the data layer fails to initialise we
fail loudly instead of silently mounting a stale legacy router.

### Step 6 — Tests using the §9 fake pattern

Edit `apps/api/src/data-layer/__tests__/data-layer.test.ts`:

1. Add an `InMemory<Entity>Repository` class implementing
   `I<Entity>Repository`. Mirror the Mongo repo's surface 1:1.
2. Extend `FakeAppUoW` to accept (and default-construct) the new repository.
3. Add a `describe("I<Entity>Repository contract", ...)` block that tests
   **every method** on the interface against the in-memory fake. This is
   your contract suite — the Mongo implementation must satisfy the same
   tests if you ever decide to run them against a real Mongo instance.
4. Add at least one middleware-lifecycle test that proves a write rolls
   back when a downstream error fires (see "rolls back client writes when
   the route throws after a successful create").

Reference: tests in `apps/api/src/data-layer/__tests__/data-layer.test.ts`.

## What's migrated today

| Entity        | Domain types | Mongo repo | UoW exposed | Route migrated | Tests |
| ------------- | ------------ | ---------- | ----------- | -------------- | ----- |
| User          | yes          | yes        | yes         | demo only      | yes   |
| Client        | yes          | yes        | yes         | yes (`/api/clients`) | yes |

Client `DELETE` and `GET /:id/data` still call `storage.ts` for the cascade
across 12 collections and the cross-entity aggregation respectively. They
will move once the related entities have repositories of their own.

## What's still on `storage.ts`

Everything else: `Shareholder`, `OwnershipData`, `Employee`, `TrainingProgram`,
`Supplier`, `ProcurementData`, `EsdContribution`, `SedContribution`, `Scenario`,
`FinancialYear`, `ImportLog`, `ExportLog`. Migrate them in dependency order —
start with leaves (no foreign keys pointing in) and work toward `Client`.

## Common mistakes to avoid

- **Returning Mongoose documents from a repository.** Always go through
  `toView`. The whole point of the domain projection is to keep persistence
  details out of routes and the wire format.
- **Forgetting `.session(this.session)` on a query.** Without it the query
  bypasses the transaction.
- **Calling `req.uow.commit()` directly.** Use `req.commitUow!()` — it's
  idempotent and tracked by the middleware so double-finalisation doesn't
  blow up.
- **Mounting the new router without the factory.** The default export
  throws to prevent this; always import the named `create<Entity>Router`.
- **Skipping the contract tests.** They are tiny and they catch every
  signature drift between fake and real.
