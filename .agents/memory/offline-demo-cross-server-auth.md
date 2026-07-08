---
name: Offline demo cross-server auth
description: Why demo/demo works on web routes but 401s on proxied apps/api routes, and how it's bridged
---
The web (apps/web:5000) and API (apps/api:3000) servers share sessions ONLY via
MongoDB (same cookie name `okiru.web.sid`, same SESSION_SECRET, same MongoStore).
The offline `demo`/`demo` login is by design only allowed when Mongo is DOWN — but
then each server uses its own in-memory session store, so a demo session created
on the web server is invisible to any apps/api route reached through the proxy
(they 401). Any new admin/auth feature that lives on apps/api and is proxied hits
this wall for the demo account.

**Bridge:** the web proxy forwards the server-verified demo identity as
`x-okiru-demo-user` / `x-okiru-demo-role` headers (stripping any client-supplied
copy first). The API route trusts them ONLY when `NODE_ENV !== 'production'` AND
`!isMongoConnected()`. The production guard is essential: `!isMongoConnected()`
alone is an operational state, so a prod DB outage would otherwise turn the
header into an auth bypass for anyone hitting apps/api directly (skipping the
proxy's stripping). For the proxy to read `req.session`, session middleware must
be mounted BEFORE registerApiProxy in index.ts — the proxy previously ran before
session existed.

**Why:** demo is a fixed public credential, not a security boundary; prod always
has Mongo so this header path is disabled there.
**How to apply:** when adding a proxied apps/api route the demo user must reach,
authorize the forwarded demo headers the same way adminAnalytics.ts does.
