import { Router } from 'express';
import type { Request, Response } from 'express';
import { EntityTemplateModel } from '../../models.js';

const router = Router();

// GET /api/entity-templates — list all
router.get('/', async (_req: Request, res: Response) => {
  try {
    const templates = await EntityTemplateModel.find({}).sort({ createdAt: -1 }).lean();
    return res.json(templates);
  } catch (err) {
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
