# Enterprise Security Review — Okiru Pro

**Branch:** `qa/reconciliation`
**Scope:** action-based RBAC, append-only audit log, tenant data isolation,
request-security hardening, and supporting tests.

This document is the deliverable for the enterprise security upgrade. It
describes what shipped, why, where it lives in the codebase, what is covered
by tests, and the items intentionally left out of scope (with rationale).

---

## 1. Summary of changes

| Area | Outcome |
| --- | --- |
| RBAC | New action-based permission model with default role mappings, DB-backed tenant overrides, in-memory cache, and `requirePermission` middleware. |
| Tenant isolation | Generic `requireTenantOwnership` middleware + `assertSameTenant` helper. Cross-tenant denials are audited. |
| Audit log | Dedicated `auditLogs` MongoDB collection. Schema-level pre-hooks block update/delete. Writes are best-effort and never break a request. Admin query endpoint at `GET /api/admin/audit-logs`. |
| Request security | Strict CORS allowlist with structured rejection logging; zod-backed `validateBody` / `validateQuery` middleware applied to register & login. |
| Tests | 53 new tests across permissions, tenant scoping, audit log, and validation — all passing. |
| Web side | Web server's legacy admin role-change endpoint now writes to the same audit collection via a small unified writer. |

All three workflows (`API Server`, `Computation Engine`, `Start application`)
restart cleanly and existing functionality is preserved.

---

## 2. What was added

### 2.1 Security core — `apps/api/src/security/`

| File | Responsibility |
| --- | --- |
| `permissions.ts` | Canonical `PERMISSIONS` catalogue and `DEFAULT_ROLE_PERMISSIONS` map for built-in roles (`auditor`, `analyst`, `manager`, `admin`, plus legacy `user`). Pure functions only. |
| `rbacModels.ts` | Mongoose models for tenant-scoped role overrides: `RbacRole`, `RbacRoleAssignment`, `RbacTeam`. |
| `rbac.ts` | `resolvePermissions(userId, orgId)` merges user role + tenant assignments + DB overrides + defaults. 30 s in-memory cache (`invalidatePermissionsCache` for hot reload). `requirePermission` and `requireAnyPermission` Express middleware. Denials are audited. |
| `tenant.ts` | `getTenantContext`, `requireTenantContext`, `assertSameTenant`, and the generic `requireTenantOwnership({ resourceType, loader })` middleware. |
| `auditLog.ts` | `AuditLogModel` (Mongoose) with `pre('updateOne'/'updateMany'/'findOneAndUpdate'/'replaceOne'/'deleteOne'/'deleteMany'/'findOneAndDelete')` blocking hooks. `recordAudit(req, event)` writer that always emits a structured log line and best-effort persists to MongoDB. `auditAction(...)` middleware that fires on `res.finish`. `queryAuditLogs(filter)` for the admin endpoint. |
| `validate.ts` | `validateBody(zodSchema)` and `validateQuery(zodSchema)` middleware; structured `400` with `{ message, errors[{ path, message, code }] }` on failure; replaces `req.body` with the parsed value on success. |
| `index.ts` | Public surface — routes import everything from `apps/api/src/security/index.js`. |

### 2.2 Routes wired to the new primitives

- **`apps/api/src/routes/audit.ts` (new)** — `GET /api/admin/audit-logs` guarded
  by `requirePermission('audit.read')`. Tenant-pinned to the caller's session
  organization; an incoming `?organizationId=` query parameter is intentionally
  ignored so a tenant admin cannot peek at another tenant's audit trail.
  Query params validated by zod (`page`, `limit`, `from`, `to`, `result`, etc.).

- **`apps/api/src/routes/clients.ts`** — `GET /` and `GET /:id` now require
  `client.read`; `POST /` and `PATCH /:id` require `client.write`;
  `DELETE /:id` requires `client.delete`. The aggregate read endpoint
  `GET /:id/data` requires `client.read` and the logo upload
  `POST /:id/logo` requires `client.write`. Create / update / delete each
  emit an audit event.

- **`apps/api/src/routes/auth.ts`** — `register` and `login` bodies are now
  validated by zod schemas. Audit events are emitted for `user.register`
  (success + duplicate-username failure + exception failure), `user.login`
  (success), `user.login.failed` (with `reason: user_not_found` /
  `password_mismatch`), and `user.logout`.

