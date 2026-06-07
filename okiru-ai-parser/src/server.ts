import dotenv from 'dotenv';
dotenv.config();

import compression from 'compression';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import parserRouter from './routes/parser.js';
import { createLogger } from './logger.js';

const logger = createLogger('OkiruPaser');
const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: false, limit: '100mb' }));

app.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'ok', name: 'okiru-ai-parser', version: '0.1.0' });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'okiru-ai-parser',
    neo4jConfigured: Boolean(process.env.NEO4J_URI && process.env.NEO4J_USERNAME && process.env.NEO4J_PASSWORD),
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
