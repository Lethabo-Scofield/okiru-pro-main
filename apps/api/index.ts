import dotenv from "dotenv";
dotenv.config();

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
import { ensureSearchIndex } from "./src/services/mongoSearch.js";
import crypto from 'crypto';

const logger = createLogger("ApiServer");

const app = express();
const httpServer = createServer(app);
const isProd = process.env.NODE_ENV === "production";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.set("trust proxy", 1);

// Security
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());

// CORS — strict allowlist. Unknown origins are rejected and logged so operators
// can see probe attempts. Same-origin / non-browser requests (no Origin header)
// are allowed through (cors() default behavior when callback is used).
const corsEnv = process.env.CORS_ORIGIN?.split(",").map(s => s.trim()).filter(Boolean);
const allowedOrigins = (corsEnv && corsEnv.length > 0)
  ? corsEnv
  : (isProd
    ? [
        "https://okiru.20.164.101.114.nip.io",
        "https://okiru.pro",
        "https://www.okiru.pro",
        "https://okiru-pro.com",
        "https://www.okiru-pro.com",
      ]
    : ["http://localhost:3000", "http://localhost:5000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5000", "http://127.0.0.1:5173"]);
const corsLogger = createLogger("Cors");
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true); // same-origin / curl / health checks
    if (allowedOrigins.includes(origin)) return callback(null, true);
    corsLogger.warn("Rejected request from disallowed origin", { origin, allowed: allowedOrigins });
    return callback(new Error("Origin not allowed"));
  },
  credentials: true,
}));

// Body parser - limit matches nginx proxy-body-size (100m) to prevent 413 errors
app.use(express.json({ limit: "100mb", verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false, limit: "100mb" }));


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
process.on("SIGTERM", () => { logger.info("Received SIGTERM — shutting down"); process.exit(0); });
process.on("SIGINT", () => { logger.info("Received SIGINT — shutting down"); process.exit(0); });

(async () => {
  logger.info("Initializing API server...");

  logger.debug("Connecting to MongoDB...");
  await connectDB();

  // Ensure MongoDB text search index exists for certificate search
  try {
    logger.debug("Ensuring MongoDB search indexes...");
    await ensureSearchIndex();
    logger.info("MongoDB search indexes ready");
  } catch (err) {
    logger.warn("Failed to ensure search indexes (non-fatal)", { error: err instanceof Error ? err.message : String(err) });
  }

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

  const port = parseInt(process.env.API_PORT || process.env.PORT || "3000", 10);
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