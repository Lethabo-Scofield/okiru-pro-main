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
const allowedOrigins = process.env.CORS_ORIGIN?.split(",").map(s => s.trim()).filter(Boolean) || (isProd ? [] : ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"]);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false, credentials: true }));

// Body parser
app.use(express.json({ limit: "10mb", verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));


// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  let capturedJsonResponse: Record<string, unknown> | undefined;
  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      const duration = Date.now() - start;
      let logLine = `${req.method} ${req.path} ${res.statusCode} in ${duration}ms`;
      if (!isProd && capturedJsonResponse) logLine += ` :: ${JSON.stringify(capturedJsonResponse).slice(0, 200)}`;
      console.log(logLine);
    }
  });
  next();
});

// Error handling
process.on("uncaughtException", (err) => console.error("[FATAL] Uncaught Exception:", err));
process.on("unhandledRejection", (reason) => console.error("[FATAL] Unhandled Rejection:", reason));
process.on("SIGTERM", () => { console.log("[SIGNAL] SIGTERM"); process.exit(0); });
process.on("SIGINT", () => { console.log("[SIGNAL] SIGINT"); process.exit(0); });

(async () => {
  await connectDB();
  const arangoDB = await connectArango();
  if (arangoDB) {
    await ensureCollections();
  } else {
    console.warn("[Startup] Skipping ArangoDB collection setup — not connected.");
  }

  if (arangoDB) {
    seedOntology().then(summary => {
      if (summary.totalCriteria > 0) {
        console.log(`[Seed] Ontology: ${summary.totalSectors} sectors, ${summary.totalCriteria} criteria, ${summary.totalEntityFields} fields (${summary.durationMs}ms)`);
      }
    }).catch(err => {
      console.warn('[Seed] Ontology seeding failed (non-fatal):', err instanceof Error ? err.message : err);
    });
  } else {
    console.warn("[Startup] Skipping ontology seeding — ArangoDB not connected.");
  }

  await registerRoutes(httpServer, app);

  // Error middleware
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const status =
      (err && typeof err === "object" && "status" in err && typeof (err as { status: number }).status === "number")
        ? (err as { status: number }).status
        : (err && typeof err === "object" && "statusCode" in err && typeof (err as { statusCode: number }).statusCode === "number")
          ? (err as { statusCode: number }).statusCode
          : 500;
    const message = isProd ? "Internal Server Error" : (err instanceof Error ? err.message : "Internal Server Error");
    if (!isProd) console.error("Internal Server Error:", err);
    if (res.headersSent) return next(err);
    return res.status(status).json({ message });
  });

  const port = parseInt(process.env.API_PORT || process.env.PORT || "3000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port} [${isProd ? "production" : "development"}]`);
  });
})();