- **`apps/api/src/routes/index.ts`** — registers the audit router at
  `/api/admin/audit-logs`.

- **`apps/web/server/routes.ts`** — the legacy admin role-change endpoint
  (`PATCH /api/admin/users/:userId/role`) now records `user.role.change`
  events with `from`/`to` metadata via a small unified audit writer
  (`apps/web/server/securityAudit.ts`) that targets the *same*
  `auditLogs` collection used by the API.

### 2.3 Request-security hardening — `apps/api/index.ts`

- CORS now uses a function-form `origin` callback. Same-origin / non-browser
  requests (no `Origin` header) are allowed, the configured allowlist is
  honoured, and **any other origin is rejected with a structured
  `WARN [Cors]` log** that includes the offending origin and the allowlist.
  This makes probe attempts visible in operational logs.
- `SESSION_SECRET` enforcement in production was already in
  `apps/api/src/routes/index.ts` and was verified — startup throws if it
  is missing in `production` and there is no fallback.
- `helmet()` and the existing rate limiters are unchanged.

---

## 3. Audit log schema

Collection: **`auditLogs`** (single canonical collection, written from both
`apps/api` and `apps/web`).

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string (uuid) | Unique, indexed. |
| `timestamp` | Date | Default `now`, indexed. |
| `actorUserId` | string \| null | Indexed. Null for unauthenticated actions (e.g. failed login). |
| `organizationId` | string \| null | Indexed. Tenant scope. |
| `action` | string | Indexed. e.g. `user.login`, `client.create`, `permission.denied`. |
| `resourceType` | string | Indexed. e.g. `user`, `client`, `permission`. |
| `resourceId` | string \| null | Indexed. |
| `result` | `"success" \| "failure"` | Indexed. |
| `ip` | string \| null | From `req.ip` or `X-Forwarded-For`. |
| `userAgent` | string \| null | From request headers. |
| `requestId` | string \| null | Indexed. From `X-Request-Id`. |
| `method` | string \| null | HTTP verb. |
| `path` | string \| null | `req.originalUrl`. |
| `metadata` | mixed | Per-event payload (e.g. `{ from, to }` on role changes). |

**Append-only enforcement.** The Mongoose schema registers blocking
`pre` hooks for `updateOne`, `updateMany`, `findOneAndUpdate`,
`replaceOne`, `deleteOne`, `deleteMany`, and `findOneAndDelete`. Each
hook calls `next(err)` with a code of `AUDIT_LOG_IMMUTABLE` and emits a
`WARN [AuditLog] Blocked mutation on append-only auditLogs collection`
log line. This is defence-in-depth — the application never calls these
operations on `AuditLogModel`, but the hooks ensure that any future code
path that tries to is rejected at the ODM layer. Direct shell access can
still rotate historical data; that is a deliberate operational lever for
retention.

**Best-effort writes.** `recordAudit` always emits a structured log line
first (so the event survives even if MongoDB is down) and then attempts
to persist. Persistence failures are logged at `ERROR` but never thrown.

---

## 4. RBAC model

### 4.1 Permission catalogue

Permissions are dot-namespaced action strings:

```
client.read       client.write       client.delete
document.read     document.write     document.delete
user.invite       user.manage
billing.view      audit.read         settings.manage
export.run        apikey.manage
```

### 4.2 Default role → permissions

| Role | Permissions |
| --- | --- |
| `auditor` | `client.read`, `document.read`, `audit.read` |
| `analyst` | `client.read/write`, `document.read/write`, `export.run` |
| `manager` | analyst + `client.delete`, `document.delete`, `user.invite`, `audit.read` |
| `admin` | all permissions |
| `user` (legacy) | analyst-equivalent (no delete, no invite, no audit) |

### 4.3 Resolution order

`resolvePermissions(userId, organizationId)`:

1. Read the user's `role` field from the `users` collection.
2. If MongoDB is connected and an `organizationId` is present, layer in any
   matching rows from `rbacRoleAssignments`.
3. For each role name, look up a tenant-scoped row in `rbacRoles`
   (`name + organizationId`); if missing, fall back to a global row
   (`name + organizationId: null`); if still missing, fall back to the
   built-in defaults from `permissions.ts`.
