/**
 * Case-level ESG extraction — the layer the ESG upload routes call.
 *
 * The ESG twin of `caseExtraction.ts`, and deliberately thin: everything that
 * does real work is the SAME code the B-BBEE path runs, called with
 * `domain: 'esg'`. Reading files, OCR, chunking, caching, the sweep, grounding,
 * checksums and cross-case conflict resolution are all shared verbatim. What
 * differs is only which matrix supplies the prompts, which menu the classifier
 * chooses from, and which allowlist gates the output.
 *
 * Additive by construction, exactly like the B-BBEE path: with no model
 * configured this returns null and the caller answers with its deterministic
 * result unchanged. A missing API key must never turn a working upload into a
 * failed one.
 *
 * WORKBOOK SHEETS are read by `esgSheetTableExtraction` alongside the spec pass.
 * That used to be listed here as deliberately absent, on the grounds that the
 * only shape catalogue was the five B-BBEE scorecard tables — true then, wrong
 * now: `ESG_GRIDS` describes fourteen ESG registers with the row columns the
 * calculator mapping already understands. A register that arrives as a
 * SPREADSHEET is now mapped once and applied to every row, instead of being
 * re-typed by the model a row at a time.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *   - The supplier-LEDGER reader and the B-BBEE financials sheet reader, for the
 *     same reason.
 *   - The entity-name fallback and the auditor-validation pass, whose prompts
 *     name B-BBEE explicitly. Running them here would put the wrong question to
 *     the model; ESG entity identity comes from the FINANCIAL specs.
 */
import { createLogger } from '../logger.js';
import type { RawExtractionInput } from '../../schemas/document_types.js';
import {
  extractDocument,
  type DocumentExtraction,
  type ExtractionModel,
} from './aiExtraction.js';
import { getExtractionModel, duplicateWorkbookException, type ResolveProgress } from './caseExtraction.js';
import { ROW_HIDDEN_KEY, resolveCaseEntities, type CaseEntities } from './entityResolution.js';
import { billAsMonthlyRows } from './esgBillFacts.js';
import {
  CONFIDENCE_FLOOR,
  classifyDocument,
  routingElement,
  specForSkill,
  type DocumentClassificationResult,
} from './documentClassification.js';
import { focusForInput } from './esgFocus.js';
import { extractionDomain } from './extractionDomain.js';
import { concurrentMap, documentConcurrency } from './concurrentMap.js';
import { combinedFormSpecIds, elementFromHint, pinnedSpecIds } from './specRetrieval.js';
import {
  agentCasePass,
  agentPassForDocument,
  unitAgainstFieldName,
  unitFamilyOfField,
  unitFamilyOfUnit,
  unitsNamedByField,
  type AgentCaseContext,
  type AgentCasePass,
  type DeterministicDocument,
} from './agentExtraction.js';
import type { EsgElement } from '../../schemas/esg_document_matrix.js';
import { addOtherDocumentRead, agentOnOtherDocument, otherByClassifier as passAOther, proposeOpenMappings } from './openRead.js';
import { reviewCase } from './caseReview.js';
import { extractEsgSheetTable } from './esgSheetTableExtraction.js';
import { extractEsgMonthlyTables, monthlyReadSpans, monthlyReadStandsIn } from './esgMonthlyTables.js';
import { extractEsgPeriodSummary, fillsOfVehicle, periodReadSpan, topOfSheetIsDated, vehicleOfSheet } from './esgPeriodSummaries.js';
import {
  extractEsgSheetFacts,
  mergeCellReads,
  registerBodySpan,
  sheetFactsEnabled,
  sparseMatrix,
  type MainRegion,
  type ReadSpan,
} from './esgSheetFacts.js';
import {
  ESG_REGISTER_FIELDS,
  esgFieldElementIndex,
  mapEsgEntitiesToCalculator,
  mapEsgEntitiesToCalculatorWithSemantics,
  unfilledEsgCalculatorKeys,
  type EsgCalculatorMappingResult,
} from './esgEntityCalculatorMapping.js';

const logger = createLogger('EsgCaseExtraction');

export interface EsgCaseExtractionResult extends CaseEntities {
  model: string;
  /** Marks the payload's vocabulary, so a client never mixes the two domains. */
  domain: 'esg';
  /** Per-document detail, so a value can be traced back to the prompt that found it. */
  extractions: DocumentExtraction[];
  /**
   * The extracted evidence expressed as ESG calculator inputs. Scalars in
   * `payload`; register rows in `rows`, one object per source row.
   */
  calculator: EsgCalculatorMappingResult;
}

