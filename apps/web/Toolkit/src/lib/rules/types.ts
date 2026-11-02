import type { ScorecardId } from './scorecards';

/** Where an override is applied. See buildEffectiveConfig for the two-layer model. */
export type RuleLayer = 'source' | 'calculator';

/**
 * The unit a value is STORED in. The shipped configs mix fractions (ownership,
 * management and procurement targets: 0.25 = 25%) and percents (skills / ESD / SED
 * spend: 3.5 = 3.5%). The registry states the unit per rule; the UI converts only
 * for display and never changes what is stored.
 */
export type RuleUnit = 'fraction' | 'percent' | 'points' | 'factor';

export type Editability = 'expert' | 'developer';

export interface RuleDef {
  /** Stable id: `<scorecardId>:<layer>:<path>`. Used in changesets and audit trails. */
  key: string;
  scorecardId: ScorecardId;
  /** B-BBEE element the rule belongs to (Ownership, Skills Development, ...). */
  element: string;
  /** Finer grouping inside the element, for the UI. */
  category: string;
  label: string;
  help: string;
  type: 'number';
  unit: RuleUnit;
  min: number;
  max: number;
  /** Where the rule lives. `path` is a safe path (see paths.ts). */
  binding: { layer: RuleLayer; path: string };
  editability: Editability;
  /** Scorecard lines (breakdown rows) whose results this rule can move. */
  affectedLines: string[];
  /** Regulatory rulings / sources this value derives from, for the reviewer. */
  rulings: string[];
  /** Invariants a change to this rule must not break (checked pre-publish). */
  invariants: string[];
  /** True when the shipped value is not yet reachable through a pure data override. */
  needsHook?: boolean;
}

export type OverrideValue = number | string | boolean;

/** The only thing a draft stores: sparse path -> value maps. Empty = shipped behaviour. */
export interface RuleOverrides {
  source: Record<string, OverrideValue>;
  calculator: Record<string, OverrideValue>;
}

export const EMPTY_OVERRIDES: Readonly<RuleOverrides> = Object.freeze({
  source: Object.freeze({}) as Record<string, OverrideValue>,
  calculator: Object.freeze({}) as Record<string, OverrideValue>,
});

/**
 * Stamped onto a scorecard when it is calculated under a published ruleset, so the
 * exact rules in force can be reproduced and verified later.
 */
export interface RulesetStamp {
  scorecardId: ScorecardId;
  /** Monotonic published version number for this scorecard. */
  version: number;
  /** SHA-256 over the canonical effective config. */
  configHash: string;
  /** SHA-256 over the canonical overrides (what the version changed). */
  overridesHash: string;
  /** ISO timestamp the version took effect (never the calculation time). */
  effectiveFrom: string;
}
