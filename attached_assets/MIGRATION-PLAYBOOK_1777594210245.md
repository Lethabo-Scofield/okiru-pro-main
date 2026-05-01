# Migration Playbook — Moving to the Centralized Data Layer

This guide shows how to migrate an existing service that has raw SQL inside
route handlers into the Repository + Unit of Work pattern, one step at a time.

You do not need to rewrite everything at once. Each step is safe to ship
independently.

---

## The goal

**Before** — SQL lives inside the route handler. The handler knows about
sessions, models, and query syntax.

**After** — The handler calls a repository method. It has no idea which
database is running or how the query works.

---

## Part 1 — Express / TypeScript

### Starting point (before migration)

A typical Express route with raw SQL via `pg`:

```typescript
// routes/users.ts  ← BEFORE
import { pool } from '../db'

router.post('/users', async (req, res) => {
  const { name, email } = req.body
  const result = await pool.query(
    'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
    [name, email],
  )
  res.status(201).json(result.rows[0])
})

router.get('/users/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id])
  if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' })
  res.json(result.rows[0])
})
```

**Problems with this:**
- SQL is scattered across every route file
- No transaction — if two queries need to be atomic, there is no safety net
- Impossible to unit test without a real database
- Switching databases means hunting through every route

---

### Step 1 — Install the data layer packages

```bash
npm install @company/data-layer @company/data-layer-postgres
```

---

### Step 2 — Define the repository interface

Create `src/domain/user.ts`. This is the contract — it describes *what* you
can do with users, with no mention of *how*.

```typescript
// src/domain/user.ts
import type { IRepository } from '@company/data-layer'

export interface User {
  id: number
  name: string
  email: string
}

export interface IUserRepository extends IRepository<User, number> {
  findByEmail(email: string): Promise<User | null>
  save(data: { name: string; email: string }): Promise<User>
}
```

---

### Step 3 — Write the concrete repository

Create `src/repositories/postgres-user-repository.ts`. This is the only file
that contains SQL for users.

```typescript
// src/repositories/postgres-user-repository.ts
import type { Pool, PoolClient } from 'pg'
import type { IUserRepository, User } from '../domain/user'

export class PostgresUserRepository implements IUserRepository {
  constructor(private readonly client: PoolClient) {}

  async findById(id: number): Promise<User | null> {
    const result = await this.client.query(
      'SELECT id, name, email FROM users WHERE id = $1',
      [id],
    )
    return result.rows[0] ?? null
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.client.query(
      'SELECT id, name, email FROM users WHERE email = $1',
      [email],
    )
    return result.rows[0] ?? null
  }

  async save(data: { name: string; email: string }): Promise<User> {
    const result = await this.client.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email',
      [data.name, data.email],
    )
    return result.rows[0]
  }
}
```

---

### Step 4 — Wire the factory and middleware

In your app entry point (composition root), swap the raw pool for the factory.
Add the `attachUow` middleware so every request gets a fresh transaction.

```typescript
// src/app.ts
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import { PostgresDataAccessFactory, loadPostgresConfig } from '@company/data-layer-postgres'
import type { IDataAccessFactory, IUnitOfWork } from '@company/data-layer'
import type { IUserRepository } from './domain/user'

// ── Composition root — the only place that imports a concrete provider ──────
const factory = new PostgresDataAccessFactory(loadPostgresConfig())

// ── Middleware — one transaction per request ─────────────────────────────────
interface AppUoW extends IUnitOfWork {
  readonly users: IUserRepository
}

declare global {
  namespace Express {
    interface Request { uow: AppUoW }
  }
}

function attachUow(factory: IDataAccessFactory) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    req.uow = (await factory.createUnitOfWork()) as AppUoW
    next()
  }
}

const app = express()
app.use(express.json())
app.use(attachUow(factory))

// ── Error handler — rollback on any uncaught error ───────────────────────────
app.use(async (err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (req.uow) await req.uow.rollback()
  res.status(500).json({ error: err.message })
})

export default app
```

---

### Step 5 — Update the route (after migration)

The route now has zero SQL. It only calls repository methods.

```typescript
// routes/users.ts  ← AFTER
router.post('/users', async (req, res, next) => {
  try {
    const user = await req.uow.users.save(req.body)
    await req.uow.commit()
    res.status(201).json(user)
  } catch (err) {
    next(err) // error handler does rollback
  }
})

router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await req.uow.users.findById(Number(req.params.id))
    if (!user) {
      await req.uow.rollback()
      return res.status(404).json({ error: 'Not found' })
    }
    await req.uow.commit()
    res.json(user)
  } catch (err) {
    next(err)
  }
})
```

**What changed:**
- No `pool` import
- No SQL strings
- `req.uow.users` is the repository
- `req.uow.commit()` / `next(err)` control the transaction

---

### Step 6 — Add a unit test (no database needed)