/**
 * The header-keyed rows a split workbook sheet already parsed.
 *
 * Same shape check the B-BBEE path uses: anything that is not an array of plain
 * objects is not a table, and a deterministic read of a non-table is worse than
 * no read at all.
 */
function structuredRows(tables: unknown[] | undefined): Array<Record<string, unknown>> | undefined {
  const first = tables?.[0];
  if (!first || typeof first !== 'object') return undefined;
  const rows = (first as { rows?: unknown }).rows;
  if (!Array.isArray(rows) || rows.length === 0) return undefined;
  if (!rows.every((row) => row !== null && typeof row === 'object' && !Array.isArray(row))) return undefined;
  return rows as Array<Record<string, unknown>>;
}

/**
 * The model's own notes ("exceptions" in its reply) are the document's
 * exceptions, never a value. Left as a field, every document's notes were a
 * rival answer to one question, and the user was shown "exceptions — your
 * documents disagree" with thirty-four candidates.
 */
export function notesAsExceptions(extraction: DocumentExtraction): DocumentExtraction {
  const notes = extraction.values.filter((value) => value.field === 'exceptions');
  if (notes.length === 0) return extraction;
  const said = notes.flatMap((note) => (Array.isArray(note.value) ? note.value : [note.value]))
    .map((note) => String(note ?? '').trim())
    .filter(Boolean);
  return {
    ...extraction,
    values: extraction.values.filter((value) => value.field !== 'exceptions'),
    exceptions: [...extraction.exceptions, ...said.filter((note) => !extraction.exceptions.includes(note))],
  };
}

/**
 * A figure the first pass read in a unit its field's NAME excludes ("35.75 MWh"
 * under electricity_kwh, "0.2 t" under waste_total_kg) is the reviewer's, not
 * a value. Nothing downstream reads the unit fields, so it would count as kWh
 * or kg: a thousand times too small. The agent's check_value refuses the same
 * figure; this holds the first pass to it. The field's own unit, a same-size
 * spelling (m3 for kL) and a bare figure are kept exactly as read.
 */
export function namedUnitFiguresAsExceptions(extraction: DocumentExtraction): DocumentExtraction {
  const refused: string[] = [];
  const values = extraction.values.filter((value) => {
    if (typeof value.value !== 'string') return true;
    const named = unitsNamedByField(value.field);
    if (!named) return true;
    const unit = unitAgainstFieldName(value.field, value.value, '');
    if (!unit) return true;
    refused.push(`${value.field}: "${value.value.trim()}" is printed in ${unit}, and ${value.field} holds ${named[0]} only. `
      + 'It was not stored: never convert it; the reviewer decides where it goes.');
    return false;
  });
  if (refused.length === 0) return extraction;
  return { ...extraction, values, exceptions: [...extraction.exceptions, ...refused] };
}

/** Notes the code writes itself; only the reader's own notes speak for the reader. */
const CODE_NOTE = /^(?:Values not found in the source document|Second read|Analyst (?:review|note)|Read as an Other document|Every quantity this sheet prints)|failed its checksum/i;

/** A note about one part of a chunked document: another part may print the value. */
const PART_NOTE = /\b(?:this|that|other|another) part\b|\bpart \d+ of \d+\b|\bchunk\b/i;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The reader's own note says the field is not printed: a clause that OPENS
 * with the field ("<field> not present on the pages provided"), or "no
 * <field>". A clause that only mentions the field ("VAT treatment of <field>
 * is not stated") is about something else and never refuses it.
 */
function noteSaysAbsent(note: string, field: string): boolean {
  const name = escapeRegExp(field);
  const absent = new RegExp(
    `^[\\s"'“‘(-]*${name}\\b["'”’)]?\\s*(?:\\(|:|-|–|—|is|was|are|were)?\\s*`
      + '(?:not\\s+(?:present|printed|stated|shown|given|provided|available|visible|legible|on\\s+(?:this|the)\\s+(?:page|pages|document))|absent|missing|(?:left\\s+|returned\\s+as\\s+|set\\s+to\\s+)null)\\b'
      + `|\\bno\\s+${name}\\b`,
    'i',
  );
  return absent.test(note);
}

