import { Router, type Request, type Response } from 'express';
import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import { createLogger } from '../logger.js';
import { requireAdminToken } from '../middleware/adminAuth.js';
import { fail, ok } from '../utils/apiResponse.js';
import { rawExtractionInputFromUpload, SUPPORTED_UPLOAD_MIME_TYPES } from '../services/fileExtraction.js';
import { createNeo4jOntologyRepository, MissingNeo4jConfigError } from '../../graph/neo4j_client.js';
import type { OntologyRepository } from '../../graph/ontology_models.js';
import { InMemoryOntologyRepository } from '../../graph/ontology_queries.js';
import { buildOntologyRecordsFromWorkbook, DEFAULT_ONTOLOGY_MATRIX_PATH, loadOntologyFromWorkbook } from '../../graph/ontology_loader.js';
import { CaseParserService } from '../../parser/case_parser_service.js';
import { getRequiredDocumentGroups, SECTOR_OPTIONS } from '../../parser/sector_documents.js';
import { ParserService } from '../../parser/parser_service.js';

const logger = createLogger('ParserRoutes');
const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (SUPPORTED_UPLOAD_MIME_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type ${file.mimetype}`));
  },
});

let fallbackRepositoryPromise: Promise<OntologyRepository> | null = null;

function resolveOntologyMatrixPath(): string {
  return process.env.ONTOLOGY_MATRIX_PATH || path.resolve(process.cwd(), DEFAULT_ONTOLOGY_MATRIX_PATH);
}

async function getFallbackRepository(): Promise<OntologyRepository> {
  fallbackRepositoryPromise ??= (async () => {
    const repository = new InMemoryOntologyRepository();
    try {
      const records = buildOntologyRecordsFromWorkbook(resolveOntologyMatrixPath());
      await repository.upsertOntology(records);
      logger.info('Loaded local parser ontology matrix', {
        records: records.length,
        workbookPath: resolveOntologyMatrixPath(),
      });
    } catch (err) {
      logger.warn('Local parser ontology matrix unavailable; using built-in fallback only', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return repository;
  })();
  return fallbackRepositoryPromise;
}

async function getParserRepository(): Promise<OntologyRepository> {
  let neo4jRepository: ReturnType<typeof createNeo4jOntologyRepository>;
  try {
    neo4jRepository = createNeo4jOntologyRepository();
  } catch (err) {
    if (err instanceof MissingNeo4jConfigError) {
      // Not configured at all: fallback in non-production, hard error in prod.
      if (process.env.NODE_ENV !== 'production') {
        logger.warn('Neo4j parser graph is not configured; using in-memory parser ontology fallback');
        return getFallbackRepository();
      }
      throw err;
    }
    throw err;
  }

  // Configured — but verify it is actually reachable. A configured-but-down
  // Neo4j must not take the whole service down: fall back to the bundled
  // in-memory ontology (non-production) rather than 500 on every request.
  try {
    await neo4jRepository.ping();
    return neo4jRepository;
  } catch (err) {
    await neo4jRepository.close?.().catch(() => undefined);
    if (process.env.NODE_ENV === 'production' && process.env.PARSER_REQUIRE_NEO4J === 'true') {
      throw err;
    }
    logger.warn('Neo4j parser graph is unreachable; using in-memory parser ontology fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
    return getFallbackRepository();
  }
}

/**
 * The preset "documents expected to be uploaded" catalog — the ontology's
 * document types (name, description, pillar, required) plus the case-level
 * required groups the case parser enforces. Lets the UI render the upload
 * checklist from the same source of truth that classification/validation use.
 */
router.get('/document-types', async (req: Request, res: Response) => {
  const repository = await getParserRepository();
  try {
    const types = await repository.listDocumentTypes();
    const required_groups = getRequiredDocumentGroups({
      sector: typeof req.query.sector === 'string' ? req.query.sector : undefined,
      size: typeof req.query.size === 'string' ? req.query.size : undefined,
      subSector: typeof req.query.subSector === 'string' ? req.query.subSector : undefined,
    });
    return res.json({
      document_types: types,
      required_groups,
      sector_options: SECTOR_OPTIONS,
    });
  } catch (err) {
    logger.error('Listing parser document types failed', err as Error);
    return res.status(500).json(fail('Could not list document types', 'DOCUMENT_TYPES_FAILED'));
  } finally {
    await repository.close?.();
  }
});

router.post('/resolve', async (req: Request, res: Response) => {
  const repository = await getParserRepository();
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

router.post('/resolve-file', upload.single('file'), async (req: Request, res: Response) => {
  const repository = await getParserRepository();
  try {
    if (!req.file) {
      return res.status(400).json(fail('Upload a file using multipart field name "file"', 'FILE_REQUIRED'));
    }

    const rawInput = await rawExtractionInputFromUpload(req.file);
    const service = new ParserService(repository);
    const result = await service.resolve(rawInput);
    return res.status(result.status === 'failed' ? 422 : 200).json(result);
  } catch (err) {
    logger.error('Parser file resolve failed', err as Error);
    return res.status(400).json(fail((err as Error).message, 'FILE_PARSE_FAILED'));
  } finally {
    await repository.close?.();
  }
});

router.post('/resolve-case', async (req: Request, res: Response) => {
  const repository = await getParserRepository();
  try {
    const documents = Array.isArray(req.body?.documents) ? req.body.documents : null;
    if (!documents) {
      return res.status(400).json(fail('Body must include documents[]', 'DOCUMENTS_REQUIRED'));
    }

    const service = new CaseParserService(repository);
    const caseId = typeof req.body?.case_id === 'string' ? req.body.case_id : undefined;
    const result = await service.resolveCase(documents, caseId);
    return res.status(result.status === 'failed' ? 422 : 200).json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json(fail(err.errors.map((e) => e.message).join('; '), 'INVALID_CASE_INPUT'));
    }
    logger.error('Parser case resolve failed', err as Error);
    return res.status(500).json(fail('Parser case resolve failed', 'PARSER_CASE_RESOLVE_FAILED'));
  } finally {
    await repository.close?.();
  }
});

router.post('/resolve-case-files', upload.array('files', 25), async (req: Request, res: Response) => {
  const repository = await getParserRepository();
  try {
    const files = Array.isArray(req.files) ? req.files as Express.Multer.File[] : [];
    if (files.length === 0) {
      return res.status(400).json(fail('Upload files using multipart field name "files"', 'FILES_REQUIRED'));
    }

    const rawInputs = await Promise.all(files.map((file) => rawExtractionInputFromUpload(file)));
    const service = new CaseParserService(repository);
    const caseId = typeof req.body?.case_id === 'string' ? req.body.case_id : undefined;
    const result = await service.resolveCase(rawInputs, caseId);
    return res.status(result.status === 'failed' ? 422 : 200).json(result);
  } catch (err) {
    logger.error('Parser case file resolve failed', err as Error);
    return res.status(400).json(fail((err as Error).message, 'CASE_FILE_PARSE_FAILED'));
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
