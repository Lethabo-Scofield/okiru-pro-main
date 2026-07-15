#!/usr/bin/env node
/**
 * import-eap-norms.cjs
 *
 * Single source of truth for EAP (Economically Active Population) norms.
 *
 * Reads the Commission for Employment Equity (CEE) EAP tables from the
 * authoritative spreadsheets and emits a generated data module consumed by
 * both the API (apps/api/pipeline/eapNorms.ts) and the frontend toolkit.
 *
 * Sources:
 *   - CEE_26TH_RAW below :: 26th CEE Annual Report 2025/26, pp.33-34
 *       (Tables 1 & 2; Stats SA QLFS Q3 2025) => year 2026 (the latest).
 *       docs/Commission for Employment Equity 26th CEE Report.pdf
 *   - docs/TCA_Industry Norms and CEE Stats_Master.xlsx :: "EAP Targets 25th CEE"
 *       => the 25th CEE report (2024-2025) per-province raw proportions, year 2025.
 *   - docs/Lake Trading  Toolkit (RCOGP).xlsx :: "EAP"  (rows under the
 *       "Year | Province | AM ..." header) => historical years 2018-2024 for
 *       the in-app EAP year picker.
 *
 * "Effective / Adjusted EAP" (what the workbook MC Scorecard actually scores
 * against) is derived per group as:  effective_g = raw_g / Σ(6 non-white groups)
 * i.e. White Male + White Female are excluded and the remaining 6 groups are
 * re-normalised to sum to 1.0.  (Verified: Gauteng AM 0.466 / 0.88 = 0.5295.)
 *
 * Usage:  node scripts/import-eap-norms.cjs            # validate, print JSON
 *         node scripts/import-eap-norms.cjs --write     # write generated modules
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TCA = path.join(ROOT, 'docs', 'TCA_Industry Norms and CEE Stats_Master.xlsx');
const LAKE = path.join(ROOT, 'docs', 'Lake Trading  Toolkit (RCOGP).xlsx');

const GROUPS = ['AM', 'CM', 'IM', 'WM', 'AF', 'CF', 'IF', 'WF'];
const NON_WHITE = ['AM', 'CM', 'IM', 'AF', 'CF', 'IF'];

const PROVINCES = [
  'National', 'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal',
  'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape',
];

function toFraction(v) {
  if (v == null || v === '' || v === '-') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (s.endsWith('%')) {
    const n = Number(s.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : 0;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normProvince(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  const hit = PROVINCES.find(p => p.toLowerCase() === s.toLowerCase());
  return hit || null;
}

function rowsOf(file, sheet) {
  const wb = XLSX.readFile(file, { sheets: [sheet] });
  const ws = wb.Sheets[sheet];
  if (!ws) throw new Error(`missing sheet ${sheet} in ${file}`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
}

/**
 * 26th CEE Annual Report 2025/26, Section 6 (pp.33-34), Tables 1 & 2.
 * Source: Statistics South Africa, QLFS Quarter 3 2025 (as republished by the CEE).
 * Transcribed verbatim from docs/Commission for Employment Equity 26th CEE Report.pdf
 * — percentages converted to fractions. Keyed as year 2026 (report published 2026,
 * mirroring the 25th CEE -> 2025 convention).
 */
const CEE_26TH_RAW = {
  'National':      { AM: 0.440, CM: 0.046, IM: 0.015, WM: 0.042, AF: 0.373, CF: 0.040, IF: 0.009, WF: 0.035 },
  'Eastern Cape':  { AM: 0.437, CM: 0.045, IM: 0.002, WM: 0.034, AF: 0.403, CF: 0.046, IF: 0.001, WF: 0.032 },
  'Free State':    { AM: 0.482, CM: 0.009, IM: 0.005, WM: 0.046, AF: 0.427, CF: 0.003, IF: 0.002, WF: 0.026 },
  'Gauteng':       { AM: 0.461, CM: 0.013, IM: 0.020, WM: 0.054, AF: 0.379, CF: 0.014, IF: 0.010, WF: 0.049 },
  'KwaZulu-Natal': { AM: 0.473, CM: 0.005, IM: 0.040, WM: 0.013, AF: 0.431, CF: 0.005, IF: 0.026, WF: 0.007 },
  'Limpopo':       { AM: 0.526, CM: 0.000, IM: 0.003, WM: 0.016, AF: 0.437, CF: 0.001, IF: 0.001, WF: 0.016 },
  'Mpumalanga':    { AM: 0.506, CM: 0.003, IM: 0.006, WM: 0.031, AF: 0.426, CF: 0.002, IF: 0.002, WF: 0.024 },
  'North West':    { AM: 0.519, CM: 0.017, IM: 0.004, WM: 0.031, AF: 0.400, CF: 0.013, IF: 0.000, WF: 0.016 },
  'Northern Cape': { AM: 0.369, CM: 0.183, IM: 0.009, WM: 0.041, AF: 0.213, CF: 0.155, IF: 0.004, WF: 0.026 },
  'Western Cape':  { AM: 0.228, CM: 0.230, IM: 0.008, WM: 0.078, AF: 0.191, CF: 0.192, IF: 0.003, WF: 0.070 },
};

