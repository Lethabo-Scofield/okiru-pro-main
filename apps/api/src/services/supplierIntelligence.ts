import { SupplierDirectoryModel, SupplierModel } from '../../models.js';

export type SupplierSearchScope = 'my_suppliers' | 'discover' | 'all';

export type SupplierSearchCriteria = {
  query?: string;
  province?: string;
  city?: string;
  industry?: string;
  beeLevel?: number;
  minBlackOwnership?: number;
  limit?: number;
  scope?: SupplierSearchScope;
};

export type SupplierSearchResult = {
  id: string;
  name: string;
  tradingName?: string;
  industry?: string;
  location?: string;
  productsServices: string[];
  beeLevel?: number;
  recognitionPercentage?: number;
  blackOwnership?: number;
  verificationStatus: string;
  certificateType?: string;
  certificateExpiryDate?: string;
  matchScore: number;
  matchReasons: string[];
  source?: string;
  lastVerifiedAt?: string;
  scope: SupplierSearchScope;
  existingSupplier: boolean;
  sourceEvidence?: unknown[];
  freshnessStatus?: string;
};

const PROVINCES = [
  'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo',
  'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape',
];

export function isSupplierQuestion(message: string): boolean {
  return /\b(supplier|suppliers|vendor|vendors|procurement|buy from|source from|contractor)\b/i.test(message);
}

export function parseSupplierScope(message: string): SupplierSearchScope {
  if (/\b(my|our|existing|authori[sz]ed)\s+(suppliers?|vendors?|network)\b/i.test(message)) return 'my_suppliers';
  if (/\b(new|discover|national|outside|other|broader)\s+(suppliers?|vendors?|network)|outside\s+(our|the)\s+(existing\s+)?network/i.test(message)) return 'discover';
  return 'all';
}

export function parseSupplierCriteria(message: string): SupplierSearchCriteria {
  const text = message.trim();
  const level = text.match(/(?:level|l)\s*([1-8])\b/i)?.[1];
  const province = PROVINCES.find((value) => text.toLowerCase().includes(value.toLowerCase()));
  const ownership = text.match(/(?:black[- ]owned|black ownership|ownership)\D{0,20}(\d{1,3})\s*%/i)?.[1];
  const city = text.match(/\bin\s+([A-Za-z][A-Za-z -]{2,40}?)(?:\s+(?:and|with|for|that|who)\b|[?.!,]|$)/i)?.[1]?.trim();

  return {
    query: text,
    province,
    city: city && !PROVINCES.some((value) => value.toLowerCase() === city.toLowerCase()) ? city : undefined,
    beeLevel: level ? Number(level) : undefined,
    minBlackOwnership: ownership ? Math.min(100, Number(ownership)) / 100 : undefined,
    limit: 10,
  };
}

