import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { registerExcelExtractRoute } from "./excelExtractRoute";
import { registerApiProxy } from "./apiProxy";
import { serveStatic } from "./static";
import { createServer } from "http";
import { connectDB } from "./db";
import { createLogger } from "./logger";

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

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

const requestLogger = createLogger("HttpRequest");

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      requestLogger.debug(`${req.method} ${path} ${res.statusCode} in ${duration}ms`, {
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: duration,
      });
    }
  });

  next();
});

(async () => {
  logger.info("Initializing web server...");

  logger.debug("Connecting to database...");
  await connectDB();
  logger.info("Database connection step completed");

  logger.debug("Registering API proxy...");
  registerApiProxy(app);

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