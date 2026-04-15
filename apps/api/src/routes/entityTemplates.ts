import { Router } from 'express';
import type { Request, Response } from 'express';
import { createLogger } from '../logger.js';
import { EntityTemplateModel } from '../../models.js';

const logger = createLogger("EntityTemplates");
import { getAllManifests } from '../../pipeline/extraction/entityManifest.js';
import { GraphRepository } from '../../arango/repositories/graphRepository.js';

const router = Router();
const graphRepo = new GraphRepository();

// GET /api/entity-templates — list all (MongoDB + new ontology)
router.get('/', async (_req: Request, res: Response) => {
  try {
    // Get old MongoDB templates
    const oldTemplates = await EntityTemplateModel.find({}).sort({ createdAt: -1 }).lean();

    let graphMeta: Record<string, { sourceFile: string; nodeCount: number; edgeCount: number; version: string }> = {};
    try {
      const graphs = await graphRepo.listFormulaGraphs();
      for (const g of graphs) {
        const key = `${g.sectorCode}_${g.scorecardType}`;
        if (!graphMeta[key] || (g.version || '') > (graphMeta[key].version || '')) {
          graphMeta[key] = {
            sourceFile: g.sourceFile || '',
            nodeCount: g.nodeCount || 0,
            edgeCount: g.edgeCount || 0,
            version: g.version || '',
          };
        }
      }
    } catch { }

    // Get new ontology manifests and convert to template format
    const manifests = await getAllManifests();
    const ontologyTemplates = manifests.map(m => {
      const meta = graphMeta[`${m.sectorCode}_${m.scorecardType}`];
      return {
      id: `ontology-${m.sectorCode}-${m.scorecardType}`,
      userId: null,
      name: `${m.sectorCode} ${m.scorecardType} Scorecard`,
      description: `Ontology-based template for ${m.sectorCode} ${m.scorecardType} with ${m.pillarPacks.reduce((sum: number, p: any) => sum + p.criteria.length, 0)} criteria across ${m.pillarPacks.length} pillars`,
      version: '2.0',
      sourceFile: meta?.sourceFile || '',
      nodeCount: meta?.nodeCount || 0,
      edgeCount: meta?.edgeCount || 0,
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
          formula: c.formula,
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
router.post('/', async (req: Request, res: Response) => {
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
router.put('/:id', async (req: Request, res: Response) => {
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
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await EntityTemplateModel.findOneAndDelete({ id: req.params.id });
    if (!deleted) return res.status(404).json({ message: 'Template not found' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete entity template' });
  }
});

export default router;
