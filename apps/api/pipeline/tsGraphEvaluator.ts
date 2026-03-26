/**
 * TypeScript Graph Evaluator
 *
 * Fallback formula evaluator that works directly with ArangoDB cells
 * when the Python Computation Engine is unavailable.
 *
 * Performs topological sort + restricted eval for Excel-like formulas.
 */

import { aql } from 'arangojs';
import { getArangoDB } from '../arango/connection.js';
import { COLLECTIONS, EDGE_COLLECTIONS } from '../arango/collections.js';

interface CellDoc {
  _key: string;
  address: string;
  sheet: string;
  formula: string | null;
  value: unknown;
  graphId: string;
  semanticTag?: {
    pillar?: string;
    role?: string;
    description?: string;
    fieldType?: string;
  };
  dependsOn: string[];
}

export interface TSEvalResult {
  results: Record<string, unknown>;
  stats: {
    total_cells: number;
    evaluated: number;
    overridden: number;
    errors: number;
    inputs: number;
  };
  pillarScores?: Record<string, { score: number; maxPoints: number }>;
}

export async function evaluateGraphWithOverrides(
  graphKey: string,
  overrides: Record<string, unknown>,
): Promise<TSEvalResult> {
  const db = getArangoDB();

  const cursor = await db.query(aql`
    FOR c IN ${db.collection(COLLECTIONS.cells)}
      FILTER c.graphId == ${graphKey}
      RETURN c
  `);
  const cells: CellDoc[] = await cursor.all();

  if (cells.length === 0) {
    throw new Error(`No cells found for graph ${graphKey}`);
  }

  const cellMap = new Map<string, CellDoc>();
  for (const cell of cells) {
    cellMap.set(cell.address, cell);
  }

  const normalizedOverrides: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(overrides)) {
    const normalKey = key.replace(/'/g, "'").replace(/\$/g, '');
    normalizedOverrides[normalKey] = value;

    const withoutQuotes = normalKey.replace(/'/g, '');
    if (withoutQuotes !== normalKey) {
      normalizedOverrides[withoutQuotes] = value;
    }
  }

  const state: Record<string, unknown> = {};
  const formulaCells: CellDoc[] = [];
  let inputCount = 0;

  for (const cell of cells) {
    if (normalizedOverrides[cell.address] !== undefined) {
      state[cell.address] = normalizedOverrides[cell.address];
    } else if (cell.formula) {
      formulaCells.push(cell);
      state[cell.address] = null;
    } else {
      state[cell.address] = cell.value;
      inputCount++;
    }
  }

  const sorted = topologicalSort(formulaCells, cellMap);

  let evaluated = 0;
  let errors = 0;

  for (const cell of sorted) {
    if (normalizedOverrides[cell.address] !== undefined) continue;
    if (!cell.formula) continue;

    try {
      const result = evaluateFormula(cell.formula, state);
      state[cell.address] = result;
      evaluated++;
    } catch {
      state[cell.address] = cell.value ?? 0;
      errors++;
    }
  }

  const pillarScores = extractPillarScores(cells, state);

  return {
    results: state,
    stats: {
      total_cells: cells.length,
      evaluated,
      overridden: Object.keys(normalizedOverrides).length,
      errors,
      inputs: inputCount,
    },
    pillarScores,
  };
}

function topologicalSort(
  formulaCells: CellDoc[],
  cellMap: Map<string, CellDoc>,
): CellDoc[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const cell of formulaCells) {
    if (!inDegree.has(cell.address)) inDegree.set(cell.address, 0);
    if (!adjacency.has(cell.address)) adjacency.set(cell.address, []);

    for (const dep of cell.dependsOn || []) {
      const depCell = cellMap.get(dep);
      if (depCell && depCell.formula) {
        const current = inDegree.get(cell.address) || 0;
        inDegree.set(cell.address, current + 1);

        if (!adjacency.has(dep)) adjacency.set(dep, []);
        adjacency.get(dep)!.push(cell.address);
      }
    }
  }

  const queue: string[] = [];
  for (const [addr, degree] of inDegree) {
    if (degree === 0) queue.push(addr);
  }

  const order: CellDoc[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const addr = queue.shift()!;
    if (visited.has(addr)) continue;
    visited.add(addr);

    const cell = cellMap.get(addr);
    if (cell) order.push(cell);

    for (const dependent of adjacency.get(addr) || []) {
      const deg = (inDegree.get(dependent) || 1) - 1;
      inDegree.set(dependent, deg);
      if (deg === 0) queue.push(dependent);
    }
  }

  for (const cell of formulaCells) {
    if (!visited.has(cell.address)) {
      order.push(cell);
    }
  }

  return order;
}

