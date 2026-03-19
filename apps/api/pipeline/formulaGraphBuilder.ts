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
  | { pillar: string; indicator: string; role: 'target' | 'actual' | 'score' | 'weight' | 'input' | 'label' }
  | { pillar: string; role: 'pillar_total' | 'sub_minimum' }
  | { role: 'total_score' | 'bee_level' | 'recognition' | 'client_info' | 'financial' };

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

function tagCell(sheetName: string, _cellAddress: string, value: unknown, neighborLabels: string[]): SemanticTag | null {
  const context = [sheetName, ...neighborLabels].join(' ');

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
        return { role: role as 'total_score' | 'bee_level' | 'recognition' };
      }
      if (role === 'pillar_total' || role === 'sub_minimum') {
        if (detectedPillar) {
          return { pillar: detectedPillar, role: role as 'pillar_total' | 'sub_minimum' };
        }
      }
      if (detectedPillar && (role === 'target' || role === 'actual' || role === 'score' || role === 'weight')) {
        return { pillar: detectedPillar, indicator: context.substring(0, 60).trim(), role };
      }
    }
  }

  if (detectedPillar) {
    const isNumeric = typeof value === 'number';
    return { pillar: detectedPillar, indicator: context.substring(0, 60).trim(), role: isNumeric ? 'input' : 'label' };
  }

  if (/revenue|turnover|npat|net\s*profit|payroll|leviable/i.test(context)) return { role: 'financial' };
  if (/company|client|entity|registration|vat/i.test(context)) return { role: 'client_info' };

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

      const leftKey = c > 0 ? XLSX.utils.encode_cell({ r, c: c - 1 }) : null;
      const aboveKey = r > 0 ? XLSX.utils.encode_cell({ r: r - 1, c }) : null;
      const neighborLabels: string[] = [];
      if (leftKey && ws[leftKey]?.t === 's') neighborLabels.push(String((ws[leftKey] as XLSX.CellObject).v || ''));
      if (aboveKey && ws[aboveKey]?.t === 's') neighborLabels.push(String((ws[aboveKey] as XLSX.CellObject).v || ''));

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
