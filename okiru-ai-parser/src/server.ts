import dotenv from 'dotenv';
dotenv.config();

import { randomUUID } from 'node:crypto';
import compression from 'compression';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import parserRouter from './routes/parser.js';
import { createLogger } from './logger.js';

const logger = createLogger('OkiruPaser');
const app = express();

export const PARSER_VERSION = '0.1.0';
export const ONTOLOGY_VERSION = 'v1';

const JSON_BODY_LIMIT = process.env.PARSER_JSON_BODY_LIMIT || '25mb';
const corsOrigin = process.env.PARSER_ALLOWED_ORIGINS
  ? process.env.PARSER_ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : true;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: false, limit: JSON_BODY_LIMIT }));

// Attach a request id to every request for traceable logs and responses.
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.header('x-request-id') || randomUUID()).slice(0, 128);
  (req as Request & { requestId: string }).requestId = requestId;
  res.setHeader('x-request-id', requestId);
  res.setHeader('x-parser-version', PARSER_VERSION);
  next();
});

function neo4jConfigured(): boolean {
  return Boolean(process.env.NEO4J_URI && process.env.NEO4J_USERNAME && process.env.NEO4J_PASSWORD);
}

app.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'ok', name: 'okiru-ai-parser', version: PARSER_VERSION });
});

// Liveness: the process is up and can serve requests.
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'okiru-ai-parser',
    version: PARSER_VERSION,
    neo4jConfigured: neo4jConfigured(),
  });
});

// Readiness: distinguishes alive vs ready, and reports dependency posture. The
// service is ready even without Neo4j because it falls back to the bundled
// in-memory ontology; the flags make the active source observable.
app.get('/ready', (_req: Request, res: Response) => {
  const hasNeo4j = neo4jConfigured();
  res.json({
    status: 'ready',
    alive: true,
    ready: true,
    timestamp: new Date().toISOString(),
    service: 'okiru-ai-parser',
    version: PARSER_VERSION,
    ontology_version: ONTOLOGY_VERSION,
    dependencies: {
      neo4j_configured: hasNeo4j,
      ontology_source: hasNeo4j ? 'neo4j' : 'in_memory_fallback',
      fallback_ontology_active: !hasNeo4j,
      file_extractors_available: true,
    },
  });
});

app.use('/api/parser', parserRouter);

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  logger.error('Unhandled request error', err as Error);
  return res.status(500).json({ message: 'Internal Server Error' });
});

const port = Number(process.env.PORT || 3200);
app.listen(port, '0.0.0.0', () => {
  logger.info('okiru-ai-parser listening', { port });
});
