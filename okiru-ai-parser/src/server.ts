import dotenv from 'dotenv';
dotenv.config();

import { randomUUID } from 'node:crypto';
import compression from 'compression';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import parserRouter from './routes/parser.js';
import { createLogger } from './logger.js';
import { parserHelmetOptions, resolveCorsOrigin } from './securityConfig.js';
import { setQuoteStore } from './services/quoteStore.js';
import { createRedisQuoteStore } from './services/redisQuoteStore.js';

const logger = createLogger('OkiruPaser');
const app = express();

export const PARSER_VERSION = '0.1.0';
export const ONTOLOGY_VERSION = 'v1';

const JSON_BODY_LIMIT = process.env.PARSER_JSON_BODY_LIMIT || '25mb';

const corsOrigin = resolveCorsOrigin();

app.use(helmet(parserHelmetOptions()));
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

/**
 * Fail-fast validation of required configuration at startup. Surfaces
 * misconfiguration immediately instead of at first request.
 */
function validateStartupConfig(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const errors: string[] = [];

  const port = Number(process.env.PORT || 3200);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    errors.push(`PORT must be a valid port number (got "${process.env.PORT}")`);
  }

  if (isProd) {
    if (!process.env.PARSER_ADMIN_TOKEN) {
      logger.warn('PARSER_ADMIN_TOKEN is not set — the /load-ontology admin route will refuse requests (503)');
    }
    // Say which way the browser gate is facing. A silent CORS posture is how
    // this service ended up reflecting every origin in production.
    if (corsOrigin === false) {
      logger.info('CORS is closed to browsers — /api/parser is reached same-origin through the web proxy');
    } else if (Array.isArray(corsOrigin)) {
      logger.info('CORS is open to an explicit allowlist', { origins: corsOrigin });
    } else {
      logger.warn('CORS is reflecting every Origin in production — set PARSER_ALLOWED_ORIGINS or unset it to close');
    }
    if (process.env.PARSER_REQUIRE_NEO4J === 'true'
      && !(process.env.NEO4J_URI && process.env.NEO4J_USERNAME && process.env.NEO4J_PASSWORD)) {
      errors.push('PARSER_REQUIRE_NEO4J=true but NEO4J_URI/USERNAME/PASSWORD are not all set');
    }
    if (!(process.env.NEO4J_URI && process.env.NEO4J_USERNAME && process.env.NEO4J_PASSWORD)) {
      logger.warn('Neo4j is not configured in production — running on the bundled in-memory ontology');
    }
  }

  if (errors.length > 0) {
    logger.error('Invalid startup configuration', new Error(errors.join('; ')));
    process.exit(1);
  }
}

validateStartupConfig();

/**
 * Quote state must be shared before money can be involved.
 *
 * The gate is only sound if every replica sees the same quote: the PayFast ITN
 * can land on a different pod than the one that issued the quote. So if payment
 * is required in production, REDIS_URL is mandatory — we refuse to boot rather
 * than take payments we might not be able to honour. With the gate off there is
 * no money at stake, so the in-memory store is fine.
 */
async function initialiseQuoteStore(): Promise<void> {
  const paymentRequired = process.env.PARSER_REQUIRE_PAYMENT !== 'false';
  const isProd = process.env.NODE_ENV === 'production';

  try {
    const store = await createRedisQuoteStore();
    if (store) {
      setQuoteStore(store);
      return;
    }
  } catch (err) {
    if (isProd && paymentRequired) throw err;
    logger.warn('Redis quote store unavailable — falling back to in-memory store', {
      reason: (err as Error).message,
    });
    return;
  }

  if (isProd && paymentRequired) {
    throw new Error(
      'REDIS_URL is required when PARSER_REQUIRE_PAYMENT is on: quote state must be shared '
      + 'across replicas or a payment webhook can land on a pod that cannot see the quote.',
    );
  }
  logger.warn('No REDIS_URL — quote store is in-memory (single process only)');
}

const port = Number(process.env.PORT || 3200);

initialiseQuoteStore()
  .then(() => {
    app.listen(port, '0.0.0.0', () => {
      logger.info('okiru-ai-parser listening', { port, version: PARSER_VERSION, env: process.env.NODE_ENV || 'development' });
    });
  })
  .catch((err) => {
    // Never leave the process alive-but-not-listening: that reads as healthy to
    // the platform while serving nothing.
    logger.error('Parser failed to start', err as Error);
    process.exit(1);
  });
