import type { Express, Request, Response } from "express";
import { createLogger } from "../logger";
import {
  getCertificateBySlug,
  listCertificates,
  listCertificatesByLevel,
  listBlackOwnedCertificates,
} from "./data";
import {
  renderCertificateDetail,
  renderLevelPage,
  renderBlackOwnedPage,
  renderNotFound,
  renderSitemap,
  renderRobots,
} from "./templates";

const logger = createLogger("SeoRoutes");

function getProto(req: Request): string {
  const fwd = (req.headers["x-forwarded-proto"] as string) || "";
  if (fwd) return fwd.split(",")[0].trim();
  return (req.protocol as string) || "http";
}

function getHost(req: Request): string | undefined {
  return (req.headers["x-forwarded-host"] as string) || req.headers.host;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,200}$/;

const VERIFICATION_FILES: Record<string, string> = {
  "googlea288ba49cef187fc.html": "google-site-verification: googlea288ba49cef187fc.html",
};

export function registerSeoRoutes(app: Express): void {
  app.get("/robots.txt", (req: Request, res: Response) => {
    res.type("text/plain").send(renderRobots(getHost(req), getProto(req)));
  });

  for (const [fileName, content] of Object.entries(VERIFICATION_FILES)) {
    app.get(`/${fileName}`, (_req: Request, res: Response) => {
      res.type("text/html").send(content);
    });
  }

  app.get("/sitemap.xml", async (req: Request, res: Response) => {
    try {
      const certs = await listCertificates();
      const xml = renderSitemap(certs, getHost(req), getProto(req));
      res.set("Cache-Control", "public, max-age=3600");
      res.type("application/xml").send(xml);
    } catch (err) {
      logger.error("Failed to render sitemap", err as Error);
      res.status(500).type("text/plain").send("Failed to generate sitemap");
    }
  });

  app.get("/certificates/black-owned", async (req: Request, res: Response) => {
    try {
      const certs = await listBlackOwnedCertificates();
      res.set("Cache-Control", "public, max-age=600");
      res.type("html").send(renderBlackOwnedPage(certs, getHost(req), getProto(req)));
    } catch (err) {
      logger.error("Failed to render black-owned page", err as Error);
      res.status(500).type("html").send(renderNotFound(getHost(req), getProto(req), "Page unavailable"));
    }
  });

  app.get(/^\/certificates\/level-(\d+)$/, async (req: Request, res: Response) => {
    try {
      const level = Number.parseInt(req.params[0], 10);
      if (!Number.isFinite(level) || level < 1 || level > 8) {
        res.status(404).type("html").send(renderNotFound(getHost(req), getProto(req), "Level not found"));
        return;
      }
      const certs = await listCertificatesByLevel(level);
      res.set("Cache-Control", "public, max-age=600");
      res.type("html").send(renderLevelPage(level, certs, getHost(req), getProto(req)));
    } catch (err) {
      logger.error("Failed to render level page", err as Error);
      res.status(500).type("html").send(renderNotFound(getHost(req), getProto(req), "Page unavailable"));
    }
  });

  app.get("/certificates/:slug", async (req: Request, res: Response, next) => {
    const slug = (req.params.slug || "").toLowerCase();
    if (!SLUG_RE.test(slug)) {
      return next();
    }
    try {
      const cert = await getCertificateBySlug(slug);
      if (!cert) {
        res.status(404).type("html").send(renderNotFound(getHost(req), getProto(req)));
        return;
      }
      const all = await listCertificates();
      const related = all
        .filter((c) => c.slug !== cert.slug && c.bbbeeLevel === cert.bbbeeLevel)
        .slice(0, 4);
      res.set("Cache-Control", "public, max-age=300");
      res.type("html").send(renderCertificateDetail(cert, related, getHost(req), getProto(req)));
    } catch (err) {
      logger.error("Failed to render certificate detail", err as Error, { slug });
      res.status(500).type("html").send(renderNotFound(getHost(req), getProto(req), "Page unavailable"));
    }
  });

  logger.info("SEO routes registered", {
    routes: [
      "/robots.txt",
      "/sitemap.xml",
      "/certificates/black-owned",
      "/certificates/level-:n",
      "/certificates/:slug",
    ],
  });
}