/** Months, for a filing label ("Depot A July 2025") read as an issuer. */
const MONTH_AND_YEAR = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|maart|mei|junie|julie|oktober|desember)\b[\s'’.-]*(?:19|20)?\d{2}\b/i;

/** Fields that name who issued a document: never a filing label. */
const ISSUER_FIELD = /(?:^|_)(?:supplier|issuer|issued_by|contractor|municipality|certification_body|provider|landlord)(?:_name)?$/;

/**
 * The first pass fills a field its own notes say the document does not print
 * ("municipality_or_supplier_name not present on provided pages", yet a name
 * was returned), fills a unit field with a word that is no unit ("UNITS" from a
 * column heading, as a mass unit), or takes a filing label ("Depot A July
 * 2025", handwritten on a scan) as the issuer. Each such value is the read
 * contradicting itself or the vocabulary: it goes to the reviewer as an
 * exception, never as a value. The agent's cited fills are not judged here:
 * their citations were checked against the page. Notes about one part of a
 * long document, and notes the code wrote, are not the read's own word.
 */
export function unprintedValuesAsExceptions(extraction: DocumentExtraction): DocumentExtraction {
  const notes = extraction.exceptions
    .map((note) => String(note ?? '').trim())
    .filter((note) => note && !CODE_NOTE.test(note))
    .flatMap((note) => note.split(/;\s+|\.\s+/))
    .filter((clause) => !PART_NOTE.test(clause));
  const refused: string[] = [];
  // The first answer's notes speak for the first answer: a field the sweep
  // filled afterwards, or any field of a document read in parts (each part's
  // notes speak for that part), is not judged by them.
  const swept = new Set(extraction.sweptFields ?? []);
  const notesApply = (extraction.readInParts ?? 1) <= 1;
  const values = extraction.values.filter((value) => {
    if (value.source?.method === 'agent' || Array.isArray(value.value) || value.value === null || typeof value.value === 'object') return true;
    const shown = String(value.value).trim();
    if (notesApply && !swept.has(value.field) && notes.some((note) => noteSaysAbsent(note, value.field))) {
      refused.push(`${value.field}: "${shown}" was not kept: the read's own note says the document does not print it.`);
      return false;
    }
    if (/_unit$/.test(value.field)) {
      const family = unitFamilyOfUnit(value.value);
      const expected = unitFamilyOfField(value.field.replace(/_unit$/, ''));
      if (!family || (expected && family !== expected)) {
        refused.push(`${value.field}: "${shown}" was not kept: it is not a unit${expected ? ` of ${expected}` : ''} (kg, t, L, kL, kWh...).`);
        return false;
      }
    }
    if (ISSUER_FIELD.test(value.field) && typeof value.value === 'string' && MONTH_AND_YEAR.test(value.value)) {
      refused.push(`${value.field}: "${shown}" was not kept: a place with a month and year is a filing label, not who issued the document.`);
      return false;
    }
    return true;
  });
  if (refused.length === 0) return extraction;
  return { ...extraction, values, exceptions: [...extraction.exceptions, ...refused] };
}

/**
 * The extraction as the case resolution sees it: without the facts its skill
 * marks `scope: document` (a statement date, a document number, a revision, an
 * author, a filing label, a printed twelve-month total). Those describe their
 * own document. Resolved across the case, every bill's statement date would
 * be a rival answer to every other's, and the semantic mapping would be
 * offered a twelve-month total as if it were the year's figure. They stay on
 * the extraction the user reads per document.
 */
export function withoutDocumentFacts(extraction: DocumentExtraction): DocumentExtraction {
  const skill = extractionDomain('esg').skillFor(extraction.documentId);
  const documentOnly = new Set((skill?.fields ?? []).filter((field) => field.scope === 'document' && !field.rowLevel).map((field) => field.name));
  if (documentOnly.size === 0 || !extraction.values.some((value) => documentOnly.has(value.field))) return extraction;
  return { ...extraction, values: extraction.values.filter((value) => !documentOnly.has(value.field)) };
}

/** A field that holds money: a rand amount, a charge, a cost, a credit. */
const MONEY_FIELD = /(?:^|_)(?:rand|zar|amount|cost|costs|charge|charges|credit|spend|vat)(?:_|$)/;

/** "20.25-", "R 1 250.00 -": a figure whose minus is printed AFTER it. */
const TRAILING_MINUS = /^\s*((?:r|zar)?\s*\d[\d\s,]*(?:[.,]\d+)?)\s*-\s*$/i;

/** A rate is per something, and a rate is never a credit. */
const isRate = (field: string): boolean => /(?:^|_)per(?:_|$)/.test(field);

function creditAsNegative(field: string, value: unknown): unknown {
  if (typeof value !== 'string' || !MONEY_FIELD.test(field) || isRate(field)) return value;
  const m = TRAILING_MINUS.exec(value);
  return m ? `-${m[1].trim()}` : value;
}

/**
 * A credit printed in the accounting style — the minus AFTER the figure
 * ("20.25-", the way a municipal account prints a generation-offset credit) —
 * is a negative amount. Stored as printed, nothing downstream could read it:
 * every number parser here, and the web's, reads "20.25-" as no number at all,
 * so the credit silently vanished from the bill's charges. Normalised to the
 * leading-minus form ("-20.25") on money fields only, in scalars and in the
 * columns of a document's rows. The figure itself is never changed; a
 * quantity (kWh, litres) keeps whatever the document printed, because a
 * negative quantity is a meaning (an export), not a typography.
 */
export function trailingMinusCreditsAsNegative(extraction: DocumentExtraction): DocumentExtraction {
  let changed = false;
  const values = extraction.values.map((value) => {
    if (Array.isArray(value.value)) {
      let rowsChanged = false;
      const rows = value.value.map((row) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
        let rowChanged = false;
        const next: Record<string, unknown> = {};
        for (const [column, cell] of Object.entries(row as Record<string, unknown>)) {
          const normal = creditAsNegative(column, cell);
          if (normal !== cell) rowChanged = true;
          next[column] = normal;
        }
        if (!rowChanged) return row;
        rowsChanged = true;
        return next;
      });
      if (!rowsChanged) return value;
      changed = true;
      return { ...value, value: rows };
    }
    const normal = creditAsNegative(value.field, value.value);
    if (normal === value.value) return value;
    changed = true;
    return { ...value, value: normal };
  });
  return changed ? { ...extraction, values } : extraction;
}

