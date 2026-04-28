# @okiru/logger

Structured, request-context-aware logger shared by all Okiru Node.js services.

* Pretty, color-coded output in development (`NODE_ENV !== "production"`).
* One-line JSON in production (no extra deps).
* Per-request context via `AsyncLocalStorage` — once you wrap a request in
  `requestContext.run({ requestId, userId, method, path }, ...)`, every log
  emitted inside that async tree automatically gets `rid=...`.
* Standard log levels: `DEBUG`, `INFO`, `WARN`, `ERROR`. Configurable via
  the `LOG_LEVEL` env var (default `DEBUG`).

## Install

In any Okiru workspace package:

```jsonc
// package.json
{
  "dependencies": {
    "@okiru/logger": "workspace:*"
  }
}
```

## Usage

```ts
import { createLogger, requestContext } from "@okiru/logger";

const logger = createLogger("MyModule");

logger.info("starting up");
logger.warn("slow path", { durationMs: 1234 });
logger.error("upstream failed", new Error("boom"), { upstream: "arango" });

// Per-request context (typically in an Express middleware):
app.use((req, _res, next) => {
  requestContext.run(
    { requestId: req.headers["x-request-id"] as string },
    () => next(),
  );
});
```

### Child loggers

```ts
const apiLog = createLogger("Api");
const userLog = apiLog.child({ tenant: "acme" });
userLog.info("hello"); // includes { tenant: "acme" }
```

## Public API

| Symbol           | Kind      | Notes                                          |
| ---------------- | --------- | ---------------------------------------------- |
| `createLogger`   | function  | Factory: `(module, defaults?) => Logger`.      |
| `Logger`         | interface | `debug`, `info`, `warn`, `error`, `child`.     |
| `RequestContext` | interface | Shape stored in `AsyncLocalStorage`.           |
| `requestContext` | constant  | The `AsyncLocalStorage<RequestContext>` itself.|

These symbols are covered by SemVer. Anything not listed above is internal
and may change without a MAJOR bump.
