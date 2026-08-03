const INDUSTRY_NORMS: Array<{ patterns: string[]; norm: number }> = [
  // Transport: Stats SA P0044 (March 2026) trailing 4-quarter NPAT/turnover margin
  // for Transport Storage & Communication = 5.98% (was 2.69%, Q3 2023 — stale).
  { patterns: ['transport', 'road', 'freight', 'hauler', 'haulage', 'logistics', 'packers'], norm: 5.98 },
  { patterns: ['mining', 'quarry', 'quarrying', 'mineral'], norm: 5.76 },
  { patterns: ['construction', 'building', 'civil'], norm: 3.47 },
  { patterns: ['manufactur', 'factory', 'production'], norm: 4.12 },
  { patterns: ['retail', 'shop', 'store'], norm: 2.15 },
  { patterns: ['wholesale', 'distribution', 'distributor'], norm: 2.85 },
  { patterns: ['financial', 'banking', 'insurance', 'investment'], norm: 6.02 },
  { patterns: ['ict', 'technology', 'software', 'telecom', 'digital'], norm: 5.12 },
  { patterns: ['agriculture', 'farming', 'agri'], norm: 3.12 },
  { patterns: ['hospitality', 'tourism', 'hotel', 'restaurant'], norm: 2.95 },
];

export function resolveIndustryNorm(sector: string, clientName: string): number {
  const sectorLower = (sector || '').toLowerCase();
  const nameLower = (clientName || '').toLowerCase();
  for (const entry of INDUSTRY_NORMS) {
    if (entry.patterns.some(p => sectorLower.includes(p) || nameLower.includes(p))) {
      return entry.norm;
    }
  }
  return 5.76;
}
