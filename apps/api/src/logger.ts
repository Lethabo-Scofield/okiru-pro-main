/**
 * @deprecated Re-export shim. Import from `@okiru/logger` directly in new code.
 *
 * This file exists so the 30+ existing imports across `apps/api/` keep working
 * after the logger was extracted to `packages/logger/` (COM-050 pilot extraction).
 * It will be removed in the next MAJOR of @okiru/api once consumers migrate.
 */
export { createLogger, requestContext } from "@okiru/logger";
export type { Logger, RequestContext } from "@okiru/logger";
