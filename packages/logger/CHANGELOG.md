# Changelog — @okiru/logger

All notable changes to this package are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] — pilot extraction (COM-050)

- Promoted from duplicated copies in `apps/api/src/logger.ts` and
  `apps/web/server/logger.ts` into a single shared package.
- Public API: `createLogger`, `Logger`, `RequestContext`, `requestContext`.
- Wire format: `{ ts, level, module, msg, requestId?, userId?, ...meta, error? }`
  — JSON in production, pretty/colored in development.
