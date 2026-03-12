import dotenv from "dotenv";
dotenv.config();

import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import compression from "compression";
import cors from "cors";
import { registerRoutes } from "./routes.js";
import { createServer } from "http";
import { connectDB } from "./db.js";

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
const allowedOrigins = process.env.CORS_ORIGIN?.split(",").map(s => s.trim()) || ["http://localhost:3000"];
app.use(cors({ origin: isProd ? allowedOrigins : true, credentials: true }));

// Body parser
app.use(express.json({ limit: "10mb", verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));


// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  let capturedJsonResponse: Record<string, any> | undefined;
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
  await registerRoutes(httpServer, app);

  // Error middleware
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = isProd ? "Internal Server Error" : (err.message || "Internal Server Error");
    if (!isProd) console.error("Internal Server Error:", err);
    if (res.headersSent) return next(err);
    return res.status(status).json({ message });
  });

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port} [${isProd ? "production" : "development"}]`);
  });
})();