/** Parse the TCA "EAP Targets 25th CEE" sheet (header row: AM CM IM WM AF CF IF WF). */
function parseTca() {
  const rows = rowsOf(TCA, 'EAP Targets 25th CEE');
  // header at index 1: ['', 'AM','CM','IM','WM','AF','CF','IF','WF', 'Black %','All%']
  const out = {};
  for (const r of rows) {
    const prov = normProvince(r[0]);
    if (!prov) continue;
    const vals = GROUPS.map((g, i) => toFraction(r[i + 1]));
    out[prov] = Object.fromEntries(GROUPS.map((g, i) => [g, vals[i]]));
  }
  return out; // keyed by province
}

/** Parse the Lake "EAP" bottom table: rows of [Year, Province, AM..WF, Black%, All%]. */
function parseLakeHistory() {
  const rows = rowsOf(LAKE, 'EAP');
  const byYear = {};
  for (const r of rows) {
    const year = Number(String(r[0]).trim());
    const prov = normProvince(r[1]);
    if (!Number.isFinite(year) || year < 2010 || year > 2100 || !prov) continue;
    const grp = Object.fromEntries(GROUPS.map((g, i) => [g, toFraction(r[i + 2])]));
    (byYear[year] ??= {})[prov] = grp;
  }
  return byYear; // keyed by year -> province
}

function deriveEffective(raw) {
  const denom = NON_WHITE.reduce((s, g) => s + (raw[g] || 0), 0);
  const eff = {};
  for (const g of GROUPS) {
    eff[g] = (g === 'WM' || g === 'WF') ? 0 : (denom > 0 ? (raw[g] || 0) / denom : 0);
  }
  return eff;
}

function round(n, dp = 6) { return Math.round(n * 10 ** dp) / 10 ** dp; }

function build() {
  const tca = parseTca();
  const history = parseLakeHistory();
  // 25th CEE report covers 2024-2025; keyed 2025. TCA wins over Lake 2025.
  // 26th CEE report (2025/26, QLFS Q3 2025) keyed 2026 — the new latest.
  const LATEST_YEAR = 2026;
  const years = {
    ...history,
    2025: { ...(history[2025] || {}), ...tca },
    [LATEST_YEAR]: CEE_26TH_RAW,
  };

  const raw = {};
  const effective = {};
  for (const [year, provs] of Object.entries(years)) {
    raw[year] = {};
    effective[year] = {};
    for (const [prov, grp] of Object.entries(provs)) {
      raw[year][prov] = Object.fromEntries(GROUPS.map(g => [g, round(grp[g] || 0)]));
      const eff = deriveEffective(grp);
      effective[year][prov] = Object.fromEntries(GROUPS.map(g => [g, round(eff[g])]));
    }
  }
  return { LATEST_YEAR, raw, effective };
}

const data = build();

