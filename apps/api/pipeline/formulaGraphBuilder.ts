/**
 * Formula Graph Builder
 *
 * Extracts Excel cell formulas and their inter-cell dependencies,
 * building a directed acyclic graph (DAG) that preserves the full
 * calculation logic of a B-BBEE toolkit workbook.
 *
 * Handles large (20MB+) workbooks via:
 *   - Smart sheet selection: only scorecard/summary sheets get full formula scan
 *   - Sparse iteration: visits only populated cells, not the full bounding box
 *   - Cell budget: hard cap prevents runaway memory on data-heavy sheets
 *   - Two-pass read: first pass without formulas (fast) to classify sheets,
 *     second pass with formulas only on relevant sheets
 */

import * as XLSX from 'xlsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CellNode {
  address: string;
  sheet: string;
  column: string;
  row: number;
  formula: string | null;
  value: unknown;
  dependsOn: string[];
  semanticTag: SemanticTag | null;
}

export type SemanticTag =
  | { pillar: string; indicator: string; role: 'target' | 'actual' | 'score' | 'weight' | 'input' | 'label'; description?: string }
  | { pillar: string; role: 'pillar_total' | 'sub_minimum'; description?: string }
  | { role: 'total_score' | 'bee_level' | 'recognition' | 'client_info' | 'financial'; description?: string };

export interface FormulaGraph {
  cells: Record<string, CellNode>;
  nodes: string[];
  edges: Array<{ from: string; to: string }>;
  inputs: string[];
  outputs: string[];
  sheets: string[];
  processedSheets: string[];
  skippedSheets: string[];
  defaultSheet: string | null;
  metadata: {
    totalCells: number;
    formulaCells: number;
    inputCells: number;
    edgeCount: number;
    hasCycles: boolean;
    cyclePaths: string[][];
  };
}

export interface GraphBuildOptions {
  /** Maximum cells to process across ALL sheets. Default 200_000. */
  maxTotalCells?: number;
  /** Maximum cells per individual sheet. Default 50_000. */
  maxCellsPerSheet?: number;
  /** Only process sheets whose names match these patterns. null = auto-detect. */
  sheetFilter?: RegExp[] | null;
  /** Skip sheets whose names match these patterns. */
  sheetExclude?: RegExp[];
  /** Skip cycle detection (faster for huge graphs). Default false. */
  skipCycleDetection?: boolean;
}

const DEFAULT_OPTIONS: Required<GraphBuildOptions> = {
  maxTotalCells: 200_000,
  maxCellsPerSheet: 50_000,
  sheetFilter: null,
  sheetExclude: [
    /^(chart|image|pic|graph|macro|vba|module|dialog)/i,
  ],
  skipCycleDetection: false,
};

// ---------------------------------------------------------------------------
// Cell address parsing
// ---------------------------------------------------------------------------

