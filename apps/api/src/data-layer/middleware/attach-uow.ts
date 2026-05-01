import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { AppDataAccessFactory, IAppUnitOfWork } from "../index.js";
import { createLogger } from "../../logger.js";

const logger = createLogger("AttachUoW");

/**
 * Internal symbol for tracking UoW finalisation state on the request. Avoids
 * relying on the UoW implementation to detect "already finalised" — keeps the
 * lifecycle invariant in the middleware where it belongs.
 */
const UOW_STATE = Symbol("uow.state");

type UowState = "open" | "committed" | "rolled-back";

interface RequestWithUow extends Request {
  [UOW_STATE]?: UowState;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * Per-request Unit of Work, attached by attachUow middleware.
       * Routes mounted under the middleware can rely on it being set.
       *
       * Prefer calling `req.commitUow()` / `req.rollbackUow()` instead of
       * `req.uow.commit()` directly so the middleware can track lifecycle and
       * prevent double-finalisation.
       */
      uow?: IAppUnitOfWork;

      /**
       * Commit the per-request Unit of Work. Idempotent: a second call after
       * commit/rollback is a no-op. Returns true if a commit actually ran.
       */
      commitUow?: () => Promise<boolean>;

      /**
       * Roll back the per-request Unit of Work. Idempotent: a second call
       * after commit/rollback is a no-op. Returns true if a rollback actually
       * ran.
       */
      rollbackUow?: () => Promise<boolean>;
    }
  }
}

/**
 * Express middleware that creates a fresh Unit of Work for each request and
 * attaches it to `req.uow`, plus `req.commitUow()` / `req.rollbackUow()`
 * helpers that prevent double-finalisation.
 *
 * Lifecycle guarantee: when the response finishes (or the connection closes)
 * with the UoW still open, the middleware automatically rolls it back. This
 * means early returns (validation 4xx, redirects, short-circuits) cannot leak
 * a session — routes only need to explicitly commit on the success path.
 *
 * Mount this only on routers that have been migrated to the data layer
 * pattern. Existing routes that use `storage` directly should not have a UoW
 * attached — they manage their own lifecycle.
 */
export function attachUow(factory: AppDataAccessFactory): RequestHandler {
  return async (req, res, next) => {
    let uow: IAppUnitOfWork;
    try {
      uow = await factory.createUnitOfWork();
    } catch (err) {
      logger.error("Failed to create Unit of Work", err as Error);
      return next(err);
    }

    const r = req as RequestWithUow;
    r.uow = uow;
    r[UOW_STATE] = "open";

    r.commitUow = async () => {
      if (r[UOW_STATE] !== "open") return false;
      // Leave state as "open" while committing so that if uow.commit() throws,
      // the error pipeline (withUowErrorHandler) and the response-finish safety
      // net can still roll back. Only flip to "committed" on success.
      await uow.commit();
      r[UOW_STATE] = "committed";
      return true;
    };

    r.rollbackUow = async () => {
      if (r[UOW_STATE] !== "open") return false;
      // Same reasoning: only flip state after a successful rollback so callers
      // can retry / the safety net can attempt finalisation if rollback throws.
      await uow.rollback();
      r[UOW_STATE] = "rolled-back";
      return true;
    };

    // Safety net: if the response ends and the UoW was never finalised
    // (early return, thrown error not caught by withUowErrorHandler, client
    // disconnect), roll back so we never leak a transaction/session.
    const finalise = () => {
      if (r[UOW_STATE] !== "open") return;
      r[UOW_STATE] = "rolled-back";
      uow.rollback().catch((rollbackErr) => {
        logger.warn("Auto-rollback on response finish failed", {
          error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
        });
      });
    };
    res.once("finish", finalise);
    res.once("close", finalise);

    next();
  };
}

/**
 * Error-handling middleware for routers that use attachUow. Rolls back the
 * UoW (if one is still open) before delegating to the normal Express error
 * pipeline. The response-finish safety net in attachUow also covers this, but
 * rolling back here is faster and lets the next handler see a clean state.
 */
export function withUowErrorHandler() {
  return async (
    err: unknown,
    req: Request,
    _res: Response,
    next: NextFunction,
  ) => {
    const r = req as RequestWithUow;
    if (r.uow && r[UOW_STATE] === "open") {
      r[UOW_STATE] = "rolled-back";
      try {
        await r.uow.rollback();
      } catch (rollbackErr) {
        logger.warn("Rollback failed during error handling", {
          error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
        });
      }
    }
    next(err);
  };
}
