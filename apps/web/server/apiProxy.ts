/**
 * API Proxy Middleware
 *
 * Forwards specific routes from the web server (port 5000) to the
 * API server (port 5001) which has ArangoDB connectivity, extraction
 * pipeline, entity mappings, and scorecard evaluation.
 */

import http from "http";
import type { Express, Request, Response, NextFunction } from "express";
import { createLogger } from "./logger";

const logger = createLogger("ApiProxy");

const API_BASE = process.env.API_SERVER_URL || "http://127.0.0.1:3000";

const PROXIED_PREFIXES = [
  "/api/extract-entities-hybrid",
  "/api/entity-mappings",
  "/api/scorecard",
  "/api/accuracy",
  "/api/documents",
  "/api/extract-and-score",
  "/api/manifest",
  "/api/calculate",
  "/api/assessments",
  "/api/sectors",
  "/api/processor-sessions",
];

const PROXIED_TEMPLATE_PATTERNS = [
  /^\/api\/templates\/\d+\//,
  /^\/api\/templates\/ingest/,
  /^\/api\/templates\/ingest-all/,
  /^\/api\/templates\/store-files/,
  /^\/api\/templates\/files/,
];

function shouldProxy(path: string): boolean {
  for (const prefix of PROXIED_PREFIXES) {
    if (path.startsWith(prefix)) return true;
  }
  for (const pattern of PROXIED_TEMPLATE_PATTERNS) {
    if (pattern.test(path)) return true;
  }
  return false;
}

function proxyRequest(req: Request, res: Response): void {
  const url = new URL(req.originalUrl, API_BASE);

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") {
      headers[key] = value;
    } else if (Array.isArray(value)) {
      headers[key] = value.join(", ");
    }
  }
  delete headers["host"];
  headers["host"] = url.host;

  const isHybridExtract = req.path.startsWith("/api/extract-entities-hybrid");
  const options: http.RequestOptions = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    method: req.method,
    headers,
    timeout: isHybridExtract ? 600_000 : 120_000,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    logger.error("Proxy request failed", err, { method: req.method, url: req.originalUrl, target: API_BASE });
    if (!res.headersSent) {
      res.status(502).json({
        message: `API server unavailable at ${API_BASE}. Ensure the API server is running.`,
        detail: err.message,
      });
    }
  });

  proxyReq.on("timeout", () => {
    logger.warn("Proxy request timed out", { method: req.method, url: req.originalUrl });
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ message: "API server timed out" });
    }
  });

  const method = (req.method || "GET").toUpperCase();
  const ct = String(req.headers["content-type"] || "").toLowerCase();

  if (method === "GET" || method === "HEAD") {
    proxyReq.end();
    return;
  }

  // Multipart / binary uploads must stream — never send JSON.stringify(req.body)
  if (ct.includes("multipart/form-data") || ct.includes("application/octet-stream")) {
    req.pipe(proxyReq, { end: true });
    return;
  }

  if (req.readable && !req.complete) {
    req.pipe(proxyReq, { end: true });
    return;
  }

  const raw = (req as any).rawBody as Buffer | undefined;
  if (raw && Buffer.isBuffer(raw) && raw.length > 0) {
    proxyReq.write(raw);
    proxyReq.end();
    return;
  }

  const body = JSON.stringify(req.body);
  if (body && body !== "undefined" && body !== "{}") {
    proxyReq.write(body);
  }
  proxyReq.end();
}

export function registerApiProxy(app: Express): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (shouldProxy(req.path)) {
      logger.debug("Proxying request", { method: req.method, path: req.path, target: API_BASE });
      proxyRequest(req, res);
    } else {
      next();
    }
  });

  logger.info("API proxy registered", { target: API_BASE, prefixes: PROXIED_PREFIXES.length });
}
