/**
 * @deprecated Re-export shim. Import from `@okiru/logger` directly in new code.
 *
 * This file exists so the 13 existing imports across `apps/web/server/` keep
 * working after the logger was extracted to `packages/logger/` (COM-050 pilot
 * extraction). It will be removed in the next MAJOR of `rest-express` once
 * consumers migrate.
 */
export { createLogger, requestContext } from "@okiru/logger";
export type { Logger, RequestContext } from "@okiru/logger";
