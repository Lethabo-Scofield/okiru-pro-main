import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { createLogger } from '../logger.js';
import { requireAdminToken } from '../middleware/adminAuth.js';
import { fail, ok } from '../utils/apiResponse.js';
import { createNeo4jOntologyRepository, MissingNeo4jConfigError } from '../../graph/neo4j_client.js';
import type { OntologyRepository } from '../../graph/ontology_models.js';
import { InMemoryOntologyRepository } from '../../graph/ontology_queries.js';
import { DEFAULT_ONTOLOGY_MATRIX_PATH, loadOntologyFromWorkbook } from '../../graph/ontology_loader.js';
import { ParserService } from '../../parser/parser_service.js';

const logger = createLogger('ParserRoutes');
const router = Router();

function getParserRepository(): OntologyRepository {
  try {
    return createNeo4jOntologyRepository();
  } catch (err) {
    if (err instanceof MissingNeo4jConfigError && process.env.NODE_ENV !== 'production') {
      logger.warn('Neo4j parser graph is not configured; using in-memory parser ontology fallback');
      return new InMemoryOntologyRepository();
    }
    throw err;
  }
}

router.post('/resolve', async (req: Request, res: Response) => {
  const repository = getParserRepository();
  try {
    const service = new ParserService(repository);
    const result = await service.resolve(req.body);
    return res.status(result.status === 'failed' ? 422 : 200).json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json(fail(err.errors.map((e) => e.message).join('; '), 'INVALID_PARSER_INPUT'));
    }
    logger.error('Parser resolve failed', err as Error);
    return res.status(500).json(fail('Parser resolve failed', 'PARSER_RESOLVE_FAILED'));
  } finally {
    await repository.close?.();
  }
});

router.post('/load-ontology', requireAdminToken, async (req: Request, res: Response) => {
  let repository: OntologyRepository;
  try {
    repository = createNeo4jOntologyRepository();
  } catch (err) {
    if (err instanceof MissingNeo4jConfigError) {
      return res.status(503).json(fail(err.message, 'NEO4J_NOT_CONFIGURED'));
    }
    throw err;
  }

  try {
    const workbookPath = typeof req.body?.workbook_path === 'string' && req.body.workbook_path.trim()
      ? req.body.workbook_path.trim()
      : DEFAULT_ONTOLOGY_MATRIX_PATH;
    const result = await loadOntologyFromWorkbook(repository, workbookPath);
    return res.json(ok(result));
  } catch (err) {
    logger.error('Parser ontology load failed', err as Error);
    return res.status(500).json(fail((err as Error).message, 'ONTOLOGY_LOAD_FAILED'));
  } finally {
    await repository.close?.();
  }
});

export default router;
