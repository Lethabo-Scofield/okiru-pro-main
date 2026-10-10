/**
 * Applying a verification report to the numbers.
 *
 *   claimed    — the `both` operations: the rule-decided replacements.
 *   evidenced  — `both` and `evidenced`: also removes what is unproven or
 *                outside the period.
 *
 * Two shapes are supported, because the score is computed from two shapes:
 * workbook SECTIONS (the create flow, the end-to-end harness), and the
 * Toolkit's PILLAR state (the live store, and the pillarData /api/calculate
 * receives). Rows are found by the workbook row id, which both carry.
 */
import type { NeedsYouChoice, OverlayOp, VerificationReport, VerificationSections } from './types.js';

export type OverlayBasis = 'claimed' | 'evidenced';

function opsFor(report: VerificationReport, basis: OverlayBasis, extra: OverlayOp[] = []): OverlayOp[] {
  const ops = report.checks.flatMap((c) => c.ops).filter((op) => op.basis === 'both' || (basis === 'evidenced' && op.basis === 'evidenced'));
  return [...ops, ...extra.map((op) => ({ ...op, basis: 'both' as const }))];
}

/** The sections with the report applied. Never mutates its input. */
export function applyOverlayToSections(
  sections: VerificationSections,
  report: VerificationReport,
  basis: OverlayBasis,
  answers: NeedsYouChoice[] = [],
): VerificationSections {
  const out: VerificationSections = {};
  for (const [key, section] of Object.entries(sections)) {
    out[key] = { ...section, meta: section.meta ? { ...section.meta } : section.meta, rows: section.rows?.map((r) => ({ ...r })) };
  }
  const ops = opsFor(report, basis, answers.flatMap((a) => a.ops));
  const excluded = new Set<string>();
  for (const op of ops) {
    const section = out[op.section];
    if (!section) continue;
    if (op.kind === 'notBlack' && op.rowId) {
      const row = section.rows?.find((r) => String(r._id ?? '') === op.rowId);
      if (row) {
        row.race = '';
        for (const column of ['blackOwnership', 'blackWomenOwnership']) if (column in row) row[column] = 0;
      }
      continue;
    }
    if (op.kind === 'exclude' && op.rowId) {
      excluded.add(`${op.section}\u0000${op.rowId}`);
      continue;
    }
    if (op.metaKey) {
      section.meta = { ...(section.meta ?? {}), [op.metaKey]: op.value };
      continue;
    }
    const row = section.rows?.find((r) => String(r._id ?? '') === op.rowId);
    if (row && op.column) {
      if (op.value === null || op.value === undefined) delete row[op.column];
      else row[op.column] = op.value;
    }
  }
  if (excluded.size) {
    for (const [key, section] of Object.entries(out)) {
      if (section.rows) section.rows = section.rows.filter((r) => !excluded.has(`${key}\u0000${String(r._id ?? '')}`));
    }
  }
  return out;
}

/**
 * Where each workbook section's rows live in the Toolkit's pillar state, and
 * how a workbook column reads there. A column without a mapping cannot be set
 * on pillar state (sections take it at create time); exclusions always can.
 */
const PILLAR_PATH: Record<string, { pillar: string; list: string }> = {
  ownership: { pillar: 'ownership', list: 'shareholders' },
  'management-control': { pillar: 'management', list: 'employees' },
  employees: { pillar: 'management', list: 'employees' },
  'skills-development': { pillar: 'skills', list: 'trainingPrograms' },
  procurement: { pillar: 'procurement', list: 'suppliers' },
  suppliers: { pillar: 'procurement', list: 'suppliers' },
  esd: { pillar: 'esd', list: 'contributions' },
  sed: { pillar: 'sed', list: 'contributions' },
};

export interface PillarOverlayOptions {
  /** Workbook band wording → the calculator's designation (the Toolkit passes its own normaliser). */
  normalizeBand?: (raw: string) => string;
}