// Sanity checks.
const checks = [];
// (A) Validate the DERIVATION FORMULA against the workbook's own Gauteng inputs
//     (CM=0, Black%=0.88) which the MC Scorecard scored against: AM 0.466/0.88 = 0.5295.
const wbGautengRaw = { AM: 0.466, CM: 0, IM: 0.017, WM: 0.058, AF: 0.374, CF: 0.012, IF: 0.011, WF: 0.05 };
const wbEffAM = deriveEffective(wbGautengRaw).AM;
checks.push(['derive formula: workbook Gauteng AM 0.466/0.88 ≈ 0.5295', Math.abs(wbEffAM - 0.5295) < 0.001]);
// (B) Validate ingestion of the 25th CEE norms (unchanged vintage).
const natRaw = data.raw[2025]?.National;
checks.push(['National 2025 raw AM = 0.435', natRaw && Math.abs(natRaw.AM - 0.435) < 0.0005]);
const g2025 = data.effective[2025]?.Gauteng;
checks.push(['Gauteng 2025 effective sums to ~1.0', g2025 && Math.abs(NON_WHITE.reduce((s, k) => s + g2025[k], 0) - 1) < 0.001]);
// (C) Validate ingestion of the 26th CEE norms (pp.33-34: National AM 44.0%, WC row sums).
const natRaw26 = data.raw[2026]?.National;
checks.push(['National 2026 raw AM = 0.440', natRaw26 && Math.abs(natRaw26.AM - 0.44) < 0.0005]);
checks.push(['National 2026 raw sums to ~1.0', natRaw26 && Math.abs(GROUPS.reduce((s, g) => s + natRaw26[g], 0) - 1) < 0.005]);
const wc2026 = data.effective[2026]?.['Western Cape'];
checks.push(['Western Cape 2026 effective sums to ~1.0', wc2026 && Math.abs(NON_WHITE.reduce((s, k) => s + wc2026[k], 0) - 1) < 0.001]);
// Every province row of the 26th table must sum to ~100% (transcription guard).
for (const [prov, grp] of Object.entries(CEE_26TH_RAW)) {
  const sum = GROUPS.reduce((s, g) => s + (grp[g] || 0), 0);
  checks.push([`26th CEE ${prov} raw sums to ~1.0 (${sum.toFixed(3)})`, Math.abs(sum - 1) < 0.006]);
}

const ok = checks.every(c => c[1]);
console.log('Years ingested:', Object.keys(data.raw).sort().join(', '));
console.log('Provinces (2026):', Object.keys(data.raw[2026] || {}).length);
checks.forEach(([label, pass]) => console.log(pass ? 'PASS' : 'FAIL', '-', label));
console.log('National 2026 raw:', JSON.stringify(natRaw26));
console.log('National 2026 effective:', JSON.stringify(data.effective[2026]?.National));

if (!process.argv.includes('--write')) {
  if (!ok) process.exitCode = 1;
  return;
}

if (!ok) { console.error('Refusing to write: sanity checks failed.'); process.exit(1); }

const banner = `/**
 * AUTO-GENERATED by scripts/import-eap-norms.cjs — DO NOT EDIT BY HAND.
 * Sources:
 *   2026: 26th CEE Annual Report 2025/26, pp.33-34 (Stats SA QLFS Q3 2025)
 *         docs/Commission for Employment Equity 26th CEE Report.pdf
 *   2025: docs/TCA_Industry Norms and CEE Stats_Master.xlsx ("EAP Targets 25th CEE")
 *   2018-2024: docs/Lake Trading  Toolkit (RCOGP).xlsx ("EAP") historical years.
 * Regenerate: node scripts/import-eap-norms.cjs --write
 *
 * RAW = CEE per-group proportions. EFFECTIVE = white-excluded, re-normalised
 * (effective_g = raw_g / Σ non-white groups) — the set the MC Scorecard scores against.
 */\n`;

const body = (exportKw) => `${banner}
export type DemoGroup = 'AM' | 'CM' | 'IM' | 'WM' | 'AF' | 'CF' | 'IF' | 'WF';
export type EapGroupValues = Record<DemoGroup, number>;
export type EapYearTable = Record<string, EapGroupValues>; // province -> values
export type EapNorms = Record<string, EapYearTable>;        // year -> province -> values

export const LATEST_EAP_YEAR = ${data.LATEST_YEAR};
export const NON_WHITE_GROUPS: DemoGroup[] = ['AM','CM','IM','AF','CF','IF'];

${exportKw} RAW_EAP_NORMS: EapNorms = ${JSON.stringify(data.raw, null, 2)};

${exportKw} EFFECTIVE_EAP_NORMS: EapNorms = ${JSON.stringify(data.effective, null, 2)};

/** Re-normalise raw CEE proportions to white-excluded effective EAP. */
export function deriveEffectiveEap(raw: EapGroupValues): EapGroupValues {
  const denom = NON_WHITE_GROUPS.reduce((s, g) => s + (raw[g] || 0), 0);
  const out = {} as EapGroupValues;
  (['AM','CM','IM','WM','AF','CF','IF','WF'] as DemoGroup[]).forEach(g => {
    out[g] = (g === 'WM' || g === 'WF') ? 0 : (denom > 0 ? (raw[g] || 0) / denom : 0);
  });
  return out;
}
`;

const targets = [
  path.join(ROOT, 'apps', 'api', 'pipeline', 'eapNorms.ts'),
  path.join(ROOT, 'apps', 'web', 'Toolkit', 'src', 'lib', 'calculators', 'eapNorms.ts'),
];
for (const t of targets) {
  fs.writeFileSync(t, body('export const'), 'utf8');
  console.log('wrote', path.relative(ROOT, t));
}
