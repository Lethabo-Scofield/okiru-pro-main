/**
 * THE COUNTS A REGISTER IMPLIES BUT DOES NOT PRINT, worked out by the code.
 *
 * Every ESG skill tells the model never to count rows: an incident register
 * lists incidents and prints no "lost-time injuries: 4"; a training register
 * lists one learner per course and prints no "84 African learners". The rows
 * are read (by the code, a register at a time, or by the first pass), and the
 * figures a reviewer wants from them are counted HERE, from the rows' own
 * columns, the ESG twin of skillDerivations.ts on the B-BBEE side.
 *
 * Every value is labelled: `source.method` is 'derived' and its quote says
 * what was counted. A count is only stated from a column the register has:
 * no fatality column, no fatality count (never a zero for a column the
 * register does not keep). A count the document itself prints is never
 * replaced: the derived figure is added only when the read holds none.
 *
 * Rows a HIDDEN sheet carries (scratch copies, last year's lists) are never
 * counted. Pure: no I/O, no model.
 */
import type { DocumentExtraction, ExtractedValue } from './aiExtraction.js';
import { ROW_HIDDEN_KEY } from './entityResolution.js';

type Row = Record<string, unknown>;

/** One derived value: its field, its figure, and what it was counted from. */
export interface RegisterCount {
  field: string;
  value: number | string[] | Array<Record<string, string | number>>;
  basis: string;
}

const present = (value: unknown): boolean =>
  value !== null && value !== undefined && String(value).trim() !== '';

/**
 * A register's yes/no cell as a flag: "Yes", "YES", "Yes (Racking)", "Y",
 * true → true; "No", "NO", "None", "Nil", false → false; anything else
 * ("Delayed", "Awaiting feedback", blank) → null, never guessed.
 */
export function statedFlag(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  if (/^(?:yes|y|true)\b/.test(text)) return true;
  if (/^(?:no|n|false|none|nil)\b/.test(text)) return false;
  return null;
}

/** The rows a register value holds, without the rows a hidden sheet carries. */
function visibleRows(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Row => Boolean(row) && typeof row === 'object' && !Array.isArray(row)
    && (row as Row)[ROW_HIDDEN_KEY] !== true);
}

/** Does the register keep this column at all: some row states it. */
const keeps = (rows: Row[], column: string): boolean => rows.some((row) => present(row[column]));

/**
 * Rows grouped by one column's words as printed ("AFRICAN", "Male"), each
 * group once whatever its case or spacing, in the order first met. A row
 * blank in the column is not counted in any group.
 */
export function tallyBy(rows: Row[], column: string): Array<{ label: string; rows: number }> {
  const groups = new Map<string, { label: string; rows: number }>();
  for (const row of rows) {
    if (!present(row[column])) continue;
    const label = String(row[column]).replace(/\s+/g, ' ').trim();
    const key = label.toLowerCase();
    const group = groups.get(key) ?? { label, rows: 0 };
    group.rows += 1;
    groups.set(key, group);
  }
  return joinMisspelledGroups([...groups.values()]);
}

