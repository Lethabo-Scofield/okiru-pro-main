/** Okiru Hub certificate registry sectors — mirrors API canonical list. */
export interface OkiruHubSector {
  code: 'RCOGP' | 'ICT' | 'FSC' | 'AGRI';
  name: string;
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

export function sectorDisplayLabel(code: string | null | undefined, name?: string | null): string {
  if (!code) return '—';
  const match = OKIRU_HUB_SECTORS.find((s) => s.code === code);
  if (match) return match.label;
  if (!OKIRU_HUB_SECTORS.some((s) => s.code === code)) return 'Needs review';
  if (name) return `${code} — ${name}`;
  return code;
}