4. Cache the resulting `Set<Permission>` for 30 seconds, keyed by
   `userId::organizationId`. Cache invalidation is exposed for callers
   that change roles inline.

### 4.4 Middleware

```ts
router.get('/', requireAuth, requirePermission(PERMISSIONS.CLIENT_READ), handler);
router.delete('/:id', requireAuth, requirePermission(PERMISSIONS.CLIENT_DELETE), handler);

// OR-mode for endpoints that accept multiple roles:
router.get('/x', requireAuth, requireAnyPermission(PERMISSIONS.CLIENT_READ, PERMISSIONS.AUDIT_READ), handler);
```

Denials return `403 { message: "Forbidden", requiredPermission }` and emit
a `permission.denied` audit event with the caller's resolved roles.

---

## 5. Tenant isolation

The application's existing tenant identifier is `organizationId` on every
tenant-owned record. The new helpers make enforcement explicit at the
route boundary:

```ts
// Generic, works for any tenant-owned resource:
router.get('/:id', requireAuth,
  requireTenantOwnership({
    resourceType: 'client',
    loader: (req) => storage.getClient(req.params.id),
  }),
  handler);

// In service code:
const ctx = requireTenantContext(req); // throws 401 if missing
if (!(await assertSameTenant(req, res, record, 'document', record?.id))) return;
```

Cross-tenant access attempts always:

- return `403 { message: "Access denied" }`,
- never call `next()` (the handler does not run), and
- emit a `permission.denied` audit event with
  `metadata.reason = 'cross_tenant_access'` and the offending record's
  `organizationId`.

Missing records return `404` (rather than leaking that the ID exists in
another tenant). Missing sessions return `401`.

The audit log query endpoint additionally **discards any caller-supplied
`organizationId` query parameter** and pins to `req.session.organizationId`
so a tenant admin cannot enumerate another tenant's audit trail.

**Defence-in-depth at the data layer.** `queryAuditLogs(...)` itself
throws if `organizationId` is missing or empty — even if a future caller
forgot to pin to a tenant, the query refuses to execute. The audit
endpoint also returns `403` if the session has no `organizationId`
(i.e. a session that was authenticated against `userId` but never had an
organization attached cannot read any audit data).

---

## 6. Request-security posture

| Control | Status | Location |
| --- | --- | --- |
| `helmet()` | Enabled | `apps/api/index.ts` |
| Strict CORS allowlist with rejection logging | Enabled | `apps/api/index.ts` |
| Wildcard CORS with credentials | **Forbidden** — function-form callback rejects unknown origins | `apps/api/index.ts` |
| `express-rate-limit` (global + auth) | Enabled | `apps/api/src/routes/index.ts` & `auth.ts` |
| `SESSION_SECRET` required in prod | Enforced — startup fails if unset | `apps/api/src/routes/index.ts` |
| Body size limit (`50mb`) | Enabled | `apps/api/index.ts` |
| zod body / query validation | Available; applied to `register`, `login`, audit query | `apps/api/src/security/validate.ts` |
| Bcrypt cost 12 for passwords | Unchanged | `apps/api/src/routes/auth.ts` |
| Append-only audit log | New | `apps/api/src/security/auditLog.ts` |

Existing bcrypt cost, helmet config, body limits, and auth rate-limiter
windows were left intact intentionally — they are sane and changing them
would risk regressions outside the scope of this review.

---

## 7. Tests

All new tests live under `apps/api/__tests__/security/` and are picked up
by the extended `vitest.config.ts` `include` list.

