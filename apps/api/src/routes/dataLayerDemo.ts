/**
 * Proof-of-concept router for the centralized data layer.
 *
 * Demonstrates the Repository + Unit of Work + Data Access Factory pattern
 * using the existing User collection. None of the existing /api/auth, /api/clients,
 * etc. routes are affected — they keep using storage.ts as before. Migrate
 * other routers one at a time using this one as the template.
 *
 * Endpoints (all require an authenticated session):
 *   GET /api/data-layer-demo/users/by-username/:username
 *     — Looks up a user via the new MongoUserRepository.
 *   GET /api/data-layer-demo/users/:id
 *     — Looks up a user by id via the new MongoUserRepository.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import mongoose from "mongoose";
import type { AppDataAccessFactory } from "../data-layer/index.js";
import {
  attachUow,
  withUowErrorHandler,
} from "../data-layer/middleware/attach-uow.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { createLogger } from "../logger.js";

const logger = createLogger("DataLayerDemo");

/**
 * Short-circuit with a clear 503 when MongoDB is not connected, instead of
 * letting Mongoose buffer the operation and time out 10s later. Only relevant
 * for the default 'mongo' provider.
 */
function requireMongoConnected(_req: Request, res: Response, next: NextFunction) {
  // mongoose.connection.readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      message: "MongoDB is not connected. Set MONGO_URI to enable this demo route.",
      provider: "mongo",
    });
  }
  return next();
}

export function createDataLayerDemoRouter(factory: AppDataAccessFactory): Router {
  const router = Router();

  // Authentication is mandatory: these routes return user-profile fields
  // (email, fullName, role) that must not be exposed unauthenticated.
  router.use(requireAuth);
  router.use(requireMongoConnected);
  router.use(attachUow(factory));

  router.get(
    "/users/by-username/:username",
    async (req: Request, res: Response, next: NextFunction) => {
      const username = req.params.username?.trim();
      if (!username) {
        // Early return — UoW lifecycle is auto-finalised by attachUow's
        // response-finish safety net, so this cannot leak a session.
        return res.status(400).json({ message: "username is required" });
      }
      try {
        const user = await req.uow!.users.findByUsername(username);
        await req.commitUow!();
        if (!user) {
          return res.status(404).json({ message: "Not found" });
        }
        return res.json(user);
      } catch (err) {
        logger.error("findByUsername failed", err as Error);
        return next(err);
      }
    },
  );

  router.get(
    "/users/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      const id = req.params.id?.trim();
      if (!id) {
        return res.status(400).json({ message: "id is required" });
      }
      try {
        const user = await req.uow!.users.findById(id);
        await req.commitUow!();
        if (!user) {
          return res.status(404).json({ message: "Not found" });
        }
        return res.json(user);
      } catch (err) {
        logger.error("findById failed", err as Error);
        return next(err);
      }
    },
  );

  router.use(withUowErrorHandler());

  return router;
}
