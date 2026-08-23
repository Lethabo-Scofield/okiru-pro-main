import { Router } from 'express';
import type { Request, Response } from 'express';
import { createLogger } from '../logger.js';
import { EntityTemplateModel } from '../../models.js';

const logger = createLogger("EntityTemplates");
import { getAllManifests } from '../../pipeline/extraction/entityManifest.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireSuperAdmin } from '../middleware/requireRole.js';

const router = Router();

// Entity-template CRUD is a super-admin builder concern (the /builder and
// /processor pages are SuperAdminOnly). These routes had no server-side guard,
// so the create/update/delete were anonymously callable. Baseline: any logged-in
// user for the read; mutations require super-admin (applied per-route below).
router.use(requireAuth);

// GET /api/entity-templates — list all (MongoDB + new ontology)
router.get('/', async (_req: Request, res: Response) => {
  try {
    // Get old MongoDB templates
    const oldTemplates = await EntityTemplateModel.find({}).sort({ createdAt: -1 }).lean();

    // sourceFile/nodeCount/edgeCount used to be decorated from ArangoDB's
    // formula_graphs. That collection was empty in every environment, so the
    // lookup sat behind `catch { }` and these three fields always resolved to
    // their '' / 0 defaults. They keep those defaults, now openly.
    const manifests = await getAllManifests();
    const ontologyTemplates = manifests.map(m => {
      return {
      id: `ontology-${m.sectorCode}-${m.scorecardType}`,
      userId: null,
      name: `${m.sectorCode} ${m.scorecardType} Scorecard`,
      description: `Ontology-based template for ${m.sectorCode} ${m.scorecardType} with ${m.pillarPacks.reduce((sum: number, p: any) => sum + p.criteria.length, 0)} criteria across ${m.pillarPacks.length} pillars`,
      version: '2.0',
      sourceFile: '',
      nodeCount: 0,
      edgeCount: 0,
      // Flat entity list for backward compatibility
      entities: m.pillarPacks.flatMap(p => p.entities).map(e => ({
        label: e.id,
        definition: e.name,
        pillarCode: e.pillarCode,
        criterionCodes: e.criterionCodes,
        fieldType: e.fieldType,
        synonyms: e.extraction.aliases,
        positives: e.extraction.positiveExamples,
        negatives: e.extraction.negativeExamples,
        zones: e.extraction.zones,
        keywords: {
          must: e.extraction.mustHaveKeywords,
          nice: e.extraction.niceToHaveKeywords,
          neg: e.extraction.excludeKeywords,
        },
        pattern: '',
      })),
      // Hierarchical structure for the new UI
      pillarPacks: m.pillarPacks.map(p => ({
        pillarCode: p.pillarCode,
        pillarName: p.pillarName,
        maxPoints: p.maxPoints,
        hasSubMinimum: p.hasSubMinimum,
        subMinimumThreshold: p.subMinimumThreshold,
        criteriaCount: p.criteria.length,
        entityCount: p.entities.length,
        criteria: p.criteria.map(c => ({
          code: c.code,
          name: c.name,
          target: c.target,
          maxPoints: c.maxPoints,
          formulaId: c.formulaId,
          inputEntities: c.inputEntities,
        })),
        entities: p.entities.map(e => ({
          id: e.id,
          name: e.name,
          fieldType: e.fieldType,
          pillarCode: e.pillarCode,
          criterionCodes: e.criterionCodes,
          required: e.required,
        })),
      })),
      isOntology: true,
      sectorCode: m.sectorCode,
      scorecardType: m.scorecardType,
      rootContext: m.rootContext,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };});

    // Combine both, with ontology templates first
    return res.json([...ontologyTemplates, ...oldTemplates]);
  } catch (err) {
    logger.error('Error listing entity templates', err);
    return res.status(500).json({ message: 'Failed to list entity templates' });
  }
});

// POST /api/entity-templates — create
router.post('/', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { name, description, version, entities } = req.body as {
      name: string; description?: string; version?: string; entities?: unknown[];
    };
    if (!name) return res.status(400).json({ message: 'name is required' });
    const now = new Date().toISOString();
    const tmpl = await EntityTemplateModel.create({
      name, description: description ?? '', version: version ?? '1.0',
      entities: entities ?? [], createdAt: now, updatedAt: now,
    });
    return res.status(201).json(tmpl);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to create entity template' });
  }
});

// PUT /api/entity-templates/:id — update
router.put('/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { name, description, version, entities } = req.body as {
      name?: string; description?: string; version?: string; entities?: unknown[];
    };
    const updated = await EntityTemplateModel.findOneAndUpdate(
      { id: req.params.id },
      { ...(name && { name }), ...(description !== undefined && { description }),
        ...(version && { version }), ...(entities && { entities }),
        updatedAt: new Date().toISOString() },
      { new: true },
    ).lean();
    if (!updated) return res.status(404).json({ message: 'Template not found' });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update entity template' });
  }
});

// DELETE /api/entity-templates/:id — delete
router.delete('/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const deleted = await EntityTemplateModel.findOneAndDelete({ id: req.params.id });
    if (!deleted) return res.status(404).json({ message: 'Template not found' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete entity template' });
  }
});

export default router;
