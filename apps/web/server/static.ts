import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createLogger } from "./logger";
import { clarityProjectId, withClarity } from "./clarity";

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

  // Serve assets with long-lived cache headers.
  // fallthrough:false so a MISSING hashed chunk returns a real 404 instead of
  // falling through to the SPA index.html (a 200-HTML response makes the browser
  // try to execute HTML as a JS module → "Failed to fetch dynamically imported
  // module" for any stale tab after a deploy). With a clean 404 the client can
  // detect the stale chunk and auto-reload.
  app.use("/assets", express.static(path.join(distPath, "assets"), {
    maxAge: "1y",
    immutable: true,
    fallthrough: false,
  }));

  // The page every route serves, read once. Clarity's loader is added here when
  // CLARITY_PROJECT_ID is set, so switching it on is a restart, not a rebuild.
  const indexHtml = withClarity(
    fs.readFileSync(path.join(distPath, "index.html"), "utf8"),
    process.env.CLARITY_PROJECT_ID,
  );
  logger.info("Clarity", { enabled: clarityProjectId(process.env.CLARITY_PROJECT_ID) !== null });

  // Serve remaining static files. `index: false` so "/" reaches the handler
  // below and gets the same page as every other route, not the raw file.
  app.use(express.static(distPath, { index: false }));

  // SPA fallback - any unmatched route returns index.html
  // Note: Express 5 requires named wildcard - "/*path" not "*"
  app.get("/{*path}", (req, res) => {
    // Never return index.html for a static-asset request: a stale/missing chunk
    // must 404 so the browser doesn't parse HTML as a module.
    if (/\.(js|mjs|css|map|json|wasm)$/i.test(req.path)) {
      res.status(404).end();
      return;
    }
    // Revalidate every time: the page names the current hashed bundle, and a
    // cached copy after a deploy points at chunks that no longer exist.
    res.set("Cache-Control", "no-cache");
    res.type("html").send(indexHtml);
  });
}