/** One edit (a letter dropped, added or changed) between two words, and no more. */
function oneEditApart(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/**
 * A group that is a slip of another's spelling ("AFICAN" beside 83 "AFRICAN")
 * joins it: a typed category column holds the odd typo, and counted apart it
 * splits one group into two. Only a label of five letters or more, one edit
 * from a group at least five times its size, and never more than two rows: a
 * real group of its own ("Male" beside "Female") is never one edit away AND
 * that rare.
 */
function joinMisspelledGroups(groups: Array<{ label: string; rows: number }>): Array<{ label: string; rows: number }> {
  const out = groups.map((group) => ({ ...group }));
  const gone = new Set<number>();
  out.forEach((slip, i) => {
    const word = slip.label.toLowerCase();
    if (word.length < 5 || slip.rows > 2) return;
    const into = out.findIndex((group, j) => j !== i && !gone.has(j) && group.rows >= slip.rows * 5
      && oneEditApart(word, group.label.toLowerCase()));
    if (into < 0) return;
    out[into].rows += slip.rows;
    gone.add(i);
  });
  return out.filter((_group, i) => !gone.has(i));
}

function tallyValue(rows: Row[], column: string): Array<Record<string, string | number>> {
  return tallyBy(rows, column).map((group) => ({ [column]: group.label, rows: group.rows }));
}

const countWhere = (rows: Row[], test: (row: Row) => boolean): number => rows.filter(test).length;

/* ------------------------------------------------------------------ *
 * Incident registers
 * ------------------------------------------------------------------ */

const FATAL_WORDS = /\bfatal|\bdeath\b|\bdied\b/i;
const LOST_TIME_WORDS = /\bltis?\b|(?<!\bno\s|\bnon[\s-])\blost[\s-]*time\b/i;
const MEDICAL_WORDS = /\bmedical\b|\bmtcs?\b|\bmtis?\b/i;
const FIRST_AID_WORDS = /\bfirst[\s-]*aid\b|\bfacs?\b/i;
const THIRD_PARTY_WORDS = /\bthird[\s-]*part(?:y|ies)\b|\bmember of the public\b|\bvisitor\b/i;

/**
 * The counts of an incident register (`incident_rows`): the incidents it
 * lists, and by its own columns the lost-time injuries, fatalities, injuries
 * without lost time, property damage, compensation claims lodged, incidents
 * per site and incidents involving a third party.
 *
 * Injuries without lost time are the register's medical-treatment cases only
 * when it does not classify a row as first aid: a register that names first
 * aid and medical treatment is counted by its own classification instead.
 */
export function deriveIncidentCounts(value: unknown): RegisterCount[] {
  const rows = visibleRows(value);
  if (rows.length === 0) return [];
  const out: RegisterCount[] = [{
    field: 'derived_incident_rows_count',
    value: rows.length,
    basis: `derived: the ${rows.length} incidents the register lists`,
  }];
  const classification = (row: Row) => String(row.incident_classification ?? '');
  const fatal = (row: Row) => statedFlag(row.incident_fatality) === true || FATAL_WORDS.test(classification(row));
  const lostTime = (row: Row) => !fatal(row)
    && (statedFlag(row.incident_lost_time) === true || LOST_TIME_WORDS.test(classification(row)));

  if (keeps(rows, 'incident_lost_time') || rows.some((row) => LOST_TIME_WORDS.test(classification(row)))) {
    out.push({
      field: 'lost_time_injuries_count',
      value: countWhere(rows, lostTime),
      basis: 'derived: rows the register marks as lost time (its lost-time column or classification), fatalities excluded',
    });
  }
  if (keeps(rows, 'incident_fatality')) {
    out.push({
      field: 'fatalities_count',
      value: countWhere(rows, fatal),
      basis: 'derived: rows the register marks as a fatality',
    });
  }
  const classifiesCare = rows.some((row) => MEDICAL_WORDS.test(classification(row)) || FIRST_AID_WORDS.test(classification(row)));
  if (classifiesCare) {
    const medical = countWhere(rows, (row) => !fatal(row) && !lostTime(row) && MEDICAL_WORDS.test(classification(row)));
    const firstAid = countWhere(rows, (row) => !fatal(row) && !lostTime(row) && FIRST_AID_WORDS.test(classification(row)));
    if (medical > 0) out.push({ field: 'medical_treatment_injuries_count', value: medical, basis: 'derived: rows the register classifies as medical treatment' });
    if (firstAid > 0) out.push({ field: 'first_aid_cases_count', value: firstAid, basis: 'derived: rows the register classifies as first aid' });
  } else if (keeps(rows, 'incident_person_injured')) {
    out.push({
      field: 'medical_treatment_injuries_count',
      value: countWhere(rows, (row) => statedFlag(row.incident_person_injured) === true && !fatal(row) && !lostTime(row)),
      basis: 'derived: rows where a person was injured with no lost time (the register does not separate medical treatment from first aid)',
    });
  }
  if (keeps(rows, 'incident_property_damage')) {
    out.push({
      field: 'derived_property_damage_incidents_count',
      value: countWhere(rows, (row) => statedFlag(row.incident_property_damage) === true),
      basis: 'derived: rows the register marks as damage to property',
    });
  }
  if (keeps(rows, 'incident_coid_claim_lodged')) {
    out.push({
      field: 'derived_coid_claims_lodged_count',
      value: countWhere(rows, (row) => statedFlag(row.incident_coid_claim_lodged) === true),
      basis: 'derived: rows the register marks as a compensation (COID) claim lodged',
    });
  }
  if (keeps(rows, 'incident_site')) {
    out.push({ field: 'derived_incidents_by_site', value: tallyValue(rows, 'incident_site'), basis: 'derived: incidents counted per site as the register names it' });
  }
  const party = (row: Row) => `${String(row.injured_party_category ?? '')} ${String(row.injured_party_name ?? '')}`;
  if (keeps(rows, 'injured_party_category') || keeps(rows, 'injured_party_name')) {
    const thirdParty = countWhere(rows, (row) => THIRD_PARTY_WORDS.test(party(row)));
    if (thirdParty > 0) {
      out.push({ field: 'derived_third_party_incidents_count', value: thirdParty, basis: 'derived: rows whose person involved is a third party' });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Training registers
 * ------------------------------------------------------------------ */

/**
 * A training register's lines by the learner's race and gender, and the lines
 * with no expenditure, from `training_intervention_rows`. Lines, not people:
 * a learner on two courses is two lines, as the register lists them.
 */
export function deriveTrainingCounts(value: unknown): RegisterCount[] {
  const rows = visibleRows(value);
  if (rows.length === 0) return [];
  const out: RegisterCount[] = [];
  if (keeps(rows, 'learner_race')) {
    out.push({ field: 'derived_training_rows_by_race', value: tallyValue(rows, 'learner_race'), basis: 'derived: register lines counted by the learner\'s race as printed, a one-letter slip joined to its group' });
  }
  if (keeps(rows, 'learner_gender')) {
    out.push({ field: 'derived_training_rows_by_gender', value: tallyValue(rows, 'learner_gender'), basis: 'derived: register lines counted by the learner\'s gender as printed, a one-letter slip joined to its group' });
  }
  if (keeps(rows, 'training_cost_rand')) {
    out.push({
      field: 'derived_training_rows_without_cost',
      value: countWhere(rows, (row) => !present(row.training_cost_rand)),
      basis: 'derived: register lines that state no expenditure',
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Fleet registers
 * ------------------------------------------------------------------ */

/** A trailer or a refrigerated trailer ("reefer", however it is spelt), by its category or model. */
const TRAILER_WORDS = /\btrailers?\b|\bre+fe+rs?\b|\bsemi[\s-]*trailers?\b/i;
/** An electric vehicle by its fuel, its category or its model: "Electric", "EV", "BEV", "e-Delivery". */
const ELECTRIC_WORDS = /\belectric\b|\bb?ev\b|\bbattery\b|(?:^|[\s(])e[\s-]+[a-z]{3,}/i;

/**
 * A fleet register's trailers and electric vehicles, by each unit's own
 * category, model and fuel as printed. Stated only when at least one unit is
 * one: a register that never says "electric" may simply not keep fuel types.
 */
export function deriveFleetCounts(value: unknown): RegisterCount[] {
  const rows = visibleRows(value);
  if (rows.length === 0) return [];
  const described = (row: Row) => `${String(row.vehicle_category ?? '')} ${String(row.vehicle_make_model ?? '')}`;
  const out: RegisterCount[] = [];
  const trailers = countWhere(rows, (row) => TRAILER_WORDS.test(described(row)));
  if (trailers > 0) {
    out.push({ field: 'fleet_trailer_count', value: trailers, basis: `derived: units of the ${rows.length} listed whose category or model names a trailer` });
  }
  const electric = countWhere(rows, (row) => statedFlag(row.is_electric_vehicle) === true
    || /\belectric\b|\bbattery\b|\bb?ev\b/i.test(String(row.fuel_type ?? ''))
    || ELECTRIC_WORDS.test(described(row)));
  if (electric > 0) {
    out.push({ field: 'fleet_ev_count', value: electric, basis: `derived: units of the ${rows.length} listed that the register marks electric` });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Fuel transactions and deliveries
 * ------------------------------------------------------------------ */

/**
 * The delivery notes a fuel register's lines print, each once, in the order
 * printed: the document's list of delivery notes for the period, from its own
 * delivery note column. Never a number the lines do not print.
 */
export function deriveFuelCounts(value: unknown): RegisterCount[] {
  const rows = visibleRows(value);
  const notes = [...new Set(rows.map((row) => row.delivery_note_number).filter(present).map((note) => String(note).trim()))];
  if (notes.length === 0) return [];
  return [{ field: 'delivery_note_numbers', value: notes, basis: 'derived: the delivery note numbers the register\'s lines print, each once' }];
}

/* ------------------------------------------------------------------ *
 * Risk registers
 * ------------------------------------------------------------------ */

/**
 * A rating as one word, however the register prints it: "Risk M", "M",
 * "Medium" and "MEDIUM" are one rating (M); "High"/"H" is H, "Low"/"L" is L.
 * A rating in other words keeps them, as printed.
 */
export function ratingOf(value: unknown): string {
  const text = String(value ?? '').replace(/\b(?:risk|rating|ranking)\b[:\s-]*/gi, '').replace(/\s+/g, ' ').trim();
  if (/^(?:h|high)$/i.test(text)) return 'H';
  if (/^(?:m|med|medium|moderate)$/i.test(text)) return 'M';
  if (/^(?:l|low)$/i.test(text)) return 'L';
  return text;
}

/** A risk register's factors counted by the rating it prints for each ("H", "Risk M", "Low"). */
export function deriveRiskCounts(value: unknown): RegisterCount[] {
  const rows = visibleRows(value);
  if (rows.length === 0) return [];
  for (const column of ['residual_risk_rating', 'risk_rating_as_printed']) {
    if (!keeps(rows, column)) continue;
    const rated = rows.map((row) => ({ ...row, [column]: present(row[column]) ? ratingOf(row[column]) : row[column] }));
    return [{ field: 'derived_risks_by_rating', value: tallyValue(rated, column), basis: 'derived: register factors counted by the rating printed for each (H, M, L however printed)' }];
  }
  return [];
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

const DERIVERS: Record<string, (value: unknown) => RegisterCount[]> = {
  incident_rows: deriveIncidentCounts,
  training_intervention_rows: deriveTrainingCounts,
  fleet_vehicle_rows: deriveFleetCounts,
  fleet_fuel_transaction_rows: deriveFuelCounts,
  risk_register_rows: deriveRiskCounts,
};

/**
 * The counts one document's registers imply, as a read of their own beside
 * the reads that hold the rows ("<read> counts"): the register read stays
 * exactly the rows it read. A field any read of the document already holds (a
 * count the document prints) is never derived. Null when nothing could be.
 */
export function registerCountsFor(reads: DocumentExtraction[]): DocumentExtraction[] {
  const held = new Set(reads.flatMap((read) => read.values.map((value) => value.field)));
  const out: DocumentExtraction[] = [];
  for (const read of reads) {
    const added: ExtractedValue[] = [];
    for (const value of read.values) {
      const derive = DERIVERS[value.field];
      if (!derive) continue;
      for (const count of derive(value.value)) {
        if (held.has(count.field)) continue;
        held.add(count.field);
        added.push({
          field: count.field,
          value: count.value,
          sourceFile: value.sourceFile || read.sourceFile,
          sourceDocumentId: read.documentId,
          source: { method: 'derived', quote: count.basis },
        });
      }
    }
    if (added.length === 0) continue;
    out.push({
      documentId: read.documentId,
      documentName: `${read.documentName} counts`,
      ...(read.element ? { element: read.element } : {}),
      sourceFile: read.sourceFile,
      values: added,
      missingFields: [],
      unexpectedFields: [],
      exceptions: [],
    });
  }
  return out;
}

/** A value the code worked out (never printed): it describes its own document only. */
export function isDerivedValue(value: Pick<ExtractedValue, 'source'>): boolean {
  return value.source?.method === 'derived';
}