/** How many zero quantities, and nothing else, make a sheet an unfilled template. */
const TEMPLATE_ZERO_QUANTITIES = 3;

const isZeroFigure = (value: unknown): boolean => {
  if (typeof value === 'number') return value === 0;
  return typeof value === 'string' && /^\s*-?0+(?:[.,]0+)?\s*$/.test(value);
};

/**
 * An unfilled spreadsheet template prints its formulas' zeros: an empty stock
 * reconciliation shows opening 0, deliveries 0, issues 0 and closing 0. Read as
 * figures, they were filed as a depot's diesel stock and contradicted the real
 * reconciliation on the next tab. A sheet read whose quantities (fields named
 * for their unit: litres, kWh, kL, kg) number three or more and are ALL zero is
 * a template: the zeros go to the reviewer as one exception, never as figures.
 * A single zero ("generator diesel 0 L") is a reading and stays; so does every
 * figure of a read with one non-zero quantity. Money and rates are no quantity.
 */
export function templateZerosAsExceptions(extraction: DocumentExtraction): DocumentExtraction {
  const quantities = extraction.values.filter(
    (value) => !Array.isArray(value.value) && unitsNamedByField(value.field) !== null,
  );
  if (quantities.length < TEMPLATE_ZERO_QUANTITIES || !quantities.every((value) => isZeroFigure(value.value))) {
    return extraction;
  }
  const zeroed = new Set(quantities.map((value) => value.field));
  return {
    ...extraction,
    values: extraction.values.filter((value) => !zeroed.has(value.field)),
    exceptions: [
      ...extraction.exceptions,
      `Every quantity this sheet prints is zero (${[...zeroed].join(', ')}): an unfilled template's formulas, `
        + 'not readings. None was stored; the reviewer confirms whether the sheet is in use.',
    ],
  };
}

/**
 * The specs to read a document with when Pass A named its type from the ESG
 * skills menu: that type's ONE spec (the B-BBEE rule, 2.9c), so a policy is not
 * also read as an environmental policy and a municipal account not also as a
 * solar generation report. One exception is the combined municipal
 * account: when the named type is one of the two utility bills and the
 * document evidences both utilities, both bill specs are read, as retrieval
 * pins them, so its kilolitres are never lost to its kilowatt-hours. The
 * same holds for an EE submission printing both the workforce analysis
 * (EEA2/EEA12) and the EE plan (EEA13): both EE specs are read.
 * Null leaves the choice to retrieval.
 */
export function esgSkillSpecIds(
  classification: DocumentClassificationResult | null,
  input: { filename: string; markdown?: string; raw_text?: string },
): string[] | null {
  const spec = specForSkill(classification, 'esg');
  if (!spec) return null;
  const haystack = `${input.filename}\n${input.markdown?.trim() || input.raw_text || ''}`;
  // A combined municipal account (electricity and water), or statutory forms
  // printed in one file (the EE workforce analysis and the EE plan): every
  // document type it holds is read, the classified one first.
  for (const pins of [pinnedSpecIds('esg', haystack), combinedFormSpecIds('esg', haystack)]) {
    if (pins.includes(spec.id)) return [spec.id, ...pins.filter((id) => id !== spec.id)];
  }
  return [spec.id];
}

