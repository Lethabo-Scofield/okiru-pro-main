/**
 * API Proxy Middleware
 *
 * Forwards specific routes from the web server (port 5000) to the
 * API server (port 5001) which has ArangoDB connectivity, extraction
 * pipeline, entity mappings, and scorecard evaluation.
 */

import http from "http";
import type { Express, Request, Response, NextFunction } from "express";

const API_BASE = process.env.API_SERVER_URL || "http://127.0.0.1:5001";

const PROXIED_PREFIXES = [
  "/api/extract-entities-hybrid",
  "/api/entity-mappings",
  "/api/scorecard",
  "/api/entity-templates",
  "/api/accuracy",
  "/api/documents",
  "/api/extract-and-score",
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

  const options: http.RequestOptions = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    method: req.method,
    headers,
    timeout: 120_000,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error(`[ApiProxy] Error forwarding ${req.method} ${req.originalUrl}:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({
        message: `API server unavailable at ${API_BASE}. Ensure the API server is running.`,
        detail: err.message,
      });
    }
  });

  proxyReq.on("timeout", () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ message: "API server timed out" });
    }
  });

  if (req.readable && !req.complete) {
    req.pipe(proxyReq, { end: true });
  } else if ((req as any).rawBody) {
    proxyReq.write(req.rawBody as Buffer);
    proxyReq.end();
  } else {
    const body = JSON.stringify(req.body);
    if (body && body !== "undefined") {
      proxyReq.write(body);
    }
    proxyReq.end();
  }
}

export function registerApiProxy(app: Express): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (shouldProxy(req.path)) {
      proxyRequest(req, res);
    } else {
      next();
    }
  });

  console.log(`[ApiProxy] Proxying ArangoDB routes to ${API_BASE}`);
}