function textValues(doc: any): string[] {
  return [
    doc.name,
    doc.tradingName,
    doc.industry,
    doc.description,
    ...(Array.isArray(doc.productsServices) ? doc.productsServices : []),
    ...(Array.isArray(doc.categories) ? doc.categories : []),
    ...(Array.isArray(doc.serviceLocations) ? doc.serviceLocations : []),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function normalise(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function matchSupplier(doc: any, criteria: SupplierSearchCriteria, scope: SupplierSearchScope, existingSupplier: boolean): SupplierSearchResult | null {
  const haystack = normalise(textValues(doc).join(' '));
  const queryTerms = normalise(criteria.query).split(/\s+/).filter((term) => term.length > 2 && !['find', 'show', 'which', 'with', 'valid', 'companies', 'company'].includes(term));
  const reasons: string[] = [];
  let score = 0;

  if (criteria.province) {
    if (!haystack.includes(normalise(criteria.province))) return null;
    score += 30;
    reasons.push(`serves ${criteria.province}`);
  }
  if (criteria.city) {
    if (!haystack.includes(normalise(criteria.city))) return null;
    score += 25;
    reasons.push(`matches ${criteria.city}`);
  }
  if (criteria.industry && !haystack.includes(normalise(criteria.industry))) return null;
  if (criteria.beeLevel !== undefined) {
    if (Number(doc.beeLevel) !== criteria.beeLevel) return null;
    score += 25;
    reasons.push(`has stored B-BBEE Level ${criteria.beeLevel}`);
  }
  if (criteria.minBlackOwnership !== undefined) {
    if (typeof doc.blackOwnership !== 'number' || doc.blackOwnership < criteria.minBlackOwnership) return null;
    score += 20;
    reasons.push(`has recorded black ownership of at least ${criteria.minBlackOwnership * 100}%`);
  }

  const termMatches = queryTerms.filter((term) => haystack.includes(term));
  score += Math.min(40, termMatches.length * 8);
  if (termMatches.length > 0) reasons.push(`matches ${termMatches.join(', ')}`);
  if (doc.verificationStatus === 'verified') {
    score += 10;
    reasons.push('has a verified evidence status');
  }

  const productsServices = [
    ...(Array.isArray(doc.productsServices) ? doc.productsServices : []),
    ...(Array.isArray(doc.categories) ? doc.categories : []),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  return {
    id: String(doc.id ?? doc._id),
    name: String(doc.name || 'Unnamed supplier'),
    tradingName: typeof doc.tradingName === 'string' ? doc.tradingName : undefined,
    industry: typeof doc.industry === 'string' ? doc.industry : undefined,
    location: [doc.city, doc.province].filter(Boolean).join(', ') || undefined,
    productsServices,
    beeLevel: Number.isFinite(Number(doc.beeLevel)) && Number(doc.beeLevel) > 0 ? Number(doc.beeLevel) : undefined,
    recognitionPercentage: typeof doc.beeRecognitionPercentage === 'number' ? doc.beeRecognitionPercentage : undefined,
    blackOwnership: typeof doc.blackOwnership === 'number' ? doc.blackOwnership * 100 : undefined,
    verificationStatus: String(doc.verificationStatus || 'unverified'),
    certificateType: typeof doc.certificateType === 'string' ? doc.certificateType : undefined,
    certificateExpiryDate: typeof doc.certificateExpiryDate === 'string' ? doc.certificateExpiryDate : undefined,
    matchScore: Math.min(100, score),
    matchReasons: reasons.length ? reasons : ['record is available in the current authorised supplier data'],
    source: typeof doc.dataSource === 'string' ? doc.dataSource : (typeof doc.source === 'string' ? doc.source : 'Okiru supplier records'),
    lastVerifiedAt: doc.lastVerifiedAt instanceof Date ? doc.lastVerifiedAt.toISOString() : undefined,
    scope,
    existingSupplier,
    sourceEvidence: Array.isArray(doc.sourceEvidence) ? doc.sourceEvidence : undefined,
    freshnessStatus: typeof doc.freshnessStatus === 'string' ? doc.freshnessStatus : undefined,
  };
}

export async function searchSuppliers(args: {
  clientIds: string[];
  criteria: SupplierSearchCriteria;
}): Promise<SupplierSearchResult[]> {
  const clientIds = [...new Set(args.clientIds.map(String).filter(Boolean))];
  const limit = Math.max(1, Math.min(args.criteria.limit ?? 10, 25));
  const scope = args.criteria.scope ?? 'my_suppliers';
  const privateDocs = scope === 'discover' || !clientIds.length ? [] : await SupplierModel.find({ clientId: { $in: clientIds } }).sort({ updatedAt: -1, name: 1 }).limit(200).lean();
  const directoryDocs = scope === 'my_suppliers' ? [] : await SupplierDirectoryModel.find({}).sort({ lastImportedAt: -1, registeredName: 1 }).limit(500).lean();
  const docs = [
    ...privateDocs.map((doc: any) => ({ ...doc, name: doc.name, _supplierScope: 'my_suppliers' as const, _existingSupplier: true })),
    ...directoryDocs.map((doc: any) => ({ ...doc, name: doc.registeredName, dataSource: doc.source, beeLevel: doc.beeLevel, blackOwnership: typeof doc.blackOwnership === 'number' ? doc.blackOwnership / 100 : doc.blackOwnership, certificateExpiryDate: doc.certificateExpiryDate, _supplierScope: 'discover' as const, _existingSupplier: false })),
  ];
  return docs
    .map((doc: any) => matchSupplier(doc, args.criteria, doc._supplierScope, doc._existingSupplier))
    .filter((value): value is SupplierSearchResult => Boolean(value))
    .sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name))
    .slice(0, limit);
}
