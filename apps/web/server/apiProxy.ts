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

/**
 * okiru-ai-parser (standalone deterministic document parser, :3200). The
 * browser uploads raw files (PDF/DOCX/XLSX/images) same-origin to
 * /api/parser/resolve-case-files etc.; we stream them through to the parser
 * service, whose own routes are also mounted at /api/parser — 1:1 mapping.
 */
const PARSER_BASE = process.env.PARSER_SERVICE_URL || "http://127.0.0.1:3200";

const PROXIED_PREFIXES = [
  "/api/extract-entities-hybrid",
  "/api/entity-mappings",
  "/api/scorecard",
  "/api/accuracy",
  "/api/documents",
  "/api/parser-documents",
  "/api/extract-and-score",
  "/api/manifest",
  "/api/calculate",
  "/api/assessments",
  "/api/sectors",
  "/api/processor-sessions",
  "/api/certificates",
  /** Toolkit Excel import lives on the API app (`apps/api`); without this, requests hit the SPA and return HTML. */
  "/api/import",
  /** Admin traffic analytics (GA4 + Search Console) live on the API app. */
  "/api/admin/analytics",
  /** okiru-ai-parser document parsing (streams multipart file uploads to :3200). */
  "/api/parser",
];

const PROXIED_TEMPLATE_PATTERNS = [
  /^\/api\/templates\/\d+\//,
  /^\/api\/templates\/ingest/,
  /^\/api\/templates\/ingest-all/,
  /^\/api\/templates\/store-files/,
  /^\/api\/templates\/files/,
  // Per-entity write routes live on apps/api. The ingress sends /api/clients/*
  // to web, and apps/web does NOT define these sub-routes, so without this
  // proxy every POST /api/clients/X/employees, /suppliers, etc. silently 404'd.
  // We deliberately exclude /api/clients/X/data, /bulk-import, and
  // /calculator-config — those belong to apps/web. The `(\/|$)` anchor stops
  // /api/clients/X/employees-something-else from matching by accident.
  /^\/api\/clients\/[^/]+\/(employees|suppliers|training-programs|shareholders|esd-contributions|sed-contributions|financial-years|scenarios|ownership|procurement)(\/|$)/,
];

function shouldProxy(path: string): boolean {
  // Ask Okiru is served by the web app in this branch. The singular
  // `/api/scorecard` prefix would otherwise also swallow plural `/scorecards`.
  if (/^\/api\/scorecards\/[^/]+\/advice\/chat$/.test(path)) return false;
  for (const prefix of PROXIED_PREFIXES) {
    if (path.startsWith(prefix)) return true;
  }
  for (const pattern of PROXIED_TEMPLATE_PATTERNS) {
    if (pattern.test(path)) return true;
  }
  return false;
}

/** Which upstream a path belongs to (parser service vs apps/api). */
export function proxyTargetFor(path: string): string {
  // Keep the standalone parser namespace distinct from API routes such as
  // /api/parser-documents. A loose prefix check sends library uploads to :3200.
  if (path === "/api/parser" || path.startsWith("/api/parser/")) return PARSER_BASE;
  return API_BASE;
}

function proxyRequest(req: Request, res: Response): void {
  const targetBase = proxyTargetFor(req.path);
  const url = new URL(req.originalUrl, targetBase);

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

  // Offline-demo identity forwarding. When Mongo is down the web + API servers
  // do NOT share a session store, so the demo/demo session created here is
  // invisible to proxied API routes. We forward the *server-verified* demo
  // identity as a trusted header so those routes can authorize it. Any
  // client-supplied version is stripped first so it can never be spoofed.
  // Disabled entirely in production so it can never become an auth bypass.
  delete headers["x-okiru-demo-user"];
  delete headers["x-okiru-demo-role"];
  const session = (req as any).session;
  if (
    process.env.NODE_ENV !== "production" &&
    session?.userId === "demo-offline-user"
  ) {
    headers["x-okiru-demo-user"] = "demo-offline-user";
    headers["x-okiru-demo-role"] = session.userData?.role || "admin";
  }

  const isHybridExtract = req.path.startsWith("/api/extract-entities-hybrid");
  const isParserExtraction = req.path.startsWith("/api/parser/resolve-case-files")
    || req.path.startsWith("/api/parser/resolve-file");
  // Pricing a big evidence pack inspects every file; give it the long budget too
  // so it can't be cut off at the 120s default mid-scan.
  const isParserQuote = req.path.startsWith("/api/parser/quote-files");
  const isLongRunning = isHybridExtract || isParserExtraction || isParserQuote || req.path.startsWith("/api/import");
  const options: http.RequestOptions = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    method: req.method,
    headers,
    timeout: isLongRunning ? 600_000 : 120_000,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    logger.error("Proxy request failed", err, { method: req.method, url: req.originalUrl, target: targetBase });
    if (!res.headersSent) {
      res.status(502).json({
        message: `Upstream unavailable at ${targetBase}. Ensure the service is running.`,
        detail: err.message,
      });
    }
  });

  proxyReq.on("timeout", () => {
    logger.warn("Proxy request timed out", { method: req.method, url: req.originalUrl });
    if (!res.headersSent) {
      res.status(504).json({ message: "API server timed out" });
    }
    proxyReq.destroy();
  });

  const method = (req.method || "GET").toUpperCase();
  const ct = String(req.headers["content-type"] || "").toLowerCase();

  if (method === "GET" || method === "HEAD") {
    proxyReq.end();
    return;
  }

  // Multipart / binary uploads must stream - never send JSON.stringify(req.body)
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
