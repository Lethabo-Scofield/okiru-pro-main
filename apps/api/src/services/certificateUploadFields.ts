/**
 * Parse certificate upload / patch body fields from multipart or JSON.
 */
import { resolveOkiruHubSector } from './okiruHubSectors.js';

export interface ParsedCertificateFormFields {
  companyName: string;
  vatNumber: string | null;
  companySize: string | null;
  bbbeeLevel: number | null;
  blackOwnership: number | null;
  blackWomenOwnership: number | null;
  flowThroughBlackOwnership: number | null;
  blackDesignatedGroupOwnership: number | null;
  empoweringSupplier: boolean | null;
  firstProcurementDate: string | null;
  sizeAtFirstProcurement: string | null;
  sdRecipient: boolean | null;
  threeYearContract: boolean | null;
  annualSpend: number | null;
  location: string | null;
  businessUnit: string | null;
  sectorCode: string | null;
  sectorName: string | null;
  expiryDate: string | null;
}

function toPercent(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

function toMoney(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function toLevel(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : null;
}

function toBool(raw: unknown): boolean | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return null;
}

function toDateStr(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function parseCertificateFormBody(body: Record<string, unknown>): ParsedCertificateFormFields {
  const companyName = String(body.companyName ?? body.supplierName ?? '').trim();
  const sectorRaw = body.sectorCode ?? body.sector;
  const resolvedSector = resolveOkiruHubSector(sectorRaw);

  return {
    companyName,
    vatNumber: String(body.vatNumber ?? '').trim() || null,
    companySize: String(body.companySize ?? body.currentCompanySize ?? '').trim() || null,
    bbbeeLevel: toLevel(body.bbbeeLevel ?? body.level),
    blackOwnership: toPercent(body.blackOwnership ?? body.currentBlackOwnership),
    blackWomenOwnership: toPercent(body.blackWomenOwnership ?? body.blackFemaleOwnership),
    flowThroughBlackOwnership: toPercent(body.flowThroughBlackOwnership ?? body.flowThroughBlackOwnershipPercent),
    blackDesignatedGroupOwnership: toPercent(body.blackDesignatedGroupOwnership),
    empoweringSupplier: toBool(body.empoweringSupplier),
    firstProcurementDate: toDateStr(body.firstProcurementDate ?? body.dateOfFirstProcurement),
    sizeAtFirstProcurement: String(body.sizeAtFirstProcurement ?? '').trim() || null,
    sdRecipient: toBool(body.sdRecipient),
    threeYearContract: toBool(body.threeYearContract ?? body.hasThreeYearContract),
    annualSpend: toMoney(body.annualSpend),
    location: String(body.location ?? '').trim() || null,
    businessUnit: String(body.businessUnit ?? '').trim() || null,
    sectorCode: resolvedSector?.sectorCode ?? null,
    sectorName: resolvedSector?.sectorName ?? null,
    expiryDate: toDateStr(body.expiryDate ?? body.certificateExpiryDate),
  };
}

export function parsedFormToMongoSet(fields: ParsedCertificateFormFields): Record<string, unknown> {
  return {
    supplierName: fields.companyName || null,
    vatNumber: fields.vatNumber,
    companySize: fields.companySize,
    bbbeeLevel: fields.bbbeeLevel,
    blackOwnership: fields.blackOwnership,
    blackWomenOwnership: fields.blackWomenOwnership,
    flowThroughBlackOwnership: fields.flowThroughBlackOwnership,
    blackDesignatedGroupOwnership: fields.blackDesignatedGroupOwnership,
    empoweringSupplier: fields.empoweringSupplier,
    firstProcurementDate: fields.firstProcurementDate ? new Date(fields.firstProcurementDate) : null,
    sizeAtFirstProcurement: fields.sizeAtFirstProcurement,
    sdRecipient: fields.sdRecipient,
    threeYearContract: fields.threeYearContract,
    annualSpend: fields.annualSpend,
    location: fields.location,
    businessUnit: fields.businessUnit,
    sectorCode: fields.sectorCode,
    sectorName: fields.sectorName,
    expiryDate: fields.expiryDate ? new Date(fields.expiryDate) : null,
  };
}

export function parsedFormToLocalPatch(fields: ParsedCertificateFormFields): Record<string, unknown> {
  return {
    companyName: fields.companyName,
    vatNumber: fields.vatNumber,
    companySize: fields.companySize,
    bbbeeLevel: fields.bbbeeLevel,
    blackOwnership: fields.blackOwnership,
    blackWomenOwnership: fields.blackWomenOwnership,
    flowThroughBlackOwnership: fields.flowThroughBlackOwnership,
    blackDesignatedGroupOwnership: fields.blackDesignatedGroupOwnership,
    empoweringSupplier: fields.empoweringSupplier,
    firstProcurementDate: fields.firstProcurementDate,
    sizeAtFirstProcurement: fields.sizeAtFirstProcurement,
    sdRecipient: fields.sdRecipient,
    threeYearContract: fields.threeYearContract,
    annualSpend: fields.annualSpend,
    location: fields.location,
    businessUnit: fields.businessUnit,
    sectorCode: fields.sectorCode,
    sectorName: fields.sectorName,
    expiryDate: fields.expiryDate,
  };
}