const CELL_REF_RE = /(?:(?:'[^']+'|[A-Za-z0-9_]+)!)?\$?[A-Z]{1,3}\$?[1-9][0-9]*/g;
const RANGE_RE = /(?:(?:'[^']+'|[A-Za-z0-9_]+)!)?\$?[A-Z]{1,3}\$?[1-9][0-9]*:\$?[A-Z]{1,3}\$?[1-9][0-9]*/g;

function colLetterToIndex(col: string): number {
  let n = 0;
  for (let i = 0; i < col.length; i++) {
    n = n * 26 + (col.charCodeAt(i) - 64);
  }
  return n;
}

function indexToColLetter(idx: number): string {
  let s = '';
  while (idx > 0) {
    const rem = (idx - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    idx = Math.floor((idx - 1) / 26);
  }
  return s;
}

function parseAddress(raw: string): { sheet: string | null; col: string; row: number } | null {
  const cleaned = raw.replace(/\$/g, '');
  let sheet: string | null = null;
  let cellPart = cleaned;

  if (cleaned.includes('!')) {
    const parts = cleaned.split('!');
    sheet = parts[0].replace(/^'|'$/g, '');
    cellPart = parts[1];
  }

  const m = cellPart.match(/^([A-Z]{1,3})([1-9][0-9]*)$/);
  if (!m) return null;

  return { sheet, col: m[1], row: parseInt(m[2], 10) };
}

function canonicalAddress(sheet: string, col: string, row: number): string {
  return `${sheet}!${col}${row}`;
}

function normalizeAddress(raw: string, defaultSheet: string): string {
  const parsed = parseAddress(raw);
  if (!parsed) return raw;
  return canonicalAddress(parsed.sheet || defaultSheet, parsed.col, parsed.row);
}

function expandRange(rangeStr: string, defaultSheet: string, maxCells = 500): string[] {
  const cleaned = rangeStr.replace(/\$/g, '');
  let sheet = defaultSheet;
  let rangePart = cleaned;

  if (cleaned.includes('!')) {
    const parts = cleaned.split('!');
    sheet = parts[0].replace(/^'|'$/g, '');
    rangePart = parts[1];
  }

  const sides = rangePart.split(':');
  if (sides.length !== 2) return [];

  const start = parseAddress(sides[0]);
  const end = parseAddress(sides[1]);
  if (!start || !end) return [];

  const startCol = colLetterToIndex(start.col);
  const endCol = colLetterToIndex(end.col);
  const startRow = start.row;
  const endRow = end.row;

  const totalPossible = (Math.abs(endCol - startCol) + 1) * (Math.abs(endRow - startRow) + 1);
  if (totalPossible > maxCells) {
    return [
      canonicalAddress(sheet, indexToColLetter(Math.min(startCol, endCol)), Math.min(startRow, endRow)),
      canonicalAddress(sheet, indexToColLetter(Math.max(startCol, endCol)), Math.max(startRow, endRow)),
    ];
  }

  const cells: string[] = [];
  for (let c = Math.min(startCol, endCol); c <= Math.max(startCol, endCol); c++) {
    for (let r = Math.min(startRow, endRow); r <= Math.max(startRow, endRow); r++) {
      cells.push(canonicalAddress(sheet, indexToColLetter(c), r));
    }
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Formula dependency extraction
// ---------------------------------------------------------------------------

function extractDependencies(formula: string, currentSheet: string): string[] {
  if (!formula) return [];
  const deps = new Set<string>();

  const rangeMatches = formula.match(RANGE_RE) || [];
  for (const rangeRef of rangeMatches) {
    for (const addr of expandRange(rangeRef, currentSheet)) {
      deps.add(addr);
    }
  }

  const stripped = formula.replace(RANGE_RE, '');
  const cellMatches = stripped.match(CELL_REF_RE) || [];
  for (const ref of cellMatches) {
    deps.add(normalizeAddress(ref, currentSheet));
  }

  return Array.from(deps).sort();
}

// ---------------------------------------------------------------------------
// Semantic tagging
// ---------------------------------------------------------------------------

const PILLAR_KEYWORDS: Record<string, RegExp[]> = {
  ownership: [/ownership/i, /voting\s*right/i, /economic\s*interest/i, /net\s*value/i, /shareholder/i, /^own/i],
  managementControl: [/management\s*control/i, /board/i, /executive/i, /^mc\b/i],
  employmentEquity: [/employment\s*equity/i, /occupational\s*level/i, /^ee\b/i, /senior\s*manage/i, /middle\s*manage/i, /junior\s*manage/i, /disabled/i],
  skillsDevelopment: [/skills?\s*develop/i, /training/i, /learnership/i, /bursary/i, /leviable/i, /^sd\b/i],
  preferentialProcurement: [/preferential\s*proc/i, /procurement/i, /supplier/i, /tmps/i, /^pp\b/i, /recognition\s*level/i],
  enterpriseSupplierDevelopment: [/enterprise.*develop/i, /supplier.*develop/i, /^esd\b/i, /^ed\b/i],
  socioEconomicDevelopment: [/socio[\s-]*economic/i, /^sed\b/i, /social\s*develop/i, /csi/i],
  yesInitiative: [/yes\s*init/i, /youth\s*employ/i, /^yes\b/i],
};

const ROLE_KEYWORDS: Record<string, RegExp[]> = {
  target: [/target/i, /compliance\s*target/i, /optimum/i],
  actual: [/actual/i, /measured/i, /achieved/i, /verified/i],
  score: [/score/i, /points?\s*(scored|achieved|obtained)/i, /weighted/i],
  weight: [/weight/i, /weighting/i, /max\s*point/i],
  sub_minimum: [/sub[\s-]*minimum/i, /threshold/i],
  pillar_total: [/total\s*(point|score)/i, /element\s*total/i, /pillar\s*total/i],
  total_score: [/^total$/i, /grand\s*total/i, /overall\s*score/i, /total\s*b-?bbee/i],
  bee_level: [/b-?bbee\s*level/i, /contributor\s*level/i, /recognition\s*level/i, /^level$/i],
};

// Field type patterns for input cell detection
const FINANCIAL_PATTERNS = [
  /revenue|turnover|sales|income/i,
  /npat|net\s*profit|profit\s*after\s*tax/i,
  /payroll|remuneration|salaries|wages|leviable/i,
  /spend|expenditure|expenses?|costs?/i,
  /amount|value|price/i,
  /rand|\br\b|ZAR/i,
  /million|billion|thousand/i,
  /tmps|total\s*measured\s*procurement/i,
];

const PERCENTAGE_PATTERNS = [
  /percentage|percent|\%/i,
  /ownership|shareholding|equity|stake/i,
  /voting\s*rights/i,
  /black\s*ownership|black\s*held/i,
  /management\s*control|board/i,
  /exempt\s*micro/i,
  /qualifying\s*small/i,
];

const COUNT_PATTERNS = [
  /number\s*of|count|total\s*employees?/i,
  /headcount|staff|workforce/i,
  /black\s*employees?/i,
  /senior|middle|junior\s*management/i,
  /employees\s*with\s*disabilities/i,
];

const FINANCIAL_KEYWORDS = [
  'revenue', 'turnover', 'npat', 'profit', 'payroll', 'spend', 'leviable',
  'expenditure', 'amount', 'value', 'cost', 'income', 'sales', 'tmps',
  'measured procurement', 'total measured procurement spend'
];

/**
 * Enhanced cell tagging with comprehensive field type detection
 */
function tagCell(sheetName: string, cellAddress: string, value: unknown, neighborLabels: string[]): SemanticTag | null {
  const context = [sheetName, ...neighborLabels].join(' ');
  // Build description from neighbor labels for entity matching
  const description = neighborLabels.filter(l => l && l.trim()).join(' | ').substring(0, 120).trim() || sheetName;

  // Field type detection from context
  const isFinancialValue = typeof value === 'number' && (
    FINANCIAL_PATTERNS.some(p => p.test(context)) ||
    FINANCIAL_KEYWORDS.some(k => context.toLowerCase().includes(k))
  );

  const isPercentageValue = typeof value === 'number' && (
    PERCENTAGE_PATTERNS.some(p => p.test(context)) ||
    (value >= 0 && value <= 100 && /percent|%/i.test(context))
  );

  const isCountValue = typeof value === 'number' && COUNT_PATTERNS.some(p => p.test(context));

  // Detect if this is a numeric input cell (not a calculated value)
  const isNumericInput = typeof value === 'number' && (
    isFinancialValue || isPercentageValue || isCountValue ||
    // Check if neighbor labels suggest this is an input field
    neighborLabels.some(l => /input|enter|value|data/i.test(l))
  );

  let detectedPillar: string | null = null;
  for (const [pillar, patterns] of Object.entries(PILLAR_KEYWORDS)) {
    if (patterns.some(p => p.test(context))) {
      detectedPillar = pillar;
      break;
    }
  }

  for (const [role, patterns] of Object.entries(ROLE_KEYWORDS)) {
    if (patterns.some(p => p.test(context))) {
      if (role === 'total_score' || role === 'bee_level' || role === 'recognition') {
        return { role: role as 'total_score' | 'bee_level' | 'recognition', description };
      }
      if (role === 'pillar_total' || role === 'sub_minimum') {
        if (detectedPillar) {
          return { pillar: detectedPillar, role: role as 'pillar_total' | 'sub_minimum', description };
        }
      }
      if (detectedPillar && (role === 'target' || role === 'actual' || role === 'score' || role === 'weight')) {
        return { pillar: detectedPillar, indicator: context.substring(0, 60).trim(), role, description };
      }
    }
  }

  if (detectedPillar) {
    // Enhanced role detection based on field type
    let role: SemanticTag['role'] = isNumericInput ? 'input' : 'label';

    // If we have a numeric value with financial/percentage patterns, mark as input
    if (isNumericInput) {
      role = 'input';
    }

    return { pillar: detectedPillar, indicator: context.substring(0, 60).trim(), role, description };
  }

  // Tag financial cells even without pillar detection
  if (isFinancialValue || isPercentageValue || isCountValue) {
    // Try to infer pillar from context
    let inferredPillar: string | null = null;
    if (/ownership|shareholding|equity|voting/i.test(context)) {
      inferredPillar = 'ownership';
    } else if (/management|board|executive/i.test(context)) {
      inferredPillar = 'managementControl';
    } else if (/skills|training|learnership|bursary/i.test(context)) {
      inferredPillar = 'skillsDevelopment';
    } else if (/procurement|supplier|TMPS|measured.*procurement/i.test(context)) {
      inferredPillar = 'preferentialProcurement';
    } else if (/enterprise|esd|supplier.*develop/i.test(context)) {
      inferredPillar = 'enterpriseSupplierDevelopment';
    } else if (/socio|sed|social|csi/i.test(context)) {
      inferredPillar = 'socioEconomicDevelopment';
    } else if (/yes|youth.*employ/i.test(context)) {
      inferredPillar = 'yesInitiative';
    }

    if (inferredPillar) {
      return { pillar: inferredPillar, indicator: context.substring(0, 60).trim(), role: 'input', description };
    }

    // For General Information sheet or core financial metrics - tag as financials pillar input
    if (/general\s*information|client\s*information|financials/i.test(sheetName) ||
        /revenue|turnover|npat|net\s*profit|payroll|leviable|tmps|total.*measured.*procurement/i.test(context)) {
      return { pillar: 'financials', indicator: context.substring(0, 60).trim(), role: 'input', description };
    }
  }

  // Specific patterns for core financial fields - ensure they get tagged as financials pillar inputs
  if (/revenue|turnover|npat|net\s*profit|payroll|leviable|tmps|total.*measured.*procurement/i.test(context)) {
    // Check if this is in a general/client info sheet - these are always financial inputs
    if (/general\s*information|client\s*information|financials/i.test(sheetName)) {
      return { pillar: 'financials', indicator: context.substring(0, 60).trim(), role: 'input', description };
    }
    // Otherwise tag as financial role (backward compatibility)
    return { role: 'financial', description };
  }

  if (/company|client|entity|registration|vat|tax/i.test(context)) return { role: 'client_info', description };

  // Tag numeric input cells in scorecard sheets even without explicit pillar
  if (isNumericInput && /score|element|indicator/i.test(sheetName)) {
    return { role: 'input', description };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Cycle detection
// ---------------------------------------------------------------------------

function detectCycles(nodes: string[], edges: Array<{ from: string; to: string }>): string[][] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n, []);
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const n of nodes) color.set(n, WHITE);

  const cycles: string[][] = [];
  const path: string[] = [];

  function dfs(u: string): void {
    color.set(u, GRAY);
    path.push(u);
    for (const v of adj.get(u) || []) {
      if (color.get(v) === GRAY) {
        const cycleStart = path.indexOf(v);
        if (cycleStart >= 0) cycles.push(path.slice(cycleStart).concat(v));
      } else if (color.get(v) === WHITE) {
        dfs(v);
      }
    }
    path.pop();
    color.set(u, BLACK);
  }

  for (const n of nodes) {
    if (color.get(n) === WHITE) dfs(n);
  }
  return cycles;
}

// ---------------------------------------------------------------------------
// Topological sort (Kahn's algorithm)
// ---------------------------------------------------------------------------

export function topologicalSort(nodes: string[], edges: Array<{ from: string; to: string }>): string[] | null {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) { inDegree.set(n, 0); adj.set(n, []); }
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
  }

  const queue: string[] = [];
  for (const [n, deg] of inDegree) { if (deg === 0) queue.push(n); }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    sorted.push(u);
    for (const v of adj.get(u) || []) {
      const nd = (inDegree.get(v) || 1) - 1;
      inDegree.set(v, nd);
      if (nd === 0) queue.push(v);
    }
  }
  return sorted.length === nodes.length ? sorted : null;
}

// ---------------------------------------------------------------------------
// Sheet classification
// ---------------------------------------------------------------------------

/** High-priority sheets: always process these (they contain calculations). */
const HIGH_PRIORITY_PATTERNS = [
  /scorecard/i, /summary/i, /dashboard/i, /result/i,
  /b-?bbee/i, /^calc/i, /calculate/i, /cover/i,
  /^instruction/i, /general\s*info/i, /measured\s*entity/i,
];

/** Medium-priority: process if they are small enough. */
const MEDIUM_PRIORITY_PATTERNS = [
  /ownership/i, /management/i, /skill/i, /procurement/i,
  /esd/i, /sed/i, /yes/i, /level/i, /financial/i, /import/i,
  /client/i, /entity/i, /enterprise/i, /socio/i,
];

/** Patterns that identify large data-dump sheets we should limit or skip. */
const DATA_SHEET_PATTERNS = [
  /^data\b/i, /raw\s*data/i, /^list/i, /database/i,
  /lookup/i, /reference/i, /^sheet\d+$/i, /^drop/i,
];

type SheetCategory = 'high' | 'medium' | 'data' | 'unknown';

function classifySheet(name: string, cellCount: number): SheetCategory {
  const lower = name.toLowerCase().trim();
  if (DATA_SHEET_PATTERNS.some(p => p.test(lower))) return 'data';
  if (cellCount > 10_000) return 'data';
  if (HIGH_PRIORITY_PATTERNS.some(p => p.test(lower))) return 'high';
  if (MEDIUM_PRIORITY_PATTERNS.some(p => p.test(lower))) return cellCount <= 5_000 ? 'medium' : 'data';
  if (cellCount <= 3_000) return 'unknown';
  return 'data';
}

/**
 * Count populated cells in a worksheet WITHOUT iterating the full range.
 * Worksheets store cells as object keys like "A1", "B2", etc.
 */
function countPopulatedCells(ws: XLSX.WorkSheet): number {
  let count = 0;
  for (const key of Object.keys(ws)) {
    if (key[0] !== '!') count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Sparse cell iterator
// ---------------------------------------------------------------------------

/**
 * Iterate only the cells that actually exist in the sheet object,
 * rather than walking the full bounding-box range. This is the
 * critical optimisation for large workbooks.
 */
function* iterateSparseSheet(ws: XLSX.WorkSheet): Generator<{ key: string; cell: XLSX.CellObject; r: number; c: number }> {
  for (const key of Object.keys(ws)) {
    if (key[0] === '!') continue;
    const decoded = XLSX.utils.decode_cell(key);
    yield { key, cell: ws[key] as XLSX.CellObject, r: decoded.r, c: decoded.c };
  }
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildFormulaGraph(buffer: Buffer, filename: string, opts?: GraphBuildOptions): FormulaGraph {
  const o = { ...DEFAULT_OPTIONS, ...opts };

  // --- Pass 1: fast read WITHOUT formulas to classify sheets ----------------
  const wbFast = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellStyles: false });
  const sheetNames = wbFast.SheetNames;
  const defaultSheet = sheetNames[0] || 'Sheet1';

  const sheetInfos: Array<{ name: string; cells: number; category: SheetCategory; include: boolean }> = [];
  for (const name of sheetNames) {
    if (o.sheetExclude.some(p => p.test(name))) {
      sheetInfos.push({ name, cells: 0, category: 'data', include: false });
      continue;
    }
    const ws = wbFast.Sheets[name];
    const cellCount = ws ? countPopulatedCells(ws) : 0;
    const category = classifySheet(name, cellCount);

    let include: boolean;
    if (o.sheetFilter) {
      include = o.sheetFilter.some(p => p.test(name));
    } else {
      include = category === 'high' || category === 'medium' || (category === 'unknown' && cellCount <= 3_000);
    }
    sheetInfos.push({ name, cells: cellCount, category, include });
  }

  const sheetsToProcess = sheetInfos.filter(s => s.include).map(s => s.name);
  const skippedSheets = sheetInfos.filter(s => !s.include).map(s => s.name);

  // --- Pass 2: read only selected sheets WITH formulas ---------------------
  const wbFormula = XLSX.read(buffer, {
    type: 'buffer',
    cellFormula: true,
    cellStyles: false,
    sheets: sheetsToProcess,
  });

  const cells: Record<string, CellNode> = {};
  const edgeSet = new Set<string>();
  let totalProcessed = 0;

  for (const sheetName of sheetsToProcess) {
    const ws = wbFormula.Sheets[sheetName];
    if (!ws) continue;

    let sheetProcessed = 0;

    for (const { cell, r, c } of iterateSparseSheet(ws)) {
      if (sheetProcessed >= o.maxCellsPerSheet || totalProcessed >= o.maxTotalCells) break;

      const col = XLSX.utils.encode_col(c);
      const row = r + 1;
      const canonical = canonicalAddress(sheetName, col, row);

      const formula = cell.f ? String(cell.f) : null;
      const deps = formula ? extractDependencies(formula, sheetName) : [];

      // Enhanced neighbor label extraction for B-BBEE templates
      // Look at cells up to 3 columns to the left and above for labels
      const neighborLabels: string[] = [];

      // Look left up to 3 columns (for label-in-A-value-in-C patterns)
      for (let offset = 1; offset <= 3 && c - offset >= 0; offset++) {
        const leftKey = XLSX.utils.encode_cell({ r, c: c - offset });
        if (ws[leftKey]?.t === 's') {
          const label = String((ws[leftKey] as XLSX.CellObject).v || '').trim();
          if (label && label.length > 1 && !neighborLabels.includes(label)) {
            neighborLabels.push(label);
          }
        }
      }

      // Look above
      const aboveKey = r > 0 ? XLSX.utils.encode_cell({ r: r - 1, c }) : null;
      if (aboveKey && ws[aboveKey]?.t === 's') {
        const label = String((ws[aboveKey] as XLSX.CellObject).v || '').trim();
        if (label && label.length > 1) {
          neighborLabels.push(label);
        }
      }

      // Look at row header (column A) for this row - common in B-BBEE templates
      if (c > 0) {
        const rowHeaderKey = XLSX.utils.encode_cell({ r, c: 0 });
        if (ws[rowHeaderKey]?.t === 's') {
          const rowHeader = String((ws[rowHeaderKey] as XLSX.CellObject).v || '').trim();
          // Add row header if it's a meaningful label (not just a number or single char)
          if (rowHeader && rowHeader.length > 2 && !neighborLabels.includes(rowHeader)) {
            // Check if row header looks like a label (contains letters)
            if (/[a-zA-Z]{2,}/.test(rowHeader)) {
              neighborLabels.push(rowHeader);
            }
          }
        }
      }

      const tag = tagCell(sheetName, canonical, cell.v, neighborLabels);

      cells[canonical] = { address: canonical, sheet: sheetName, column: col, row, formula, value: cell.v ?? null, dependsOn: deps, semanticTag: tag };

      for (const dep of deps) {
        edgeSet.add(`${dep}->${canonical}`);
        if (!cells[dep]) {
          const p = parseAddress(dep);
          if (p) {
            cells[dep] = { address: dep, sheet: p.sheet || defaultSheet, column: p.col, row: p.row, formula: null, value: null, dependsOn: [], semanticTag: null };
          }
        }
      }

      sheetProcessed++;
      totalProcessed++;
    }
  }

  const nodeList = Object.keys(cells);
  const edges: Array<{ from: string; to: string }> = [];
  for (const key of edgeSet) {
    const idx = key.indexOf('->');
    edges.push({ from: key.slice(0, idx), to: key.slice(idx + 2) });
  }

  const inputs = nodeList.filter(n => !cells[n].formula);
  const outputs = nodeList.filter(n => !!cells[n].formula);
  const cyclePaths = o.skipCycleDetection ? [] : (nodeList.length < 100_000 ? detectCycles(nodeList, edges) : []);

  return {
    cells,
    nodes: nodeList,
    edges,
    inputs,
    outputs,
    sheets: sheetNames,
    processedSheets: sheetsToProcess,
    skippedSheets,
    defaultSheet,
    metadata: {
      totalCells: nodeList.length,
      formulaCells: outputs.length,
      inputCells: inputs.length,
      edgeCount: edges.length,
      hasCycles: cyclePaths.length > 0,
      cyclePaths,
    },
  };
}

// ---------------------------------------------------------------------------
// Scorecard structure extraction (replaces hardcoded pillar definitions)
// ---------------------------------------------------------------------------

export interface ExtractedIndicator {
  name: string;
  code: string;
  maxPoints: number;
  targetValue: number;
  targetUnit: 'percentage' | 'currency' | 'number' | 'ratio';
  targetBase: string;
  sourceCells: string[];
  formulaChain: string[];
}

export interface ExtractedPillar {
  name: string;
  code: string;
  maxPoints: number;
  hasSubMinimum: boolean;
  subMinimumThreshold: number;
  displayOrder: number;
  indicators: ExtractedIndicator[];
  totalScoreCell: string | null;
}

export interface ExtractedScorecardStructure {
  sectorCode: string;
  scorecardType: string;
  sourceFile: string;
  pillars: ExtractedPillar[];
  totalMaxPoints: number;
  levelThresholds: Array<{ level: number; minPoints: number; recognition: number }>;
  metadata: {
    sheetsAnalyzed: string[];
    cellsAnalyzed: number;
    extractionConfidence: number;
  };
}

const DEFAULT_LEVEL_THRESHOLDS = [
  { level: 1, minPoints: 100, recognition: 135 },
  { level: 2, minPoints: 95, recognition: 125 },
  { level: 3, minPoints: 90, recognition: 110 },
  { level: 4, minPoints: 80, recognition: 100 },
  { level: 5, minPoints: 75, recognition: 80 },
  { level: 6, minPoints: 70, recognition: 60 },
  { level: 7, minPoints: 55, recognition: 50 },
  { level: 8, minPoints: 40, recognition: 10 },
];

const PILLAR_CANONICAL: Record<string, { name: string; code: string }> = {
  ownership: { name: 'Ownership', code: 'ownership' },
  managementcontrol: { name: 'Management Control', code: 'managementControl' },
  employmentequity: { name: 'Employment Equity', code: 'employmentEquity' },
  skillsdevelopment: { name: 'Skills Development', code: 'skillsDevelopment' },
  preferentialprocurement: { name: 'Preferential Procurement', code: 'preferentialProcurement' },
  enterprisesupplierdevelopment: { name: 'Enterprise & Supplier Development', code: 'enterpriseSupplierDevelopment' },
  socioeconomicdevelopment: { name: 'Socio-Economic Development', code: 'socioEconomicDevelopment' },
  yesinitiative: { name: 'YES Initiative', code: 'yesInitiative' },
};

function detectSector(buffer: Buffer, filename: string): { sectorCode: string; scorecardType: string } {
  const lower = filename.toLowerCase();
  let sectorCode = 'RCOGP';
  let scorecardType = 'Generic';

  if (/ict/i.test(lower)) sectorCode = 'ICT';
  else if (/fsc/i.test(lower)) sectorCode = 'FSC';
  else if (/agri/i.test(lower)) sectorCode = 'AGRI';
  else if (/construction/i.test(lower)) sectorCode = 'CONSTRUCTION';

  if (/qse/i.test(lower)) scorecardType = 'QSE';
  else if (/eme/i.test(lower)) scorecardType = 'EME';

  return { sectorCode, scorecardType };
}

function inferTargetBase(indicatorName: string, pillarCode: string): string {
  const lower = indicatorName.toLowerCase();
  if (/voting/i.test(lower)) return 'total_voting_rights';
  if (/economic\s*interest/i.test(lower)) return 'economic_interest';
  if (/net\s*value/i.test(lower)) return 'net_value';
  if (/board/i.test(lower) || /executive/i.test(lower) || /director/i.test(lower)) return pillarCode === 'managementControl' ? 'exec_count' : 'board_count';
  if (/senior/i.test(lower)) return 'senior_count';
  if (/middle/i.test(lower)) return 'middle_count';
  if (/junior/i.test(lower)) return 'junior_count';
  if (/disabled|disability/i.test(lower)) return 'total_employees';
  if (/bursary|bursaries/i.test(lower)) return 'leviable_amount';
  if (/spend|training|skills/i.test(lower) && pillarCode === 'skillsDevelopment') return 'leviable_amount';
  if (/tmps|procurement|supplier/i.test(lower) && pillarCode === 'preferentialProcurement') return 'tmps';
  if (/supplier.*dev|enterprise.*dev|esd|ed\b/i.test(lower)) return 'npat';
  if (/sed|socio/i.test(lower)) return 'npat';
  return 'total';
}

function inferTargetUnit(value: number): 'percentage' | 'currency' | 'number' {
  if (value > 0 && value <= 1) return 'percentage';
  if (value > 1 && value <= 100) return 'percentage';
  return 'number';
}

function slugify(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 40);
}

/**
 * Extracts the full scorecard structure (pillars, indicators, targets, weights)
 * directly from the Excel formula graph. No hardcoded definitions.
 *
 * Strategy:
 * 1. Scan all cells with semantic tags grouped by pillar
 * 2. For pillar_total tagged cells, extract maxPoints from value
 * 3. For target/weight/score tagged cells, extract indicator details
 * 4. Build level thresholds from cells tagged as bee_level/recognition
 * 5. Walk the formula graph to capture the full calculation chain per indicator
 */
export function extractScorecardStructure(
  graph: FormulaGraph,
  buffer: Buffer,
  filename: string,
): ExtractedScorecardStructure {
  const { sectorCode, scorecardType } = detectSector(buffer, filename);

  const pillarCells = new Map<string, CellNode[]>();
  const pillarTotals = new Map<string, { value: number; cell: string }>();
  const subMinimumCells = new Map<string, { value: number; cell: string }>();
  const scorecardWideRoles: CellNode[] = [];

  for (const addr of graph.nodes) {
    const cell = graph.cells[addr];
    if (!cell?.semanticTag) continue;

    const tag = cell.semanticTag;

    if ('pillar' in tag) {
      const pillar = tag.pillar;
      if (!pillarCells.has(pillar)) pillarCells.set(pillar, []);
      pillarCells.get(pillar)!.push(cell);

      if (tag.role === 'pillar_total' && typeof cell.value === 'number') {
        const existing = pillarTotals.get(pillar);
        if (!existing || cell.value > existing.value) {
          pillarTotals.set(pillar, { value: cell.value, cell: addr });
        }
      }
      if (tag.role === 'sub_minimum' && typeof cell.value === 'number') {
        subMinimumCells.set(pillar, { value: cell.value, cell: addr });
      }
    } else {
      scorecardWideRoles.push(cell);
    }
  }

  const scorecardSheet = findScorecardSheet(graph, buffer);
  let sheetStructure: Map<string, ExtractedPillar> | null = null;
  if (scorecardSheet) {
    sheetStructure = extractFromScorecardSheet(buffer, scorecardSheet, sectorCode);
  }

  const pillars: ExtractedPillar[] = [];
  let displayOrder = 1;

  const allPillarKeys = new Set([
    ...pillarCells.keys(),
    ...(sheetStructure ? sheetStructure.keys() : []),
  ]);

  const pillarOrder = [
    'ownership', 'managementControl', 'employmentEquity',
    'skillsDevelopment', 'preferentialProcurement',
    'enterpriseSupplierDevelopment', 'socioEconomicDevelopment', 'yesInitiative',
  ];
  const sortedPillars = [...allPillarKeys].sort((a, b) => {
    const ai = pillarOrder.indexOf(a);
    const bi = pillarOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  for (const pillarKey of sortedPillars) {
    const canonical = PILLAR_CANONICAL[pillarKey.toLowerCase().replace(/[^a-z]/g, '')] ||
      { name: pillarKey, code: pillarKey };

    const fromSheet = sheetStructure?.get(pillarKey);
    const taggedCells = pillarCells.get(pillarKey) || [];
    const total = pillarTotals.get(pillarKey);
    const subMin = subMinimumCells.get(pillarKey);

    let maxPoints = fromSheet?.maxPoints ?? total?.value ?? 0;

    const indicators: ExtractedIndicator[] = [];

    if (fromSheet && fromSheet.indicators.length > 0) {
      for (const ind of fromSheet.indicators) {
        const formulaChain = traceFormulaChain(graph, ind.sourceCells);
        indicators.push({ ...ind, formulaChain });
      }
    }

    if (indicators.length === 0 && taggedCells.length > 0) {
      const targetCells = taggedCells.filter(c =>
        c.semanticTag && 'role' in c.semanticTag && c.semanticTag.role === 'target');
      const weightCells = taggedCells.filter(c =>
        c.semanticTag && 'role' in c.semanticTag && c.semanticTag.role === 'weight');
      const scoreCells = taggedCells.filter(c =>
        c.semanticTag && 'role' in c.semanticTag && c.semanticTag.role === 'score');

      const indicatorCells = targetCells.length > 0 ? targetCells :
        weightCells.length > 0 ? weightCells : scoreCells;

      for (const ic of indicatorCells) {
        const tag = ic.semanticTag as { pillar: string; indicator: string; role: string };
        const indName = tag.indicator || `${canonical.name} Indicator`;
        const val = typeof ic.value === 'number' ? ic.value : 0;

        const matchingWeight = weightCells.find(w =>
          Math.abs(w.row - ic.row) <= 1 && w.sheet === ic.sheet);
        const pts = matchingWeight && typeof matchingWeight.value === 'number'
          ? matchingWeight.value : val;

        indicators.push({
          name: indName.substring(0, 80),
          code: slugify(indName),
          maxPoints: pts,
          targetValue: val > 1 ? val / 100 : val,
          targetUnit: inferTargetUnit(val),
          targetBase: inferTargetBase(indName, pillarKey),
          sourceCells: [ic.address],
          formulaChain: traceFormulaChain(graph, [ic.address]),
        });
      }
    }

    if (maxPoints === 0 && indicators.length > 0) {
      maxPoints = indicators.reduce((sum, i) => sum + i.maxPoints, 0);
    }

    const hasSubMinimum = !!subMin ||
      ['ownership', 'skillsDevelopment', 'preferentialProcurement', 'enterpriseSupplierDevelopment']
        .includes(pillarKey);
    const subMinimumThreshold = subMin ? subMin.value / maxPoints : (hasSubMinimum ? 0.4 : 0);

    if (maxPoints > 0 || indicators.length > 0) {
      pillars.push({
        name: canonical.name,
        code: canonical.code,
        maxPoints,
        hasSubMinimum,
        subMinimumThreshold,
        displayOrder: displayOrder++,
        indicators,
        totalScoreCell: total?.cell || fromSheet?.totalScoreCell || null,
      });
    }
  }

  const levelThresholds = extractLevelThresholds(graph) ?? DEFAULT_LEVEL_THRESHOLDS;
  const totalMaxPoints = pillars.reduce((s, p) => s + p.maxPoints, 0);

  const confidence = calculateExtractionConfidence(pillars, graph);

  return {
    sectorCode,
    scorecardType,
    sourceFile: filename,
    pillars,
    totalMaxPoints,
    levelThresholds,
    metadata: {
      sheetsAnalyzed: graph.processedSheets,
      cellsAnalyzed: graph.metadata.totalCells,
      extractionConfidence: confidence,
    },
  };
}

function findScorecardSheet(graph: FormulaGraph, _buffer: Buffer): string | null {
  const scorecardPatterns = [/scorecard/i, /summary/i, /dashboard/i, /result/i, /b-?bbee.*score/i];
  for (const sheet of graph.processedSheets) {
    if (scorecardPatterns.some(p => p.test(sheet))) return sheet;
  }
  return null;
}

function extractFromScorecardSheet(
  buffer: Buffer,
  sheetName: string,
  _sectorCode: string,
): Map<string, ExtractedPillar> {
  const wb = XLSX.read(buffer, { type: 'buffer', cellFormula: true, sheets: [sheetName] });
  const ws = wb.Sheets[sheetName];
  if (!ws) return new Map();

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const result = new Map<string, ExtractedPillar>();

  let currentPillar: string | null = null;
  let currentPillarName = '';
  let displayOrder = 1;
  const indicators: ExtractedIndicator[] = [];

  function flushPillar(): void {
    if (currentPillar && (indicators.length > 0)) {
      const canonical = PILLAR_CANONICAL[currentPillar.toLowerCase().replace(/[^a-z]/g, '')] ||
        { name: currentPillarName, code: currentPillar };
      result.set(currentPillar, {
        name: canonical.name,
        code: canonical.code,
        maxPoints: indicators.reduce((s, i) => s + i.maxPoints, 0),
        hasSubMinimum: false,
        subMinimumThreshold: 0,
        displayOrder: displayOrder++,
        indicators: [...indicators],
        totalScoreCell: null,
      });
      indicators.length = 0;
    }
  }

  for (let r = range.s.r; r <= range.e.r; r++) {
    const rowValues: Array<{ col: number; value: unknown; formula: string | null; text: string }> = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr] as XLSX.CellObject | undefined;
      if (cell) {
        rowValues.push({
          col: c,
          value: cell.v,
          formula: cell.f ? String(cell.f) : null,
          text: String(cell.v ?? '').trim(),
        });
      }
    }

    if (rowValues.length === 0) continue;

    const firstText = rowValues[0]?.text || '';
    const fullRowText = rowValues.map(v => v.text).join(' ');

    let matchedPillar: string | null = null;
    for (const [pillar, patterns] of Object.entries(PILLAR_KEYWORDS)) {
      if (patterns.some(p => p.test(firstText))) {
        matchedPillar = pillar;
        break;
      }
    }

    if (matchedPillar && !rowValues.some(v => /target|actual|score|weight/i.test(v.text))) {
      flushPillar();
      currentPillar = matchedPillar;
      currentPillarName = firstText;
      continue;
    }

    if (!currentPillar) continue;

    const numericValues = rowValues.filter(v => typeof v.value === 'number');
    if (numericValues.length >= 1 && firstText.length > 2) {
      const isIndicatorRow = !(/^total|^element|^pillar|^compliance\s*target|^weighting|^actual/i.test(firstText));

      if (isIndicatorRow) {
        let targetVal = 0;
        let maxPts = 0;
        const sourceCells: string[] = [];

        for (const nv of numericValues) {
          const colAddr = `${sheetName}!${XLSX.utils.encode_col(nv.col)}${r + 1}`;
          sourceCells.push(colAddr);

          const val = nv.value as number;
          if (val > 0 && val <= 1) {
            targetVal = val;
          } else if (val > 0 && val <= 100 && /target|compliance/i.test(fullRowText)) {
            targetVal = val / 100;
          }

          const leftAddr = nv.col > 0 ? XLSX.utils.encode_cell({ r, c: nv.col - 1 }) : null;
          const headerAddr = XLSX.utils.encode_cell({ r: range.s.r, c: nv.col });
          const headerCell = ws[headerAddr] as XLSX.CellObject | undefined;
          const headerText = String(headerCell?.v ?? '').toLowerCase();
          const leftCell = leftAddr ? ws[leftAddr] as XLSX.CellObject | undefined : undefined;
          const leftText = String(leftCell?.v ?? '').toLowerCase();

          if (/weight|max\s*point|available/i.test(headerText) || /weight|max\s*point|available/i.test(leftText)) {
            if (val > 0 && val <= 30) maxPts = val;
          }
        }

        if (maxPts === 0) {
          const smallInts = numericValues
            .filter(v => typeof v.value === 'number' && (v.value as number) > 0 && (v.value as number) <= 30 && Number.isInteger(v.value))
            .map(v => v.value as number);
          if (smallInts.length > 0) maxPts = Math.max(...smallInts);
        }

        if (maxPts > 0 || targetVal > 0) {
          indicators.push({
            name: firstText.substring(0, 80),
            code: slugify(firstText),
            maxPoints: maxPts,
            targetValue: targetVal,
            targetUnit: inferTargetUnit(targetVal * 100),
            targetBase: inferTargetBase(firstText, currentPillar),
            sourceCells,
            formulaChain: [],
          });
        }
      }
    }

    if (/^total|^element\s*total|^pillar\s*total/i.test(firstText)) {
      flushPillar();
      currentPillar = null;
    }
  }

  flushPillar();
  return result;
}

function extractLevelThresholds(
  graph: FormulaGraph,
): Array<{ level: number; minPoints: number; recognition: number }> | null {
  const levelCells = graph.nodes.filter(n => {
    const tag = graph.cells[n]?.semanticTag;
    return tag && 'role' in tag && (tag.role === 'bee_level' || tag.role === 'recognition');
  });

  if (levelCells.length === 0) return null;

  const thresholds: Array<{ level: number; minPoints: number; recognition: number }> = [];
  for (const addr of levelCells) {
    const cell = graph.cells[addr];
    if (typeof cell.value !== 'number') continue;

    const neighbors = cell.dependsOn.map(d => graph.cells[d]).filter(Boolean);
    const numNeighbors = neighbors.filter(n => typeof n.value === 'number');

    if (numNeighbors.length >= 1) {
      const level = Math.round(cell.value);
      if (level >= 1 && level <= 8) {
        thresholds.push({
          level,
          minPoints: numNeighbors[0] ? numNeighbors[0].value as number : 0,
          recognition: numNeighbors[1] ? numNeighbors[1].value as number : 0,
        });
      }
    }
  }

  if (thresholds.length >= 4) {
    return thresholds.sort((a, b) => a.level - b.level);
  }
  return null;
}

function traceFormulaChain(graph: FormulaGraph, startAddrs: string[], maxDepth = 8): string[] {
  const visited = new Set<string>();
  const chain: string[] = [];
  const stack = startAddrs.map(a => ({ addr: a, depth: 0 }));

  while (stack.length > 0) {
    const { addr, depth } = stack.pop()!;
    if (visited.has(addr) || depth > maxDepth) continue;
    visited.add(addr);

    const cell = graph.cells[addr];
    if (!cell) continue;

    if (cell.formula) {
      chain.push(`${addr} = ${cell.formula}`);
    }
    for (const dep of cell.dependsOn) {
      stack.push({ addr: dep, depth: depth + 1 });
    }
  }

  return chain;
}

function calculateExtractionConfidence(pillars: ExtractedPillar[], graph: FormulaGraph): number {
  let score = 0;
  const maxScore = 100;

  if (pillars.length >= 5) score += 25;
  else if (pillars.length >= 3) score += 15;
  else score += 5;

  const totalIndicators = pillars.reduce((s, p) => s + p.indicators.length, 0);
  if (totalIndicators >= 15) score += 25;
  else if (totalIndicators >= 8) score += 15;
  else score += 5;

  const withTargets = pillars.reduce(
    (s, p) => s + p.indicators.filter(i => i.targetValue > 0).length, 0);
  if (withTargets >= 10) score += 20;
  else if (withTargets >= 5) score += 10;

  const totalMax = pillars.reduce((s, p) => s + p.maxPoints, 0);
  if (totalMax >= 90 && totalMax <= 130) score += 20;
  else if (totalMax > 0) score += 10;

  if (graph.metadata.formulaCells > 50) score += 10;
  else if (graph.metadata.formulaCells > 10) score += 5;

  return Math.min(score, maxScore);
}

/**
 * Extract only the B-BBEE-relevant subgraph by following dependencies
 * backward from cells tagged with scorecard roles.
 */
export function extractScorecardSubgraph(graph: FormulaGraph): FormulaGraph {
  const seeds = graph.nodes.filter(n => {
    const tag = graph.cells[n]?.semanticTag;
    if (!tag) return false;
    if ('role' in tag) {
      return ['pillar_total', 'total_score', 'bee_level', 'recognition', 'sub_minimum', 'score'].includes(tag.role);
    }
    return false;
  });

  const visited = new Set<string>();
  const reverseAdj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!reverseAdj.has(e.to)) reverseAdj.set(e.to, []);
    reverseAdj.get(e.to)!.push(e.from);
  }

  const stack = [...seeds];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const dep of reverseAdj.get(node) || []) stack.push(dep);
    for (const dep of graph.cells[node]?.dependsOn || []) stack.push(dep);
  }

  const subNodes = graph.nodes.filter(n => visited.has(n));
  const subEdges = graph.edges.filter(e => visited.has(e.from) && visited.has(e.to));
  const subCells: Record<string, CellNode> = {};
  for (const n of subNodes) subCells[n] = graph.cells[n];

  return {
    cells: subCells,
    nodes: subNodes,
    edges: subEdges,
    inputs: subNodes.filter(n => !subCells[n].formula),
    outputs: subNodes.filter(n => !!subCells[n].formula),
    sheets: graph.sheets,
    processedSheets: graph.processedSheets,
    skippedSheets: graph.skippedSheets,
    defaultSheet: graph.defaultSheet,
    metadata: {
      totalCells: subNodes.length,
      formulaCells: subNodes.filter(n => !!subCells[n].formula).length,
      inputCells: subNodes.filter(n => !subCells[n].formula).length,
      edgeCount: subEdges.length,
      hasCycles: false,
      cyclePaths: [],
    },
  };
}