/** The generic policy reader (skills/esg/policy_document.md): a policy's header and control facts. */
export const POLICY_HEADER_SPEC_ID = 'policy_document';

/** A policy, a code or a charter, by what Pass A called it, its file name, or its own header table. */
const POLICY_WORDS = /\b(?:polic(?:y|ies)|code of (?:conduct|ethics|business)|charter)\b/i;

/**
 * Is this standalone document a policy, a code or a charter that NONE of its
 * reads read as one? A group's employment-equity policy is typed by Pass A
 * as employment-equity evidence (an EE plan), whose reader rightly finds no
 * plan in it; a policy read by the policy, ethics, supplier-code or
 * environmental-policy readers is already read as a policy. When true, the
 * document is also read with the generic policy reader, so its title,
 * revision, dates, author, approver, scope and owners are never lost to the
 * element it was filed under.
 */
export function needsPolicyHeaderRead(
  input: { filename: string; markdown?: string; raw_text?: string },
  classification: DocumentClassificationResult | null,
  results: DocumentExtraction[],
): boolean {
  const opening = (input.markdown?.trim() || input.raw_text || '').slice(0, 2000);
  const named = POLICY_WORDS.test(classification?.documentType ?? '')
    || POLICY_WORDS.test(input.filename)
    || /\bpolicy\s+title\b/i.test(opening);
  if (!named) return false;
  const definition = extractionDomain('esg');
  return !results.some((result) => result.values.some((value) => value.field !== 'exceptions')
    && (definition.skillFor(result.documentId)?.fields ?? []).some((field) => field.name === 'policy_title'));
}

/**
 * What the agent gate knows about an ESG document's type. ESG has no
 * rule-based reader: the type is the skill Pass A named (only when it was
 * confident), and the confidence is Pass A's.
 */
export function esgAgentTyping(
  filename: string,
  classification: DocumentClassificationResult | null,
): DeterministicDocument {
  const typed = classification?.skillId && classification.confidence >= CONFIDENCE_FLOOR ? classification.skillId : undefined;
  return {
    filename,
    typed_by: 'classifier',
    ...(typed ? { document_type: typed } : {}),
    ...(classification ? { overall_confidence: classification.confidence } : {}),
  };
}

/** Where a split sheet's main table sits, and the cells outside it a large sheet carries. */
function sheetLayoutOf(tables: unknown[] | undefined): {
  region?: MainRegion;
  outside?: Array<{ r: number; c: number; value: unknown }>;
} {
  const table = tables?.[0] as { region?: MainRegion; outside?: Array<{ r: number; c: number; value: unknown }> } | undefined;
  return {
    region: table?.region && Number.isInteger(table.region.headerRow) ? table.region : undefined,
    outside: Array.isArray(table?.outside) ? table.outside : undefined,
  };
}

/** A main table longer than a summary block: a register, whoever reads it. */
function mainTableIsRegister(matrix: unknown[][], region: MainRegion): boolean {
  const span = registerBodySpan(matrix, region);
  return span.bottom - span.top > 25;
}

/** The raw cell layout a split workbook sheet carries, when it carries one. */
function sheetMatrixOf(tables: unknown[] | undefined): unknown[][] | undefined {
  const matrix = (tables?.[0] as { matrix?: unknown } | undefined)?.matrix;
  return Array.isArray(matrix) && matrix.every(Array.isArray) ? (matrix as unknown[][]) : undefined;
}

