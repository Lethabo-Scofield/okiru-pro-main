import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { registerExcelExtractRoute } from "./excelExtractRoute";
import { registerApiProxy } from "./apiProxy";
import { registerSeoRoutes } from "./seo";
import { serveStatic } from "./static";
import { createServer } from "http";
import { connectDB } from "./db";
import { createLogger, requestContext } from "./logger";
import { connectArango } from "../../api/arango/connection.js";
import crypto from 'crypto';

const logger = createLogger("WebServer");

const app = express();
const httpServer = createServer(app);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "10mb" }));

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'web',
  });
});

const requestLogger = createLogger("HttpRequest");

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
      if (!isHealth && req.path.startsWith("/api")) {
        const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
        requestLogger[level === "error" ? "error" : level === "warn" ? "warn" : "info"](
          `${req.method} ${req.path} ${res.statusCode}`,
          { method: req.method, path: req.path, status: res.statusCode, durationMs, requestId: rid },
        );
      }
    });
    next();
  });
});

(async () => {
  logger.info("Initializing web server...");

  logger.debug("Connecting to database...");
  await connectDB();
  logger.info("Database connection step completed");

  logger.debug("Connecting to ArangoDB...");
  await connectArango();
  logger.info("ArangoDB connection step completed");

  logger.debug("Registering API proxy...");
  registerApiProxy(app);

  logger.debug("Registering SEO routes...");
  registerSeoRoutes(app);

  logger.info("Starting route registration...");
  try {
    await registerRoutes(httpServer, app);
    logger.info("Route registration completed successfully");
  } catch (err) {
    logger.error("Route registration failed", err);
    process.exit(1);
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    logger.error("Unhandled request error", err, { status });

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    logger.info("Serving static assets (production mode)");
    serveStatic(app);
  } else {
    logger.info("Setting up Vite dev server (development mode)");
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);

  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      logger.info(`Server listening on port ${port}`, { port, env: process.env.NODE_ENV || "development" });
    },
  );
})();