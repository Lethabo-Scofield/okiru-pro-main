---
name: Web server proxy prefix
description: How browser /api requests reach apps/api vs the web SPA
---
Browser `/api/*` requests hit the apps/web Express server first. Only paths in
`PROXIED_PREFIXES` (apps/web/server/apiProxy.ts) are forwarded to apps/api
(:3000); everything else falls through to the SPA and returns index.html (200).

**Why:** a new API route returning 200 HTML instead of JSON usually means the
prefix isn't proxied, or the web server wasn't restarted.
**How to apply:** add the prefix, then RESTART the "Start application" workflow —
vite HMR only reloads client code, not the Express server.
