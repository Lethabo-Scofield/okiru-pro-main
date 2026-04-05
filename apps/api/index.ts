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
import { createLogger } from "./src/logger.js";

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

// CORS
const corsEnv = process.env.CORS_ORIGIN?.split(",").map(s => s.trim()).filter(Boolean);
const allowedOrigins = (corsEnv && corsEnv.length > 0)
  ? corsEnv
  : (isProd
    ? ["https://okiru-pro.com", "https://www.okiru-pro.com"]
    : ["http://localhost:3000", "http://localhost:5000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5000", "http://127.0.0.1:5173"]);
app.use(cors({ origin: allowedOrigins, credentials: true }));

// Body parser
app.use(express.json({ limit: "10mb", verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));


// Logging middleware
const requestLog = createLogger("ApiRequest");
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api") || req.path === "/health") {
      const duration = Date.now() - start;
      requestLog.debug(`${req.method} ${req.path} ${res.statusCode} in ${duration}ms`, {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: duration,
      });
    }
  });
  next();
});

process.on("uncaughtException", (err) => logger.error("Uncaught Exception", err));
process.on("unhandledRejection", (reason) => logger.error("Unhandled Rejection", reason as Error));
process.on("SIGTERM", () => { logger.info("Received SIGTERM — shutting down"); process.exit(0); });
process.on("SIGINT", () => { logger.info("Received SIGINT — shutting down"); process.exit(0); });

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
  });
})();