import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/requireRole.js';
import { SupplierDirectoryImportJobModel, SupplierDirectorySourceModel } from '../../models.js';
import { fetchTreasuryReleases, importDirectoryRecords, mapTreasuryRelease, NATIONAL_TREASURY_SOURCE, NATIONAL_TREASURY_URL } from '../services/supplierDirectory.js';

const router = Router();

router.get('/sources', requireAuth, async (_req: Request, res: Response) => {
  const sources = await SupplierDirectorySourceModel.find({}).sort({ name: 1 }).lean();
  return res.json({ sources });
});

// Manual import is intentionally admin-only. The API accepts records prepared
// from an authorised download; it never fetches arbitrary URLs supplied by a user.
router.post('/imports', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const source = String(req.body?.source || '').trim();
  if (source !== NATIONAL_TREASURY_SOURCE) return res.status(400).json({ message: 'Unsupported supplier directory source' });
  try {
    let records = req.body?.records;
    if (req.body?.fetch === true) {
      const releases = await fetchTreasuryReleases({ dateFrom: String(req.body.dateFrom || ''), dateTo: String(req.body.dateTo || ''), page: Number(req.body.page || 1) });
      records = releases.flatMap(mapTreasuryRelease);
    }
    if (!Array.isArray(records) || records.length > 10000) return res.status(400).json({ message: 'records must be an array of at most 10000 items, or set fetch=true with a valid Treasury date window' });
    const result = await importDirectoryRecords({ source, sourceUrl: NATIONAL_TREASURY_URL, records });
    return res.status(201).json(result);
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Supplier directory import failed' });
  }
});

router.get('/imports/:jobId', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const job = await SupplierDirectoryImportJobModel.findOne({ jobId: req.params.jobId }).lean();
  if (!job) return res.status(404).json({ message: 'Import job not found' });
  return res.json({ job });
});

export default router;