function pillarField(section: string, column: string, value: unknown, opts: PillarOverlayOptions): [string, unknown] | null {
  const pct = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) > 1 ? Number(v) / 100 : Number(v));
  switch (`${section}.${column}`) {
    case 'procurement.bbbeeLevel':
    case 'suppliers.bbbeeLevel':
      return ['beeLevel', value === null || value === undefined ? 0 : Number(value)];
    case 'procurement.currentBlackOwnership':
      return ['blackOwnership', pct(value)];
    case 'procurement.spend':
      return ['spend', Number(value ?? 0)];
    case 'ownership.rowOutstandingDebt':
      return ['outstandingDebt', value === null || value === undefined ? undefined : Number(value)];
    case 'management-control.occupationalLevel':
    case 'management-control.designation':
    case 'employees.occupationalLevel':
    case 'employees.designation':
      return ['designation', opts.normalizeBand ? opts.normalizeBand(String(value ?? '')) : String(value ?? '')];
    case 'management-control.gender':
    case 'employees.gender':
    case 'ownership.gender':
      return ['gender', value];
    case 'management-control.race':
    case 'employees.race':
    case 'ownership.race':
      return ['race', value];
    default:
      return null;
  }
}

const PILLAR_META: Record<string, { pillar: string; field: string }> = {
  'financial-information.payroll': { pillar: 'skills', field: 'leviableAmount' },
  'financial-information.leviable': { pillar: 'skills', field: 'leviableAmount' },
  'skills-development.leviableAmount': { pillar: 'skills', field: 'leviableAmount' },
  'financial-information.tmps': { pillar: 'procurement', field: 'tmps' },
};

/**
 * Pillar state (or /api/calculate pillarData) with the report applied. Only
 * the pillars named in PILLAR_PATH are touched; returns a shallow-cloned state.
 */
export function applyOverlayToPillars<T extends Record<string, any>>(
  state: T,
  report: VerificationReport,
  basis: OverlayBasis,
  answers: NeedsYouChoice[] = [],
  opts: PillarOverlayOptions = {},
): T {
  const out: Record<string, any> = { ...state };
  const touched = new Set<string>();
  const listOf = (pillar: string, list: string): Array<Record<string, unknown>> | null => {
    const p = out[pillar];
    if (!p || !Array.isArray(p[list])) return null;
    if (!touched.has(pillar)) {
      out[pillar] = { ...p, [list]: p[list].map((x: Record<string, unknown>) => ({ ...x })) };
      touched.add(pillar);
    }
    return out[pillar][list];
  };
  const excluded = new Set<string>();
  for (const op of opsFor(report, basis, answers.flatMap((a) => a.ops))) {
    if (op.metaKey) {
      const target = PILLAR_META[`${op.section}.${op.metaKey}`];
      if (target && out[target.pillar]) out[target.pillar] = { ...out[target.pillar], [target.field]: Number(op.value ?? 0) };
      continue;
    }
    const path = PILLAR_PATH[op.section];
    if (!path || !op.rowId) continue;
    if (op.kind === 'notBlack') {
      const item = listOf(path.pillar, path.list)?.find((x) => String(x.id ?? '') === op.rowId);
      if (item) {
        item.race = '';
        for (const field of ['blackOwnership', 'blackWomenOwnership', 'isBlack']) if (field in item) item[field] = field === 'isBlack' ? false : 0;
      }
      continue;
    }
    if (op.kind === 'exclude') {
      excluded.add(`${path.pillar}\u0000${path.list}\u0000${op.rowId}`);
      continue;
    }
    if (!op.column) continue;
    const mapped = pillarField(op.section, op.column, op.value, opts);
    if (!mapped) continue;
    const item = listOf(path.pillar, path.list)?.find((x) => String(x.id ?? '') === op.rowId);
    if (!item) continue;
    if (mapped[1] === undefined) delete item[mapped[0]];
    else item[mapped[0]] = mapped[1];
  }
  for (const key of Array.from(excluded)) {
    const [pillar, list, rowId] = key.split('\u0000');
    const items = listOf(pillar, list);
    if (items) out[pillar][list] = items.filter((x) => String(x.id ?? '') !== rowId);
  }
  return out as T;
}
