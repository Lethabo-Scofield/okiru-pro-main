import { SupplierDirectoryImportJobModel, SupplierDirectoryModel } from '../../models.js';

export const NATIONAL_TREASURY_SOURCE = 'national_treasury_etenders';
export const NATIONAL_TREASURY_URL = 'https://data.etenders.gov.za/';

export type DirectoryRecordInput = {
  registeredName?: unknown;
  tradingName?: unknown;
  registrationNumber?: unknown;
  vatNumber?: unknown;
  province?: unknown;
  city?: unknown;
  physicalLocation?: unknown;
  serviceCoverage?: unknown;
  industry?: unknown;
  categories?: unknown;
  productsServices?: unknown;
  description?: unknown;
  website?: unknown;
  beeLevel?: unknown;
  beeRecognitionPercentage?: unknown;
  blackOwnership?: unknown;
  womenOwnership?: unknown;
  sourceRecordId?: unknown;
  sourceUrl?: unknown;
  lastSourceUpdatedAt?: unknown;
  procurementHistory?: unknown;
};

export type DirectoryEvidence = {
  source: string;
  sourceUrl: string;
  sourceRecordId?: string;
  observedAt: string;
  claim: string;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).slice(0, 100);
  return text(value) ? [text(value)] : [];
}
export function normalizeSupplierName(value: unknown): string {
  return text(value).toLowerCase().replace(/\b(pty|ltd|limited|inc|cc|close corporation)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function numberOrNull(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.replace('%', '').trim()) : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeDirectoryRecord(input: DirectoryRecordInput, source: string, sourceUrl: string) {
  const registeredName = text(input.registeredName) || text(input.tradingName);
  if (!registeredName) return null;
  const sourceRecordId = text(input.sourceRecordId);
  const now = new Date();
  return {
    registeredName,
    normalizedName: normalizeSupplierName(registeredName),
    tradingName: text(input.tradingName),
    registrationNumber: text(input.registrationNumber),
    vatNumber: text(input.vatNumber),
    province: text(input.province),
    city: text(input.city),
    physicalLocation: text(input.physicalLocation),
    serviceCoverage: list(input.serviceCoverage),
    industry: text(input.industry),
    categories: list(input.categories),
    productsServices: list(input.productsServices),
    description: text(input.description),
    website: text(input.website),
    beeLevel: numberOrNull(input.beeLevel),
    beeRecognitionPercentage: numberOrNull(input.beeRecognitionPercentage),
    blackOwnership: numberOrNull(input.blackOwnership),
    womenOwnership: numberOrNull(input.womenOwnership),
    source,
    sourceUrl,
    sourceRecordId,
    sourceEvidence: [{ source, sourceUrl, sourceRecordId, observedAt: now.toISOString(), claim: 'Imported public procurement data; not proof of current capacity or B-BBEE compliance.' }],
    lastSourceUpdatedAt: input.lastSourceUpdatedAt ? new Date(String(input.lastSourceUpdatedAt)) : null,
    lastImportedAt: now,
    freshnessStatus: 'unknown',
    verificationStatus: 'imported',
    procurementHistory: Array.isArray(input.procurementHistory) ? input.procurementHistory.slice(0, 100) : [],
  };
}

export type TreasuryOcdsRelease = {
  ocid?: string;
  id?: string;
  date?: string;
  tender?: { title?: string; procurementMethodDetails?: string };
  buyer?: { name?: string; address?: { region?: string; locality?: string } };
  parties?: Array<{ id?: string; name?: string; identifier?: { legalName?: string }; address?: { region?: string; locality?: string }; contactPoint?: { url?: string } }>;
  awards?: Array<{ id?: string; title?: string; date?: string; value?: unknown; suppliers?: Array<{ name?: string; id?: string; Name?: string; SupplierID?: string }> }>;
};

export async function fetchTreasuryReleases(args: { dateFrom: string; dateTo: string; page?: number }): Promise<TreasuryOcdsRelease[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(args.dateTo)) throw new Error('Treasury import dates must use YYYY-MM-DD');
  const from = Date.parse(`${args.dateFrom}T00:00:00Z`);
  const to = Date.parse(`${args.dateTo}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 31 * 86400000) throw new Error('Treasury import window must be valid and no longer than 31 days');
  const url = new URL('https://ocds-api.etenders.gov.za/api/OCDSReleases');
  url.searchParams.set('dateFrom', args.dateFrom);
  url.searchParams.set('dateTo', args.dateTo);
  url.searchParams.set('PageNumber', String(Math.max(1, Math.floor(args.page ?? 1))));
  let response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { accept: 'application/json', 'user-agent': 'Okiru Supplier Directory/1.0' } });
  let payload: any;
  if (!response.ok) {
    // The portal's documented release endpoint can intermittently return 500.
    // Its official monthly JSON archive is the supported fallback and carries
    // the same OCDS releases plus the publication metadata.
    const monthFile = `${args.dateFrom.slice(8, 10)}${args.dateFrom.slice(5, 7)}${args.dateFrom.slice(0, 4)}.json`;
    const archiveUrl = `https://data.etenders.gov.za/Home/DownloadFile/?fileName=${monthFile}`;
    response = await fetch(archiveUrl, { signal: AbortSignal.timeout(120_000), headers: { accept: 'application/json', 'user-agent': 'Okiru Supplier Directory/1.0' } });
    if (!response.ok) throw new Error(`National Treasury API and monthly archive failed: HTTP ${response.status}`);
    payload = await response.json() as any;
  } else {
    payload = await response.json() as any;
  }
  if (Array.isArray(payload)) return payload as TreasuryOcdsRelease[];
  if (Array.isArray(payload.releases)) return payload.releases as TreasuryOcdsRelease[];
  if (Array.isArray(payload.Releases)) return payload.Releases as TreasuryOcdsRelease[];
  if (Array.isArray(payload.data)) return payload.data as TreasuryOcdsRelease[];
  return [];
}

/** Maps documented OCDS releases without claiming that awards are current capacity. */
export function mapTreasuryRelease(release: TreasuryOcdsRelease): DirectoryRecordInput[] {
  const output: DirectoryRecordInput[] = [];
  for (const award of release.awards ?? []) {
    for (const supplier of award.suppliers ?? []) {
      const name = text(supplier.name) || text(supplier.Name);
      if (!name) continue;
      const party = (release.parties ?? []).find((candidate) => candidate.id === text(supplier.id) || candidate.id === text(supplier.SupplierID) || candidate.name === name || candidate.identifier?.legalName === name);
      output.push({
        registeredName: name,
        sourceRecordId: [release.ocid, award.id, supplier.id || supplier.SupplierID].filter(Boolean).join(':'),
        sourceUrl: NATIONAL_TREASURY_URL,
        province: party?.address?.region || release.buyer?.address?.region,
        city: party?.address?.locality || release.buyer?.address?.locality,
        industry: release.tender?.procurementMethodDetails,
        productsServices: release.tender?.title ? [release.tender.title] : [],
        website: party?.contactPoint?.url,
        procurementHistory: [{ awardId: award.id ?? null, awardDate: award.date ?? release.date ?? null, buyer: release.buyer?.name ?? null, description: release.tender?.title ?? null, value: award.value ?? null }],
        lastSourceUpdatedAt: release.date,
      });
    }
  }
  return output;
}

export async function importDirectoryRecords(args: { source: string; sourceUrl: string; records: DirectoryRecordInput[] }) {
  const job = await SupplierDirectoryImportJobModel.create({ source: args.source, status: 'running', startedAt: new Date() });
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors: Array<{ index: number; reason: string }> = [];
  try {
    for (const [index, input] of args.records.entries()) {
      const normalized = normalizeDirectoryRecord(input, args.source, args.sourceUrl);
      if (!normalized) { skipped++; errors.push({ index, reason: 'missing supplier name' }); continue; }
      const identity = normalized.sourceRecordId
        ? { source: args.source, sourceRecordId: normalized.sourceRecordId }
        : normalized.registrationNumber
          ? { source: args.source, registrationNumber: normalized.registrationNumber }
          : { source: args.source, normalizedName: normalized.normalizedName };
      const existing = await SupplierDirectoryModel.findOne(identity).lean();
      await SupplierDirectoryModel.findOneAndUpdate(identity, { $set: normalized }, { upsert: true, new: true, setDefaultsOnInsert: true });
      if (existing) updated++; else imported++;
      if ((index + 1) % 100 === 0) await SupplierDirectoryImportJobModel.updateOne({ jobId: job.jobId }, { $set: { processed: index + 1, imported, updated, skipped } });
    }
    const status = errors.length ? 'partial' : 'completed';
    await SupplierDirectoryImportJobModel.updateOne({ jobId: job.jobId }, { $set: { status, processed: args.records.length, imported, updated, skipped, errors, completedAt: new Date() } });
    return { jobId: String(job.jobId), status, processed: args.records.length, imported, updated, skipped, errors };
  } catch (error) {
    await SupplierDirectoryImportJobModel.updateOne({ jobId: job.jobId }, { $set: { status: 'failed', imported, updated, skipped, errors: [...errors, { reason: error instanceof Error ? error.message : 'import failed' }], completedAt: new Date() } });
    throw error;
  }
}