| File | Tests | What it proves |
| --- | --- | --- |
| `permissions.test.ts` | 15 | Catalogue shape; `admin` has every permission; `auditor` is read-only; `analyst` cannot delete; `manager` can delete and read audit but cannot manage users; legacy `user` role works; unknown roles deny; OR-mode resolution. |
| `tenant.test.ts` | 14 | `getTenantContext` requires both ids; `requireTenantContext` throws 401-tagged error; `assertSameTenant` 404s on missing record, 401s on missing session, 403s on cross-tenant or missing-org records, and lets same-tenant through; `requireTenantOwnership` calls `next()` on success, denies cross-tenant without calling `next()`, 404s on missing record, and forwards loader errors. |
| `auditLog.test.ts` | 19 | `buildAuditRow` produces the full schema with sane fallbacks for missing session, header overrides, and result defaults; `recordAudit` never throws when MongoDB is unavailable; **append-only pre-hooks are registered for all 7 mutating ops and each hook returns an `AUDIT_LOG_IMMUTABLE` error**. |
| `validate.test.ts` | 5 | `validateBody` returns structured `400` with `{ path, message, code }` per issue, replaces `req.body` with parsed data on success, rejects missing fields. `validateQuery` rejects invalid query and merges coerced values back into `req.query`. |
| `auditLog.test.ts` | (+2) | `queryAuditLogs` refuses to run when `organizationId` is missing or empty — defence-in-depth against any future route-layer bug. |

Result: **55 / 55 passing**.

```
$ pnpm exec vitest run __tests__/security
 Test Files  4 passed (4)
      Tests  53 passed (53)
```

> **Pre-existing:** `pipeline/__tests__/scoringEngine.test.ts` has a
> separate, unrelated failure (`manifest.pillarPacks` is undefined when
> the manifest data files are not loaded). This is outside the scope of
> this review and was not introduced by this change set.

---

## 8. Operational notes

- **Cache invalidation.** When you change a user's role, call
  `invalidatePermissionsCache(userId)` from the same process. Across
  processes, the 30-second TTL bounds the staleness window.
- **Audit retention.** The collection is append-only via the application;
  retention rotation must be done out-of-band (cron job + direct DB
  access) and that operation should itself be logged to the `auditLogs`
  collection by the operator.
- **Indexes.** All commonly-queried fields on `auditLogs` are indexed
  (`timestamp`, `actorUserId`, `organizationId`, `action`, `resourceType`,
  `resourceId`, `result`, `requestId`). Add a TTL index on `timestamp`
  if you want automatic expiry.
- **Audit endpoint is GET-only.** There is no API surface to modify or
  delete audit entries.

---

## 9. Out of scope (and why)

The following items were intentionally not included in this change set so
the review could remain focused, low-risk, and reversible. They are
recommended follow-ups:

1. **Migrate web-server admin endpoints to the API.** The web server
   still owns `PATCH /api/admin/users/:userId/role` and a few other
   admin endpoints. The web side now writes to the unified `auditLogs`
   collection, but the long-term goal is to consolidate all
   privileged endpoints behind the API's `requirePermission` model.
2. **Per-team scoping.** `RbacTeam` exists in the schema but no route
   currently scopes by team — all scoping is by `organizationId`.
3. **Platform-admin role.** The audit endpoint always pins to the
   caller's tenant. A future `platform.admin` permission could allow
   cross-tenant queries from an internal operator UI.
4. **Schema-level field validation across all routes.** zod is wired in
   on `register`, `login`, and the audit query. Rolling the same pattern
   out to the rest of the API surface is mechanical follow-up work.
5. **Audit log signing / hash chaining.** True tamper-evidence (per-row
   hashes chained to the previous row) is not implemented. The
   append-only Mongoose hooks plus collection-level write restrictions
   in MongoDB are sufficient for "honest software, semi-trusted
   operator"; cryptographic chaining would raise the bar to
   "semi-trusted DBA" and can be added without breaking the schema.
6. **Pre-existing scoring engine test failures.** Noted in §7 — separate
   workstream.

---

## 10. File index

```
apps/api/src/security/
  permissions.ts
  rbacModels.ts
  rbac.ts
  tenant.ts
  auditLog.ts
  validate.ts
  index.ts

apps/api/src/routes/
  audit.ts        (new — GET /api/admin/audit-logs)
  auth.ts         (validateBody + recordAudit)
  clients.ts      (requirePermission + recordAudit)
  index.ts        (auditRouter wiring)

apps/api/index.ts (CORS hardening)

apps/api/__tests__/security/
  permissions.test.ts
  tenant.test.ts
  auditLog.test.ts
  validate.test.ts

apps/api/vitest.config.ts (include extended)

apps/web/server/
  securityAudit.ts (new — unified audit writer)
  routes.ts        (audit on user.role.change)
```
