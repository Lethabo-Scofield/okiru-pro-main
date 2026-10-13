/**
 * A utility bill is ONE site's figure for ONE month.
 *
 * Resolved across the case like any other field, twelve electricity bills were
 * twelve rival answers to "electricity_kwh" — and to "site_name" and to
 * "billing_period_end" — so the user was shown three conflicts and at most one
 * bill placed. Read as rows of the monthly register instead, each bill is its
 * own site × month figure, placed by the same code that places a dashboard's:
 * figures for one site and month from one document add up, two documents for
 * the same site and month must agree, and different sites never compete.
 *
 * Only the figures a monthly grid keeps are turned into rows, and only from a
 * bill that states its period: without a month a figure has no column, and it
 * is left as the document's own value to be reported as such. Account numbers,
 * tariffs and costs stay values — evidence an assurance provider reads.
 */
import type { DocumentExtraction, ExtractedValue } from './aiExtraction.js';
import { ROW_SOURCE_KEY } from './entityResolution.js';

/** The bill fields a monthly grid keeps, by the element that reads them. */
const BILL_MEASURES: Record<string, Record<string, string>> = {
  GHG_ENERGY: {
    electricity_kwh: 'energy.electricity_kwh',
    solar_kwh_generated: 'energy.solar_kwh_generated',
    generator_diesel_litres: 'energy.generator_diesel_litres',
    lpg_kg: 'energy.lpg_kg',
  },
  WATER: {
    water_kl: 'water.kl',
  },
};

/** What places a bill's figure; consumed by the row, so never a rival answer. */
const CONTEXT_FIELDS = ['site_name', 'billing_period_end', 'billing_period_start'];

/** The register the rows join (esgMonthlyTables.ts emits the same shape). */
export const ESG_MONTHLY_ROWS_FIELD = 'esg_monthly_rows';

const stated = (value: unknown): boolean =>
  value !== null && value !== undefined && String(value).trim() !== '';

/** "35 332", "35,332 kWh" → a number; anything else is not a figure. */
function looksNumeric(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  const cleaned = value
    .replace(/[()]/g, '')
    .replace(/\b(kwh|kl|kg|litres?|l)\b/gi, '')
    .replace(/[\s,]/g, '');
  return /^-?\d+(\.\d+)?$/.test(cleaned);
}

/**
 * One bill → the same extraction with its gridded figures moved into rows of
 * the monthly register. An extraction that is not a bill, or a bill without a
 * period or a figure, comes back unchanged.
 */
export function billAsMonthlyRows(extraction: DocumentExtraction): DocumentExtraction {
  const measures = BILL_MEASURES[String(extraction.element ?? '')];
  if (!measures) return extraction;

  const first = (field: string): ExtractedValue | undefined =>
    extraction.values.find((value) => value.field === field && stated(value.value));
  const period = first('billing_period_end') ?? first('billing_period_start');
  if (!period) return extraction;
  const site = first('site_name');

  const figures = extraction.values.filter((value) => measures[value.field] !== undefined && looksNumeric(value.value));
  if (figures.length === 0) return extraction;

  const context = [site ? 'site_name' : null, period.field].filter(Boolean).join(',');
  const rows = figures.map((figure) => ({
    monthly_measure: measures[figure.field],
    ...(site ? { monthly_site: site.value } : {}),
    monthly_period_end: period.value,
    monthly_value: figure.value,
    monthly_field: figure.field,
    monthly_context: context,
    // A register merged across documents keeps each row's own file.
    [ROW_SOURCE_KEY]: figure.sourceFile || extraction.sourceFile,
  }));

  const consumed = new Set([...figures.map((figure) => figure.field), ...CONTEXT_FIELDS]);
  return {
    ...extraction,
    values: [
      ...extraction.values.filter((value) => !consumed.has(value.field)),
      {
        field: ESG_MONTHLY_ROWS_FIELD,
        value: rows,
        sourceFile: extraction.sourceFile,
        sourceDocumentId: extraction.documentId,
      },
    ],
  };
}