export async function extractEsgCaseEntities(
  inputs: RawExtractionInput[],
  model: ExtractionModel | null = getExtractionModel(),
  onProgress?: (p: ResolveProgress) => void,
  options: {
    /** The element each upload was filed under, by file name (C1, `esgFocus.ts`). */
    focusByFile?: Readonly<Record<string, EsgElement>>;
    /**
     * The agent-loop pass (agentExtraction.ts), exactly as on the B-BBEE side:
     * runs only when this is given AND PARSER_AGENT_EXTRACTION (or
     * `agent.mode`) is hard/all. The streaming route passes it.
     */
    agent?: AgentCaseContext;
  } = {},
): Promise<EsgCaseExtractionResult | null> {
  if (!model || inputs.length === 0) return null;
  let done = 0;
  const total = inputs.length;
  const agentPass: AgentCasePass | null = agentCasePass(model, options.agent ? { ...options.agent, domain: 'esg' } : undefined);

  // Documents are read in PARALLEL, bounded — the same shared helper, the same
  // input-order guarantee, because ESG conflicts also resolve first-document-wins
  // and a race that reordered documents would move a published number between
  // runs on identical evidence.
  const settled = await concurrentMap(inputs, documentConcurrency(), async (input) => {
    const sheetName = typeof input.metadata?.sheet_name === 'string' ? input.metadata.sheet_name : undefined;
    // A one-sheet workbook is the whole upload, not a sheet split out of one:
    // a document in its own right for Pass A and the open read, while its rows
    // and grid still go to the code readers below.
    const standalone = !sheetName || input.metadata?.single_sheet === true;

    // Pass A — model classification against the ESG menu. Paid only for
    // ANONYMOUS documents, exactly as on the B-BBEE side: a named sheet already
    // states its element for free. Fail-safe: null → BM25 routing stands.
    //
    // The ESG menu tells the model to report LOW confidence on a combined
    // municipal account, which drops the override — so a water-and-electricity
    // statement is never narrowed to one element here.
    const classification = standalone
      ? await classifyDocument(model, {
          filename: input.filename,
          markdown: input.markdown,
          raw_text: input.raw_text,
        }, { domain: 'esg' })
      : null;
    // A confident classification says what the document IS; below that, the
    // element the person filed it under beats a keyword guess (C1).
    const filedUnder = focusForInput(input.filename, options.focusByFile) ?? null;
    const elementOverride = routingElement(classification) ?? filedUnder ?? undefined;
    // Pass A named the document's type from the ESG skills menu: read it with
    // that type's spec, not with whatever keyword retrieval ranks first.
    const skillSpecIds = esgSkillSpecIds(classification, input);
    // Pass A says the document is NONE of the listed ESG types: it is read for
    // what it is (the open read below), never under the spec retrieval ranks
    // first. Only with the open read on; with it off, nothing changes. The
    // element the person filed the document under beats Pass A's OTHER (C1):
    // the document is read under that element, as it was before.
    const otherByClassifier = passAOther('esg', classification, { filedUnder });

    // A dashboard sheet — sites down the side, months across — is read by the
    // code, figure by figure. When it is, the flat spec pass is skipped for that
    // sheet: it can only answer "one fuel_litres, one site" for a sheet holding
    // forty-five, and those single answers were what turned a dashboard into a
    // wall of false "your documents disagree" conflicts.
    const matrix = sheetMatrixOf(input.tables);
    const monthlyTables = await extractEsgMonthlyTables(model, {
      filename: input.filename,
      sheetName,
      matrix,
      hidden: input.metadata?.sheet_hidden === true,
    });
    // Only a table of the measures the workbook keeps reads the sheet (or one
    // whose measure lines were held because it states no unit for them). One
    // whose lines are all money, tonnage or dates is reported as printed, and
    // the sheet's other readers still read it exactly as they did before.
    const monthly = monthlyReadStandsIn(monthlyTables) ? monthlyTables : null;
    const reportedOnly = monthly ? null : monthlyTables;
    // A vehicle's own fuel log — one tab per vehicle — names the vehicle once,
    // in the tab's name and title, and never on its rows.
    const loggedVehicle = vehicleOfSheet(sheetName, matrix);
    // A depot's monthly report — a row per vehicle under a title naming the
    // depot and the month — is that depot's figure for that month, added up by
    // the code. Asked only of a sheet whose top states a date, and never of one
    // vehicle's own log: that is the vehicle's month, not the depot's.
    const period = !monthly && !loggedVehicle && input.metadata?.sheet_hidden !== true && topOfSheetIsDated(matrix)
      ? await extractEsgPeriodSummary(model, {
        filename: input.filename,
        sheetName,
        matrix,
        rows: structuredRows(input.tables),
      })
      : null;
    // A HIDDEN sheet gets the code readers only, never a paid model read: hidden
    // tabs are mostly template copies and scratch work (a diesel report hides a
    // dozen), and what real data they hold is reached by the readers above.
    const readByCode = monthly ?? period;
    const flatRead = !readByCode && input.metadata?.sheet_hidden !== true;

    // A register that arrived as a spreadsheet: the model maps its columns
    // once, the code reads every row. Returns null for anything that is not a
    // register — PDFs, scans, narrative documents — which the spec pass below
    // still reads.
    const sheetTable = readByCode
      ? null
      : await extractEsgSheetTable(model, {
        filename: input.filename,
        rows: structuredRows(input.tables),
        sheetName,
        // Twenty tabs of one template are one question, asked once.
        template: loggedVehicle ? 'Vehicle fuel log' : undefined,
      });
    // Each fill is that vehicle's, or it could never reach the vehicle's month.
    if (sheetTable && loggedVehicle) {
      for (const value of sheetTable.values) {
        if (value.field === 'fleet_fuel_transaction_rows' && Array.isArray(value.value)) {
          value.value = fillsOfVehicle(value.value, loggedVehicle);
        }
      }
    }
    // A hidden sheet's register rows say so: scratch copies and old lists may
    // add to what is known about a record, never add a record of their own.
    if (sheetTable && input.metadata?.sheet_hidden === true) {
      for (const value of sheetTable.values) {
        if (Array.isArray(value.value)) {
          value.value = value.value.map((row) =>
            row && typeof row === 'object' ? { ...(row as Record<string, unknown>), [ROW_HIDDEN_KEY]: true } : row);
        }
      }
    }
    // A sheet the code read in full is not read again by the model: the flat
    // pass could only return a truncated copy of the same rows (Super Group's
    // 132-vehicle fleet master came back as 15) at the price of a paid call.
    const specResults = flatRead && !sheetTable && !otherByClassifier
      ? await extractDocument(model, {
        filename: input.filename,
        markdown: input.markdown,
        raw_text: input.raw_text,
        elementHint: sheetName,
      }, skillSpecIds ? { specIds: skillSpecIds, domain: 'esg' } : { elementOverride, domain: 'esg' })
      : ([] as DocumentExtraction[]);

    let results = [...specResults];
    // A policy typed under another element (an EE policy as an EE plan) that
    // no read took as a policy is read for its policy header as well.
    if (flatRead && !sheetName && !otherByClassifier && needsPolicyHeaderRead(input, classification, specResults)) {
      results.push(...await extractDocument(model, {
        filename: input.filename,
        markdown: input.markdown,
        raw_text: input.raw_text,
      }, { specIds: [POLICY_HEADER_SPEC_ID], domain: 'esg' }));
    }
    if (readByCode) results.push(readByCode);
    if (reportedOnly) results.push(reportedOnly);
    if (sheetTable) results.push(sheetTable);

    // The labelled cells the readers above leave: label/value pairs, small
    // summary blocks and pivots, a controlled document's header block, and —
    // on a sheet too large to carry its layout — the blocks above and beside
    // its table. The skill's wordings and one cached model question map their
    // labels; the code reads every value (esgSheetFacts.ts).
    if (sheetName && sheetFactsEnabled()) {
      const layout = sheetLayoutOf(input.tables);
      const grid = matrix ?? (layout.outside ? sparseMatrix(layout.outside) : undefined);
      if (grid) {
        const read: ReadSpan[] = [
          ...monthlyReadSpans(monthlyTables),
          ...(period ? [periodReadSpan(period)].filter((span): span is ReadSpan => span !== null) : []),
          // A register's rows are the register's (read by code or by the flat pass).
          ...(matrix && layout.region && (sheetTable || mainTableIsRegister(matrix, layout.region))
            ? [registerBodySpan(matrix, layout.region)]
            : []),
        ];
        const cellReads = await extractEsgSheetFacts(model, {
          filename: input.filename,
          sheetName,
          template: loggedVehicle ? 'Vehicle fuel log' : undefined,
          matrix: grid,
          read,
          specIds: [...new Set(results.map((result) => result.documentId))],
          hidden: input.metadata?.sheet_hidden === true,
        });
        if (cellReads) results = mergeCellReads(results, cellReads, [readByCode, reportedOnly, sheetTable]);
      }
    }
    // Agent loop (off by default): a cited second read of a hard document —
    // a scan, a skill's hard type, a low-confidence type, or one whose first
    // read missed a third of its required fields. It only fills gaps;
    // disagreements become exceptions; a failure returns the first read
    // untouched. Hard mode never sends a workbook sheet.
    // A standalone document no listed reader read anything from is an Other
    // document, read for its identity and facts (openRead.ts). Never a sheet.
    let otherDocument = false;
    if (standalone) {
      const open = await addOtherDocumentRead(model, input, results, {
        domain: 'esg',
        classifierLabel: classification?.documentType ?? null,
        byClassifier: otherByClassifier,
        // Pass A named a listed ESG type: it stays that type (the agent reads it).
        typed: Boolean(skillSpecIds),
      });
      results = open.results;
      otherDocument = open.other;
    }
    const typedPass = agentPass
      ? { ...agentPass, context: { ...agentPass.context, deterministic: [esgAgentTyping(input.filename, classification)] } }
      : null;
    if (typedPass && otherDocument) {
      // An Other document: the open skill's target, only when it read too little
      // (or a listed type its words clearly name, when Pass A did not call it OTHER).
      results = await agentOnOtherDocument(model, input, results, typedPass, 'esg', { byClassifier: otherByClassifier });
    } else if (typedPass) {
      results = await agentPassForDocument(model, input, results, typedPass);
    }

    // A workbook sheet's formula zeros are a template's, not readings.
    if (sheetName) results = results.map(templateZerosAsExceptions);

    done += 1;
    onProgress?.({ done, total, fileName: input.filename });
    return results;
  });

  const extractions: DocumentExtraction[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value) {
      extractions.push(
        ...result.value
          .map(notesAsExceptions)
          .map(namedUnitFiguresAsExceptions)
          .map(trailingMinusCreditsAsNegative)
          .map(unprintedValuesAsExceptions),
      );
    } else if (result.status === 'rejected') {
      // One unreadable file must not cost the user the rest of the case they
      // have already paid to extract.
      logger.error('ESG extraction failed for file', result.reason as Error, {
        file: inputs[result.index]?.filename,
      });
    }
  }

  // Two revisions of the same gathering workbook in one pack is as damaging to
  // an ESG number as to a B-BBEE one, and the detection is structural rather
  // than domain-specific, so it is the same function.
  const duplicateWorkbook = duplicateWorkbookException(inputs);
  if (duplicateWorkbook) {
    logger.warn('Multiple versions of the same workbook in one ESG pack', { detail: duplicateWorkbook });
    extractions.push({
      documentId: 'esg_case__duplicate_workbook',
      documentName: 'Uploaded document set',
      element: 'FINANCIAL',
      sourceFile: inputs[0]?.filename ?? '',
      // Values-free: it can never move a number, only explain one.
      values: [],
      missingFields: [],
      unexpectedFields: [],
      exceptions: [duplicateWorkbook],
    });
  }

  if (extractions.length === 0) return null;

  // Each bill is its own site × month figure, never a rival answer to every
  // other bill. Only the resolution sees the rows; the extractions handed back
  // keep the bill's own fields, which is what the user reads per document.
  const forResolution = extractions.map(withoutDocumentFacts).map(billAsMonthlyRows);
  const resolved = resolveCaseEntities(forResolution, {
    allFiles: inputs.map((input) => input.filename),
    // Registers from different sheets are halves of one record, not rival answers.
    additiveFields: ESG_REGISTER_FIELDS,
  });

  // Declared table first, one semantic pass over what it did not cover, then
  // the analyst's whole-case read — the same intelligence the B-BBEE path has,
  // because ESG is not the lesser product.
  const calculator = await mapEsgEntitiesToCalculatorWithSemantics(
    resolved,
    esgFieldElementIndex(forResolution),
    model,
  );

  const reviewFindings = await reviewCase(model, {
    payloadEntries: calculator.entries.map((entry) => ({
      key: entry.key, value: entry.value, sourceFiles: entry.sourceFiles,
    })),
    unmapped: calculator.unmapped,
    needsReview: calculator.needsReview.map((item) => ({ field: item.field, values: item.values })),
    unfilledKeys: unfilledEsgCalculatorKeys(calculator.payload),
    files: inputs.map((input) => input.filename),
  }, { domain: 'esg' });
  // Open facts that mean an ESG calculator input are PROPOSED on their
  // document as suggestions; never into the payload above.
  await proposeOpenMappings(model, extractions, 'esg');

  for (const finding of reviewFindings) {
    extractions[0]?.exceptions.push(
      `${finding.severity === 'error' ? 'Analyst review' : 'Analyst note'}: ${finding.finding}`
      + (finding.fix ? ` Fix: ${finding.fix}` : ''),
    );
  }

  logger.info('ESG case extraction complete', {
    files: inputs.length,
    documents: resolved.documentsExtracted,
    fields: Object.keys(resolved.fields).length,
    conflicts: resolved.conflicts.length,
    calculatorKeys: Object.keys(calculator.payload).length,
    registerRows: calculator.rows.length,
    heldForReview: calculator.needsReview.length,
  });

  return { ...resolved, model: model.name, domain: 'esg', extractions, calculator };
}

/**
 * The ESG element a workbook sheet name states, when it states one.
 *
 * Exposed so the routes can report what a pack looked like before any model
 * call is made — the free structure scan needs this and nothing else.
 */
export function esgElementForSheet(sheetName: string | undefined): EsgElement | null {
  return elementFromHint(sheetName, 'esg');
}
