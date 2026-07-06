/**
 * Shared session middleware configuration.
 *
 * Extracted so the session can be mounted BEFORE the API proxy (see
 * apps/web/server/index.ts). The proxy needs `req.session` to forward the
 * offline-demo identity to the API server; without mounting session first,
 * `req.session` is undefined at proxy time.
 */
import session from "express-session";
import MongoStore from "connect-mongo";
import mongoose from "mongoose";
import type { Express } from "express";
import { createLogger } from "./logger";

const logger = createLogger("SessionConfig");

function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

/** Mounts the session middleware exactly once per app. Safe to call repeatedly. */
export function configureSession(app: Express): void {
  if (app.locals.__sessionConfigured) return;
  app.locals.__sessionConfigured = true;

  const isProduction = process.env.NODE_ENV === "production";
  const isReplit = !!process.env.REPLIT_DEV_DOMAIN || !!process.env.REPL_SLUG;

  const sessionSecret = process.env.SESSION_SECRET;
  if (isProduction && !sessionSecret) {
    logger.error("SESSION_SECRET must be set in production");
    process.exit(1);
  }

  logger.debug("Configuring session middleware...");

  const sessionConfig: session.SessionOptions = {
    secret: sessionSecret || "okiru-entity-studio-dev-secret",
    resave: false,
    saveUninitialized: false,
    name: "okiru.web.sid",
    cookie: {
      httpOnly: true,
      secure: isProduction || isReplit,
      sameSite: isReplit ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  };

  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (mongoUri && isMongoConnected()) {
    sessionConfig.store = MongoStore.create({
      mongoUrl: mongoUri,
      collectionName: "sessions",
      touchAfter: 24 * 3600,
    });
  } else {
    logger.warn(
      "Using in-memory session store (MongoDB unavailable) - sessions will not persist across restarts",
    );
  }

  app.use(session(sessionConfig));
}
