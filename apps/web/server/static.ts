import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createLogger } from "./logger";

const logger = createLogger("Static");

export function serveStatic(app: Express) {
  // In the compiled CJS bundle __dirname is "." (the CWD), so we must use
  // process.cwd() and look for the known output location of the Vite build.
  const cwd = process.cwd();

  // All candidates in priority order
  const candidates = [
    path.join(cwd, "dist", "public"),   // /app/apps/web/dist/public  ← correct
    path.join(cwd, "public"),            // /app/apps/web/public
    path.resolve(__dirname, "public"),   // relative __dirname fallback
  ];

  let distPath: string | null = null;
  for (const p of candidates) {
    if (fs.existsSync(path.join(p, "index.html"))) {
      distPath = p;
      logger.info('Serving static assets', { path: distPath });
      break;
    }
  }

  if (!distPath) {
    throw new Error(
      `Cannot find built frontend. Tried:\n${candidates.join("\n")}`
    );
  }

  // Serve assets with long-lived cache headers
  app.use("/assets", express.static(path.join(distPath, "assets"), {
    maxAge: "1y",
    immutable: true,
  }));

  // Serve remaining static files
  app.use(express.static(distPath));

  // SPA fallback - any unmatched route returns index.html
  // Note: Express 5 requires named wildcard - "/*path" not "*"
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(distPath!, "index.html"));
  });
}
