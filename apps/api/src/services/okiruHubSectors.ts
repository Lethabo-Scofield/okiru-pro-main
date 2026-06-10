/** Okiru Hub certificate registry sectors — canonical list for upload/classification. */
export interface OkiruHubSector {
  code: 'RCOGP' | 'ICT' | 'FSC' | 'AGRI';
  name: string;
  /** Display label for dropdowns: "RCOGP — Retail, Construction, Oil & Gas, Property" */
  label: string;
}

export const OKIRU_HUB_SECTORS: readonly OkiruHubSector[] = [
  {
    code: 'RCOGP',
    name: 'Retail, Construction, Oil & Gas, Property',
    label: 'RCOGP — Retail, Construction, Oil & Gas, Property',
  },
  {
    code: 'ICT',
    name: 'Information & Communications Technology',
    label: 'ICT — Information & Communications Technology',
  },
  {
    code: 'FSC',
    name: 'Financial Sector Code',
    label: 'FSC — Financial Sector Code',
  },
  {
    code: 'AGRI',
    name: 'Agriculture (AgriBEE)',
    label: 'AGRI — Agriculture (AgriBEE)',
  },
] as const;

const BY_CODE = new Map(OKIRU_HUB_SECTORS.map((s) => [s.code, s]));

export function isOkiruHubSectorCode(code: unknown): code is OkiruHubSector['code'] {
  return typeof code === 'string' && BY_CODE.has(code.toUpperCase() as OkiruHubSector['code']);
}

export function resolveOkiruHubSector(
  code: unknown,
): { sectorCode: OkiruHubSector['code']; sectorName: string } | null {
  if (!isOkiruHubSectorCode(code)) return null;
  const sector = BY_CODE.get(code.toUpperCase() as OkiruHubSector['code']);
  if (!sector) return null;
  return { sectorCode: sector.code, sectorName: sector.name };
}

export function okiruHubSectorLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return BY_CODE.get(code.toUpperCase() as OkiruHubSector['code'])?.label ?? null;
}
