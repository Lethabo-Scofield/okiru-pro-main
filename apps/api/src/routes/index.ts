import type { Express, NextFunction } from 'express';
import type { Request, Response } from 'express';
import type { Server } from 'http';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import { Router } from 'express';

// Import route modules
import healthRouter from './health.js';
import authRouter from './auth.js';
import profileRouter from './profile.js';
import clientsRouter from './clients.js';
import shareholdersRouter from './shareholders.js';
import employeesRouter from './employees.js';
import suppliersRouter from './suppliers.js';
import contributionsRouter from './contributions.js';
import scenariosRouter from './scenarios.js';
import financialYearsRouter from './financialYears.js';
import importRouter from './import.js';
import exportRouter from './export.js';
import accuracyRouter from './accuracy.js';
import scorecardRouter from './scorecard.js';
import templatesRouter from './templates.js';
import documentsRouter from './documents.js';
import extractAndScoreRouter from './extractAndScore.js';
import hybridExtractionRouter from './hybridExtraction.js';
import entityTemplatesRouter from './entityTemplates.js';
import entityMappingRouter from './entityMapping.js';
import scorecardBuilderRouter from './scorecardBuilder.js';

const isProd = process.env.NODE_ENV === "production";

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  message: { message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

declare module 'express-session' {
  interface SessionData {
    userId: string;
    organizationId: string;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const sessionSecret = process.env.SESSION_SECRET;
  if (isProd && !sessionSecret) {
    console.error("[SECURITY] SESSION_SECRET environment variable is required in production!");
    process.exit(1);
  }

  app.use(session({
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
      ttl: 7 * 24 * 60 * 60,
    }),
    secret: sessionSecret || 'okiru-dev-secret-local-only',
    resave: false,
    saveUninitialized: false,
    name: 'okiru.sid',
    cookie: {
      secure: isProd,
      httpOnly: true,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }));

  app.use('/api/', apiLimiter);

  // Health check and root
  app.use('/', healthRouter);

  // Auth routes
  app.use('/api/auth', authRouter);

  // Profile routes
  app.use('/api/profile', profileRouter);

  // Client routes
  app.use('/api/clients', clientsRouter);

  // Shareholder routes (nested under clients and standalone)
  app.use('/api/clients/:clientId/shareholders', shareholdersRouter);
  app.use('/api/shareholders', shareholdersRouter);

  // Employee routes (nested under clients and standalone)
  app.use('/api/clients/:clientId/employees', employeesRouter);
  app.use('/api/employees', employeesRouter);

  // Training program routes
  app.use('/api/clients/:clientId/training-programs', employeesRouter);
  app.use('/api/training-programs', employeesRouter);

  // Supplier routes (nested under clients and standalone)
  app.use('/api/clients/:clientId/suppliers', suppliersRouter);
  app.use('/api/suppliers', suppliersRouter);

  // Procurement routes
  app.use('/api/clients/:clientId/procurement', suppliersRouter);

  // ESD/SED contribution routes
  app.use('/api/clients/:clientId/esd-contributions', contributionsRouter);
  app.use('/api/clients/:clientId/sed-contributions', contributionsRouter);
  app.use('/api/esd-contributions', contributionsRouter);
  app.use('/api/sed-contributions', contributionsRouter);

  // Scenario routes
  app.use('/api/clients/:clientId/scenarios', scenariosRouter);
  app.use('/api/scenarios', scenariosRouter);

  // Financial year routes
  app.use('/api/clients/:clientId/financial-years', financialYearsRouter);
  app.use('/api/financial-years', financialYearsRouter);

  // Accuracy & ingestion routes
  app.use('/api/accuracy', accuracyRouter);

  // Scorecard & Computation Engine routes
  app.use('/api/scorecard', scorecardRouter);

  // Template ingestion & graph inspection routes
  app.use('/api/templates', templatesRouter);

  // Document upload & entity extraction routes
  app.use('/api/documents', documentsRouter);

  // Sector toolkit: extract from document texts → full B-BBEE scorecard
  app.use('/api', extractAndScoreRouter);

  // Hybrid extraction endpoint: file upload → BM25 + Semantic + LLM extraction
  app.use('/api', hybridExtractionRouter);

  // Entity templates (Dashboard CRUD) — stored in MongoDB
  app.use('/api/entity-templates', entityTemplatesRouter);

  // Entity-to-cell mappings (extracted entities → Excel cells)
  app.use('/api/entity-mappings', entityMappingRouter);

  // Scorecard builder: manifest + calculate + save (Phase 4)
  app.use('/api', scorecardBuilderRouter);

  // Import routes
  app.use('/api/import', importRouter);
  app.use('/api/import-logs', importRouter);

  // Export routes
  app.use('/api/export-log', exportRouter);
  app.use('/api/clients/:clientId/export-logs', exportRouter);

  // Error handling middleware
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

  return httpServer;
}