function evaluateFormula(formula: string, state: Record<string, unknown>): unknown {
  let expr = formula.replace(/^=/, '').trim();
  if (!expr) return null;

  const cellRefPattern = /(?:'[^']+'|[A-Za-z0-9_]+)!\$?[A-Z]+\$?[0-9]+|\$?[A-Z]+\$?[0-9]+/g;

  expr = expr.replace(cellRefPattern, (match) => {
    const clean = match.replace(/\$/g, '');
    const val = state[clean];

    if (val === null || val === undefined) return '0';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'string') {
      if (val.startsWith('#')) return '0';
      const num = Number(val.replace(/[R\s,]/g, ''));
      if (!isNaN(num)) return String(num);
      return '0';
    }
    return '0';
  });

  expr = expr.replace(/\bSUM\s*\(/gi, 'SUM_F(');
  expr = expr.replace(/\bAVERAGE\s*\(/gi, 'AVG_F(');
  expr = expr.replace(/\bIF\s*\(/gi, 'IF_F(');
  expr = expr.replace(/\bMAX\s*\(/gi, 'Math.max(');
  expr = expr.replace(/\bMIN\s*\(/gi, 'Math.min(');
  expr = expr.replace(/\bROUND\s*\(/gi, 'ROUND_F(');
  expr = expr.replace(/\bABS\s*\(/gi, 'Math.abs(');

  const SUM_F = (...args: unknown[]) => {
    let total = 0;
    for (const a of args) {
      if (typeof a === 'number') total += a;
      else if (Array.isArray(a)) total += SUM_F(...a) as number;
    }
    return total;
  };

  const AVG_F = (...args: unknown[]) => {
    const vals: number[] = [];
    for (const a of args) {
      if (typeof a === 'number') vals.push(a);
    }
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  };

  const IF_F = (cond: unknown, trueVal: unknown, falseVal: unknown) => {
    return cond ? trueVal : falseVal;
  };

  const ROUND_F = (val: unknown, digits?: number) => {
    const n = Number(val);
    if (isNaN(n)) return 0;
    const d = digits ?? 0;
    const factor = Math.pow(10, d);
    return Math.round(n * factor) / factor;
  };

  try {
    const fn = new Function('SUM_F', 'AVG_F', 'IF_F', 'ROUND_F', 'Math', `return (${expr});`);
    return fn(SUM_F, AVG_F, IF_F, ROUND_F, Math);
  } catch {
    return null;
  }
}

function extractPillarScores(
  cells: CellDoc[],
  state: Record<string, unknown>,
): Record<string, { score: number; maxPoints: number }> {
  const pillars: Record<string, { score: number; maxPoints: number }> = {};

  for (const cell of cells) {
    const tag = cell.semanticTag;
    if (!tag || !tag.pillar) continue;

    const pillar = tag.pillar;
    if (!pillars[pillar]) {
      pillars[pillar] = { score: 0, maxPoints: 0 };
    }

    const val = state[cell.address];
    const numVal = typeof val === 'number' ? val : Number(val);
    if (isNaN(numVal)) continue;

    if (tag.role === 'output' || tag.role === 'score') {
      pillars[pillar].score = Math.max(pillars[pillar].score, numVal);
    }
    if (tag.role === 'target' || tag.role === 'max_points') {
      pillars[pillar].maxPoints = Math.max(pillars[pillar].maxPoints, numVal);
    }
  }

  return pillars;
}
