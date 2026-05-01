import dotenv from "dotenv";
dotenv.config();

// Validate environment FIRST — fail fast on bad config before opening sockets,
// loading models, or printing anything sensitive.
import { env, isProd } from "./src/env.js";

import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import compression from "compression";
import cors from "cors";
import { registerRoutes } from "./routes.js";
import { createServer } from "http";
import { connectDB } from "./db.js";
import { connectArango, ensureCollections } from "./arango/index.js";
import { seedOntology } from "./pipeline/seedOntology.js";
import { createLogger, requestContext } from "./src/logger.js";
import { buildDataLayer } from "./src/data-layer/index.js";
import crypto from 'crypto';

const logger = createLogger("ApiServer");

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.set("trust proxy", 1);

// Security
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());

// CORS — origins come from CORS_ORIGIN (validated as required in production
// by env.ts). In development we ship a localhost allowlist so the workflow
// preview iframe and the Vite dev server work out of the box.
const corsEnv = env.CORS_ORIGIN?.split(",").map((s) => s.trim()).filter(Boolean);
const allowedOrigins =
  corsEnv && corsEnv.length > 0
    ? corsEnv
    : [
        "http://localhost:3000",
        "http://localhost:5000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5000",
        "http://127.0.0.1:5173",
      ];
app.use(cors({ origin: allowedOrigins, credentials: true }));

// Body parser - increased for large session payloads with full entity arrays
app.use(express.json({ limit: "50mb", verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false, limit: "50mb" }));


// Request context + logging middleware
const requestLog = createLogger("ApiRequest");
app.use((req, res, next) => {
  const rid = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  res.setHeader('X-Request-Id', rid);
  const userId = (req.session as any)?.userId;
  const ctx = { requestId: rid, userId, method: req.method, path: req.path };
  requestContext.run(ctx, () => {
    const start = Date.now();
    res.on("finish", () => {
      const durationMs = Date.now() - start;
      const isHealth = req.path === "/health" || req.path === "/api/health";
      const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      if (!isHealth) {
        requestLog[level === "error" ? "error" : level === "warn" ? "warn" : "info"](
          `${req.method} ${req.path} ${res.statusCode}`,
          { method: req.method, path: req.path, status: res.statusCode, durationMs, requestId: rid, ...(userId ? { userId } : {}) },
        );
      }
    });
    next();
  });
});

process.on("uncaughtException", (err) => logger.error("Uncaught Exception", err));
process.on("unhandledRejection", (reason) => logger.error("Unhandled Rejection", reason as Error));

/**
 * Graceful shutdown: stop accepting new connections, drain in-flight requests,
 * close MongoDB, then exit. Uses a hard-kill timer so the process cannot hang
 * indefinitely if a request handler is wedged.
 */
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal} — starting graceful shutdown`);

  // Hard-kill safety net (prevents hung requests from blocking pod replacement)
  const hardKillMs = 10_000;
  const hardKill = setTimeout(() => {
    logger.error(`Graceful shutdown timed out after ${hardKillMs}ms — forcing exit`);
    process.exit(1);
  }, hardKillMs);
  hardKill.unref();

  try {
    // 1. Stop accepting new connections; existing ones drain naturally.
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    logger.info("HTTP server closed");

    // 2. Close mongoose connection (best-effort, non-fatal if already closed).
    try {
      const mongoose = (await import("mongoose")).default;
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
        logger.info("Mongoose connection closed");
      }
    } catch (err) {
      logger.warn("Mongoose close failed (non-fatal)", { error: err instanceof Error ? err.message : String(err) });
    }

    logger.info("Shutdown complete");
    process.exit(0);
  } catch (err) {
    logger.error("Error during shutdown", err as Error);
    process.exit(1);
  }
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

(async () => {
  logger.info("Initializing API server...");

  logger.debug("Connecting to MongoDB...");
  await connectDB();

  logger.debug("Connecting to ArangoDB...");
  const arangoDB = await connectArango();
  if (arangoDB) {
    logger.info("ArangoDB connected — ensuring collections...");
    await ensureCollections();
  } else {
    logger.warn("Skipping ArangoDB collection setup — not connected");
  }

  if (arangoDB) {
    seedOntology().then(summary => {
      if (summary.totalCriteria > 0) {
        logger.info("Ontology seeded", {
          sectors: summary.totalSectors,
          criteria: summary.totalCriteria,
          fields: summary.totalEntityFields,
          durationMs: summary.durationMs,
        });
      }
    }).catch(err => {
      logger.warn("Ontology seeding failed (non-fatal)", { error: err instanceof Error ? err.message : String(err) });
    });
  } else {
    logger.warn("Skipping ontology seeding — ArangoDB not connected");
  }

  logger.debug("Building data layer...");
  const dataLayer = buildDataLayer();
  app.locals.dataLayer = dataLayer;
  logger.info("Data layer built", { provider: dataLayer.provider });

  logger.debug("Registering routes...");
  await registerRoutes(httpServer, app);
  logger.info("Routes registered");

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const status =
      (err && typeof err === "object" && "status" in err && typeof (err as { status: number }).status === "number")
        ? (err as { status: number }).status
        : (err && typeof err === "object" && "statusCode" in err && typeof (err as { statusCode: number }).statusCode === "number")
          ? (err as { statusCode: number }).statusCode
          : 500;
    const message = isProd ? "Internal Server Error" : (err instanceof Error ? err.message : "Internal Server Error");
    if (!isProd) logger.error("Unhandled request error", err as Error, { status });
    if (res.headersSent) return next(err);
    return res.status(status).json({ message });
  });

  const port = env.API_PORT ?? env.PORT ?? 3000;
  httpServer.listen(port, "0.0.0.0", () => {
    logger.info(`API server listening`, { port, env: isProd ? "production" : "development" });

    setImmediate(async () => {
      try {
        const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
        if (!connStr) return;
        if (process.env.CERT_EXTRACTION_ON_STARTUP === 'false') {
          logger.info("Startup certificate extraction disabled via CERT_EXTRACTION_ON_STARTUP=false");
          return;
        }
        const { BlobServiceClient } = await import("@azure/storage-blob");
        const { processAllCertificates } = await import("./src/services/certificateExtractor.js");
        const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
        logger.info("Starting background certificate extraction...");
        const result = await processAllCertificates(blobServiceClient, false, (done, total) => {
          if (done % 25 === 0 || done === total) {
            logger.info("Certificate extraction progress", { done, total });
          }
        });
        logger.info("Background certificate extraction complete", result);
      } catch (err) {
        logger.warn("Background certificate extraction failed (non-fatal)", { error: err instanceof Error ? err.message : String(err) });
      }
    });
  });
})();