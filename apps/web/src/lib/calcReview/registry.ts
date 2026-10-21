/**
 * Every scorecard the Calculation Review can show worked line by line against
 * its Empower toolkit — the scorecards whose toolkit has been checked line by
 * line, each kept so by an always-on parity gate.
 *
 * An entry carries what the page and the notes need: the sector code and
 * scorecard type the app (and the notes api) already use for it, its line map,
 * case adapter and referee (the same ones its parity gate uses), its reference
 * bundle (one Excel-scored synthetic company, loaded only when the scorecard
 * is opened) and the rulings it asks the expert for.
 *
 * The four FSC scorecards share one sector code and scorecard type ("FSC",
 * "Generic"; the sub-sector is a separate answer on the client), so their
 * line notes carry the sub-sector in the anchor, and rulings on a sheet the
 * four share are one entry, with one note thread.
 */
import { adaptToolkitCase } from '@toolkit/test/parity/caseAdapter';
import { adaptRcogpQseToolkitCase } from '@toolkit/test/parity/caseAdapter.rcogp_qse';
import { adaptIctGenericCase } from '@toolkit/test/parity/caseAdapter.ict_generic';
import { adaptIctQseToolkitCase } from '@toolkit/test/parity/caseAdapter.ict_qse';
import { adaptAgriGenericCase } from '@toolkit/test/parity/caseAdapter.agri_generic';
import { adaptFscToolkitCase } from '@toolkit/test/parity/caseAdapter.fsc';
import { RCOGP_GENERIC_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/rcogp-generic';
import { RCOGP_QSE_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/rcogp-qse';
import { ICT_GENERIC_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/ict-generic';
import { ICT_QSE_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/ict-qse';
import { AGRI_GENERIC_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/agri-generic';
import {
  RCOGP_GENERIC_LINES,
  RCOGP_GENERIC_TOTAL_ROWS,
  referee as rcogpGenericReferee,
  summaryValue,
  type ParityLine,
} from '@toolkit/lib/parity/toolkitParity';
import {
  RCOGP_QSE_LINES,
  RCOGP_QSE_TOTAL_ROWS,
  rcogpQseReferee,
  rcogpQseSummaryValue,
} from '@toolkit/lib/parity/toolkitParity.rcogp_qse';
import {
  ICT_GENERIC_LINES,
  ICT_GENERIC_TOTAL_ROWS,
  ictSummaryValue,
  refereeIctGeneric,
} from '@toolkit/lib/parity/toolkitParity.ict_generic';
import { ICT_QSE_LINES, ICT_QSE_TOTAL_ROWS, refereeIctQse } from '@toolkit/lib/parity/toolkitParity.ict_qse';
import {
  AGRI_GENERIC_LINES,
  AGRI_GENERIC_TOTAL_ROWS,
  refereeAgriGeneric,
} from '@toolkit/lib/parity/toolkitParity.agri_generic';
import {
  fscConfigFor,
  fscLinesFor,
  fscReferee,
  fscTotalRowsFor,
  summaryValue as fscSummaryValue,
} from '@toolkit/lib/parity/toolkitParity.fsc';
import { RCOGP_GENERIC_DECISIONS, type ReviewDecision } from './decisions';
import { RCOGP_QSE_DECISIONS } from './decisions.rcogp_qse';
import { ICT_GENERIC_DECISIONS } from './decisions.ict_generic';
import { ICT_QSE_DECISIONS } from './decisions.ict_qse';
import { AGRI_GENERIC_DECISIONS } from './decisions.agri_generic';
import {
  FSC_BANKS_DECISIONS,
  FSC_LTI_DECISIONS,
  FSC_OTHERS_DECISIONS,
  FSC_STI_DECISIONS,
} from './decisions.fsc';
import {
  lineAnchor,
  workScorecard,
  type ReferenceFile,
  type WorkedLineSpec,
  type WorkedScorecard,
  type WorkedSpec,
} from './workedScorecard';

export interface ReviewScorecard {
  /** Stable id of the entry (also the reference bundle's file name). */
  id: string;
  /** The sector group it is listed under in the picker. */
  sector: string;
  /** The sector code's full name. */
  sectorName: string;
  /** The scorecard within its sector, as the picker shows it. */
  name: string;
  /** Sector and scorecard together, for headings. */
  title: string;
  /** The Empower toolkit it was checked against, in a sentence. */
  toolkit: string;
  sectorCode: string;
  scorecardType: string;
  /** Prefix of every line note's anchor ('' where the code and type are this scorecard's alone). */
  anchorPrefix: string;
  /** Anything the reviewer should know about the sample before reading it. */
  note?: string;
  decisions: ReviewDecision[];
  spec: WorkedSpec;
  /** The reference bundle, fetched only when the scorecard is opened. */
  load: () => Promise<unknown>;
}

const single = (l: ParityLine): WorkedLineSpec => ({ rows: [l.row], pillar: l.pillar, label: l.label, names: l.names });

const fscSub = (s: Parameters<WorkedSpec['config']>[0]) => s.client.fscSubSector ?? 'Others';

function fscSpec(anchorPrefix: string): WorkedSpec {
  return {
    sectorCode: 'FSC',
    scorecardType: 'Generic',
    anchorPrefix,
    adapt: adaptFscToolkitCase,
    config: (s) => fscConfigFor(fscSub(s)),
    lines: (s) => fscLinesFor(fscSub(s), Boolean(s.client.fscReinsurer), s.afs?.stiProductLines).map(single),
    totals: (s) => fscTotalRowsFor(fscSub(s)),
    referee: fscReferee,
    summaryValue: fscSummaryValue,
  };
}

const FSC_SECTOR_NAME = 'Financial Sector Code';
const FSC_TOOLKIT = 'the Empower FSC toolkit (template version 1.0)';

export const REVIEW_SCORECARDS: ReviewScorecard[] = [
  {
    id: 'rcogp-generic',
    sector: 'RCOGP',
    sectorName: 'Revised Codes of Good Practice',
    name: 'Generic',
    title: 'RCOGP Generic',
    toolkit: 'the Empower RCOGP Generic toolkit',
    sectorCode: 'RCOGP',
    scorecardType: 'Generic',
    anchorPrefix: '',
    decisions: RCOGP_GENERIC_DECISIONS,
    spec: {
      sectorCode: 'RCOGP',
      scorecardType: 'Generic',
      adapt: adaptToolkitCase,
      config: () => RCOGP_GENERIC_CALCULATOR_CONFIG,
      lines: () => RCOGP_GENERIC_LINES.map(single),
      totals: () => RCOGP_GENERIC_TOTAL_ROWS,
      referee: rcogpGenericReferee,
      summaryValue,
    },
    load: () => import('./reference/rcogp-generic.json'),
  },
  {
    id: 'rcogp-qse',
    sector: 'RCOGP',
    sectorName: 'Revised Codes of Good Practice',
    name: 'QSE',
    title: 'RCOGP QSE',
    toolkit: 'the Empower RCOGP QSE toolkit (version 1.1)',
    sectorCode: 'RCOGP',
    scorecardType: 'QSE',
    anchorPrefix: '',
    decisions: RCOGP_QSE_DECISIONS,
    spec: {
      sectorCode: 'RCOGP',
      scorecardType: 'QSE',
      adapt: adaptRcogpQseToolkitCase,
      config: () => RCOGP_QSE_CALCULATOR_CONFIG,
      lines: () => RCOGP_QSE_LINES.map(single),
      totals: () => RCOGP_QSE_TOTAL_ROWS,
      referee: rcogpQseReferee,
      summaryValue: rcogpQseSummaryValue,
    },
    load: () => import('./reference/rcogp-qse.json'),
  },
  {
    id: 'ict-generic',
    sector: 'ICT',
    sectorName: 'ICT Sector Code',
    name: 'Generic',
    title: 'ICT Generic',
    toolkit: 'the Empower ICT Generic toolkit (template version 1.4)',
    sectorCode: 'ICT',
    scorecardType: 'Generic',
    anchorPrefix: '',
    decisions: ICT_GENERIC_DECISIONS,
    spec: {
      sectorCode: 'ICT',
      scorecardType: 'Generic',
      adapt: adaptIctGenericCase,
      config: () => ICT_GENERIC_CALCULATOR_CONFIG,
      lines: () => ICT_GENERIC_LINES,
      totals: () => ICT_GENERIC_TOTAL_ROWS,
      referee: refereeIctGeneric,
      summaryValue: ictSummaryValue,
    },
    load: () => import('./reference/ict-generic.json'),
  },
  {
    id: 'ict-qse',
    sector: 'ICT',
    sectorName: 'ICT Sector Code',
    name: 'QSE',
    title: 'ICT QSE',
    toolkit: 'the Empower ICT QSE toolkit (template version 1.1)',
    sectorCode: 'ICT',
    scorecardType: 'QSE',
    anchorPrefix: '',
    decisions: ICT_QSE_DECISIONS,
    spec: {
      sectorCode: 'ICT',
      scorecardType: 'QSE',
      adapt: adaptIctQseToolkitCase,
      config: () => ICT_QSE_CALCULATOR_CONFIG,
      lines: () => ICT_QSE_LINES,
      totals: () => ICT_QSE_TOTAL_ROWS,
      referee: refereeIctQse,
      summaryValue,
    },
    load: () => import('./reference/ict-qse.json'),
  },
  {
    id: 'agri-generic',
    sector: 'AgriBEE',
    sectorName: 'AgriBEE Sector Code',
    name: 'Generic',
    title: 'AgriBEE Generic',
    toolkit: 'the Empower AgriBEE Generic toolkit (master version 1.0.1)',
    sectorCode: 'AGRI',
    scorecardType: 'Generic',
    anchorPrefix: '',
    note: 'Skills lines are compared before Okiru rounds them to the cent for display, as the AgriBEE check does.',
    decisions: AGRI_GENERIC_DECISIONS,
    spec: {
      sectorCode: 'AGRI',
      scorecardType: 'Generic',
      adapt: adaptAgriGenericCase,
      config: () => AGRI_GENERIC_CALCULATOR_CONFIG,
      lines: () => AGRI_GENERIC_LINES.map(single),
      totals: () => AGRI_GENERIC_TOTAL_ROWS,
      referee: refereeAgriGeneric,
      summaryValue,
      exact: true,
    },
    load: () => import('./reference/agri-generic.json'),
  },
  {
    id: 'fsc-others',
    sector: 'FSC',
    sectorName: FSC_SECTOR_NAME,
    name: 'Others, incl. reinsurers',
    title: 'FSC Others (FS700)',
    toolkit: FSC_TOOLKIT,
    sectorCode: 'FSC',
    scorecardType: 'Generic',
    anchorPrefix: 'others.',
    note:
      'The sample company is not a reinsurer. A reinsurer is scored on this scorecard with two differences: socio-economic development at 0.7% of NPAT, and the Fundisa Retail Fund as a base line instead of a bonus. Seven reinsurers were checked against the toolkit, and all match.',
    decisions: FSC_OTHERS_DECISIONS,
    spec: fscSpec('others.'),
    load: () => import('./reference/fsc-others.json'),
  },
  {
    id: 'fsc-banks',
    sector: 'FSC',
    sectorName: FSC_SECTOR_NAME,
    name: 'Banks',
    title: 'FSC Banks (FS701)',
    toolkit: FSC_TOOLKIT,
    sectorCode: 'FSC',
    scorecardType: 'Generic',
    anchorPrefix: 'banks.',
    decisions: FSC_BANKS_DECISIONS,
    spec: fscSpec('banks.'),
    load: () => import('./reference/fsc-banks.json'),
  },
  {
    id: 'fsc-lti',
    sector: 'FSC',
    sectorName: FSC_SECTOR_NAME,
    name: 'Long-term insurers',
    title: 'FSC Long-term Insurers (FS702)',
    toolkit: FSC_TOOLKIT,
    sectorCode: 'FSC',
    scorecardType: 'Generic',
    anchorPrefix: 'lti.',
    note:
      'The sample company reports other executive and senior management together and employs no senior, middle or junior managers, so the toolkit moves those bands\' 11 points to other executive management, which then carries 14 (10 for black and 4 for black women, at targets of 75% and 38%), and management control stays out of 21. The senior, middle and junior management lines carry no points on this scorecard. The 4 points a combined band loses (under "Rulings needed") are lost only where middle or junior managers are employed, so this sample loses none.',
    decisions: FSC_LTI_DECISIONS,
    spec: fscSpec('lti.'),
    load: () => import('./reference/fsc-lti.json'),
  },
  {
    id: 'fsc-sti',
    sector: 'FSC',
    sectorName: FSC_SECTOR_NAME,
    name: 'Short-term insurers',
    title: 'FSC Short-term Insurers (FS703)',
    toolkit: FSC_TOOLKIT,
    sectorCode: 'FSC',
    scorecardType: 'Generic',
    anchorPrefix: 'sti.',
    note: 'The sample company offers personal lines only, so its access-to-financial-services lines are the personal products and personal policies.',
    decisions: FSC_STI_DECISIONS,
    spec: fscSpec('sti.'),
    load: () => import('./reference/fsc-sti.json'),
  },
];

export const DEFAULT_REVIEW_SCORECARD = 'rcogp-generic';

export function reviewScorecard(id: string): ReviewScorecard | undefined {
  return REVIEW_SCORECARDS.find((s) => s.id === id);
}

/** The worked scorecards filed under one sector code and scorecard type (FSC has four). */
export function reviewScorecardsFor(sectorCode: string, scorecardType: string): ReviewScorecard[] {
  return REVIEW_SCORECARDS.filter((s) => s.sectorCode === sectorCode && s.scorecardType === scorecardType);
}

/** True when this sector code and scorecard type have a toolkit-checked worked scorecard. */
export function hasWorkedScorecard(sectorCode: string, scorecardType: string): boolean {
  return reviewScorecardsFor(sectorCode, scorecardType).length > 0;
}

/** The picker's groups, in registry order. */
export function reviewScorecardGroups(): Array<{ sector: string; sectorName: string; scorecards: ReviewScorecard[] }> {
  const groups: Array<{ sector: string; sectorName: string; scorecards: ReviewScorecard[] }> = [];
  for (const s of REVIEW_SCORECARDS) {
    const g = groups.find((x) => x.sector === s.sector);
    if (g) g.scorecards.push(s);
    else groups.push({ sector: s.sector, sectorName: s.sectorName, scorecards: [s] });
  }
  return groups;
}

/** The note anchor of a ruling on this scorecard. */
export function decisionAnchor(d: ReviewDecision): string {
  return `indicator:decision-${d.id}`;
}

/** The note anchor of the scorecard as a whole. */
export function scorecardAnchor(entry: ReviewScorecard): string {
  return `pillar:${entry.anchorPrefix}scorecard`;
}

/** Every note anchor a scorecard renders: its lines, its rulings and the scorecard as a whole. */
export function renderedAnchors(entry: ReviewScorecard, worked: WorkedScorecard | null): Set<string> {
  const anchors = new Set<string>([scorecardAnchor(entry)]);
  for (const p of worked?.pillars ?? []) for (const l of p.lines) anchors.add(l.anchor);
  for (const d of entry.decisions) anchors.add(decisionAnchor(d));
  return anchors;
}

/**
 * Whether a note belongs to one of the registered scorecards under this code
 * and type. Line anchors are recognised by shape (the lines are only known once
 * a reference is loaded); rulings and scorecard notes by name.
 */
export function anchorIsRegistered(anchor: string, sectorCode: string, scorecardType: string): boolean {
  return reviewScorecardsFor(sectorCode, scorecardType).some(
    (e) =>
      anchor === scorecardAnchor(e) ||
      e.decisions.some((d) => decisionAnchor(d) === anchor) ||
      new RegExp(`^indicator:${e.anchorPrefix.replace('.', '\\.')}line-\\d+(-\\d+)*$`).test(anchor),
  );
}

async function loadReference(entry: ReviewScorecard): Promise<ReferenceFile> {
  const mod = (await entry.load()) as { default?: unknown };
  return (mod.default ?? mod) as ReferenceFile;
}

/** Load a scorecard's reference bundle and work it with the live calculator. */
export async function loadWorkedScorecard(id: string): Promise<WorkedScorecard> {
  const entry = reviewScorecard(id);
  if (!entry) throw new Error(`No worked scorecard for ${id}`);
  return workScorecard(entry.spec, await loadReference(entry));
}

export { lineAnchor };
