/**
 * buildEffectiveConfig - the one place a draft's overrides become a CalculatorConfig.
 *
 *   1. clone the shipped SectorConfig (the original is never touched)
 *   2. apply SOURCE overrides to the clone
 *   3. run the scorecard's own converter -> generated CalculatorConfig
 *   4. apply CALCULATOR overrides to the generated config
 *   5. deep-freeze the result
 *
 * Empty overrides therefore produce exactly what the shipped sector file produces.
 * Every override must be registered (scorecard + layer + path), numeric, finite and
 * inside the rule's bounds. Anything else is rejected - nothing is created, coerced
 * or silently ignored.
 */
import type { CalculatorConfig } from '../../../../shared/schema';
import { SCORECARD_SOURCES, type ScorecardId } from './scorecards';
import { getRules } from './registry';
import { getAtPath, setAtPath, RulePathError } from './paths';
import { hashOf } from './canonical';
import type { RuleDef, RuleOverrides, RuleLayer } from './types';

export interface OverrideIssue {
  layer: RuleLayer;
  path: string;
  code: 'unknown-rule' | 'not-a-number' | 'out-of-bounds' | 'path-unresolved' | 'bad-shape';
  message: string;
}

export class RuleValidationError extends Error {
  constructor(public readonly issues: OverrideIssue[]) {
    super(`Invalid rule overrides: ${issues.map((i) => `${i.layer}:${i.path} (${i.code})`).join(', ')}`);
    this.name = 'RuleValidationError';
  }
}

export interface BuildOptions {
  /** Test seam / future per-version rule sets. Defaults to the shipped registry. */
  rules?: readonly RuleDef[];
}

const LAYERS: RuleLayer[] = ['source', 'calculator'];

export function validateOverrides(
  scorecardId: ScorecardId,
  overrides: RuleOverrides,
  opts: BuildOptions = {},
): OverrideIssue[] {
  const issues: OverrideIssue[] = [];
  const rules = opts.rules ?? getRules(scorecardId);
  if (!overrides || typeof overrides !== 'object') {
    return [{ layer: 'source', path: '', code: 'bad-shape', message: 'Overrides must be an object' }];
  }
  for (const layer of LAYERS) {
    const bag = (overrides as Partial<RuleOverrides>)[layer] ?? {};
    if (bag === null || typeof bag !== 'object' || Array.isArray(bag)) {
      issues.push({ layer, path: '', code: 'bad-shape', message: `${layer} overrides must be an object` });
      continue;
    }
    for (const path of Object.keys(bag)) {
      const value = (bag as Record<string, unknown>)[path];
      const rule = rules.find((r) => r.binding.layer === layer && r.binding.path === path);
      if (!rule) {
        issues.push({ layer, path, code: 'unknown-rule', message: 'No registered rule for this path' });
        continue;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        issues.push({ layer, path, code: 'not-a-number', message: 'Value must be a finite number' });
        continue;
      }
      if (value < rule.min || value > rule.max) {
        issues.push({ layer, path, code: 'out-of-bounds', message: `Value ${value} outside ${rule.min}..${rule.max}` });
      }
    }
  }
  return issues;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

export function buildEffectiveConfig(
  scorecardId: ScorecardId,
  overrides: RuleOverrides,
  opts: BuildOptions = {},
): CalculatorConfig {
  const entry = SCORECARD_SOURCES[scorecardId];
  if (!entry) throw new RuleValidationError([{ layer: 'source', path: '', code: 'bad-shape', message: `Unknown scorecard ${String(scorecardId)}` }]);

  const issues = validateOverrides(scorecardId, overrides, opts);
  if (issues.length) throw new RuleValidationError(issues);

  const source = structuredClone(entry.source);
  for (const [path, value] of Object.entries(overrides.source ?? {})) {
    try {
      setAtPath(source, path, value);
    } catch (e) {
      if (e instanceof RulePathError) throw new RuleValidationError([{ layer: 'source', path, code: 'path-unresolved', message: e.message }]);
      throw e;
    }
  }

  const generated = entry.convert(source);
  for (const [path, value] of Object.entries(overrides.calculator ?? {})) {
    try {
      setAtPath(generated, path, value);
    } catch (e) {
      if (e instanceof RulePathError) throw new RuleValidationError([{ layer: 'calculator', path, code: 'path-unresolved', message: e.message }]);
      throw e;
    }
  }
  return deepFreeze(generated);
}

/** Value a path currently holds in the SHIPPED source/calculator config (for diffs and UIs). */
export function shippedValue(scorecardId: ScorecardId, layer: RuleLayer, path: string): unknown {
  const entry = SCORECARD_SOURCES[scorecardId];
  return getAtPath(layer === 'source' ? entry.source : entry.shipped, path);
}

export async function hashEffectiveConfig(config: CalculatorConfig): Promise<string> {
  return hashOf(config);
}

export async function hashOverrides(overrides: RuleOverrides): Promise<string> {
  return hashOf({ source: overrides.source ?? {}, calculator: overrides.calculator ?? {} });
}