```typescript
// tests/create-user.test.ts
import assert from 'node:assert/strict'
import { FakeUnitOfWork, FakeDataAccessFactory } from '@company/data-layer/testing'
import type { IUserRepository, User } from '../src/domain/user'

class FakeUserRepository implements IUserRepository {
  private store = new Map<number, User>()
  private nextId = 1

  async findById(id: number) { return this.store.get(id) ?? null }
  async findByEmail(email: string) {
    return [...this.store.values()].find(u => u.email === email) ?? null
  }
  async save(data: { name: string; email: string }) {
    const user = { id: this.nextId++, ...data }
    this.store.set(user.id, user)
    return user
  }
}

class FakeAppUoW extends FakeUnitOfWork {
  constructor(readonly users: IUserRepository) { super() }
}

// Test
const fakeRepo = new FakeUserRepository()
const fakeUow = new FakeAppUoW(fakeRepo)
const factory = new FakeDataAccessFactory(fakeUow)

// Call the service with the fake factory — no real DB
const uow = await factory.createUnitOfWork() as FakeAppUoW
const user = await uow.users.save({ name: 'Alice', email: 'alice@example.com' })
await uow.commit()

assert.equal(user.name, 'Alice')
assert.equal(fakeUow.committed, true)
```

---

## Part 2 — FastAPI / Python

### Starting point (before migration)

```python
# routes/users.py  ← BEFORE
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends
from db import get_session

@router.post("/users", status_code=201)
async def create_user(body: UserCreate, session: AsyncSession = Depends(get_session)):
    user = UserModel(name=body.name, email=body.email)
    session.add(user)
    await session.flush()
    await session.commit()
    return {"id": user.id, "name": user.name, "email": user.email}

@router.get("/users/{user_id}")
async def get_user(user_id: int, session: AsyncSession = Depends(get_session)):
    result = await session.get(UserModel, user_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return {"id": result.id, "name": result.name, "email": result.email}
```

---

### Step 1 — Install the data layer packages

```bash
pip install company-data-layer company-data-layer-postgres
```

---

### Step 2 — Define the repository interface

```python
# domain/user.py
from dataclasses import dataclass
from typing import Protocol

@dataclass
class User:
    id: int
    name: str
    email: str

class IUserRepository(Protocol):
    async def find_by_id(self, id: int) -> User | None: ...
    async def find_by_email(self, email: str) -> User | None: ...
    async def save(self, *, name: str, email: str) -> User: ...
```

---

### Step 3 — Write the concrete repository

```python
# repositories/postgres_user_repository.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from schema.models import UserModel
from domain.user import User, IUserRepository

class PostgresUserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def find_by_id(self, id: int) -> User | None:
        model = await self._session.get(UserModel, id)
        return User(id=model.id, name=model.name, email=model.email) if model else None

    async def find_by_email(self, email: str) -> User | None:
        result = await self._session.execute(
            select(UserModel).where(UserModel.email == email)
        )
        model = result.scalar_one_or_none()
        return User(id=model.id, name=model.name, email=model.email) if model else None

    async def save(self, *, name: str, email: str) -> User:
        model = UserModel(name=name, email=email)
        self._session.add(model)
        await self._session.flush()
        return User(id=model.id, name=model.name, email=model.email)
```

---

### Step 4 — Wire the factory and dependency

```python
# dependencies.py
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Request
from data_layer_postgres.postgres_data_access_factory import (
    PostgresDataAccessFactory, PostgresConfig,
)
import os

# ── Composition root ──────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    config = PostgresConfig(connection_string=os.environ["DATABASE_URL"])
    app.state.factory = PostgresDataAccessFactory(config)
    yield

# ── Dependency — one transaction per request ──────────────────────────────────
def get_factory(request: Request):
    return request.app.state.factory

async def get_uow(factory=Depends(get_factory)):
    uow = await factory.create_unit_of_work()
    try:
        yield uow
        await uow.commit()
    except Exception:
        await uow.rollback()
        raise
```

---

### Step 5 — Update the route (after migration)

```python
# routes/users.py  ← AFTER
from fastapi import APIRouter, Depends, HTTPException
from dependencies import get_uow

router = APIRouter()

@router.post("/users", status_code=201)
async def create_user(body: UserCreate, uow=Depends(get_uow)):
    user = await uow.users.save(name=body.name, email=body.email)
    return user

@router.get("/users/{user_id}")
async def get_user(user_id: int, uow=Depends(get_uow)):
    user = await uow.users.find_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Not found")
    return user
```

**What changed:**
- No `AsyncSession` import
- No `session.add()`, no `session.commit()` in the route
- `uow.users` is the repository
- commit/rollback is handled automatically by `get_uow`

---

## Migration checklist

Use this for each route you migrate:

```
[ ] Identify all direct DB calls in the route
[ ] Create or extend the IRepository interface with those operations
[ ] Move each query into a concrete Repository class
[ ] Wire the UoW via middleware (Express) or Depends (FastAPI)
[ ] Update the route to use the repository — remove all raw SQL
[ ] Verify commit() is called on success and rollback() on error
[ ] Write one unit test using FakeUnitOfWork — no DB required
[ ] Delete the old raw query code
```

---

## Common pitfalls

| Pitfall | What happens | Fix |
|---------|-------------|-----|
| Calling `commit()` inside the repository | Transaction closes early; later queries fail | Only the UoW calls `commit()` — never the repository |
| Importing a concrete provider inside a route | Couples the route to the database | Routes import only interfaces — factories live in the composition root |
| Creating the factory per request | New connection pool every request — connection exhaustion | Create the factory once at startup; store on `app.state` |
| Forgetting `rollback()` on error | Connection leak; transaction stays open | Always pair `commit()` with a `rollback()` in the error path |
| Mixing raw SQL and repositories in the same route | Two transaction scopes; inconsistent state | Pick one pattern per route — do not mix |
| Skipping unit tests after migration | You have no proof the new code behaves the same | Write one `FakeUnitOfWork` test per route before deleting the old code |
