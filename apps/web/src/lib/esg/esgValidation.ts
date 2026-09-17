import type { EsgWorkbookData } from "./esgWorkbookStorage";
import { deriveEsgSummaryCells } from "./esgDeriveSummary";
import {
  evaluateEsgRules,
  type EsgRuleEvaluation,
  type EsgTouchedState,
  type EsgRulesMode,
} from "./esgValidationRules";

export type EsgValidationIssue = {
  id: string;
  label: string;
  severity: "critical" | "warning";
  pass: boolean;
  pending?: boolean;
  expected: string;
  actual: string;
  sectionId?: string;
};

export type EsgValidationAggregate = {
  ok: boolean;
  issues: EsgValidationIssue[];
  /** Failing `error` rules — these and only these disable submit. */
  blockers: EsgValidationIssue[];
  /** Failing `warning` rules — real gaps, but the workbook is still submittable. */
  warnings: EsgValidationIssue[];
};

function toIssue(ev: EsgRuleEvaluation): EsgValidationIssue {
  const severity: EsgValidationIssue["severity"] =
    ev.severity === "error" ? "critical" : "warning";
  return {
    id: ev.id,
    label: ev.message,
    severity,
    pass: ev.pass,
    pending: ev.pending,
    expected: ev.expected,
    actual: ev.actual,
    sectionId: ev.sectionId,
  };
}

export function validateEsgWorkbook(
  workbook: EsgWorkbookData | null,
  touched?: EsgTouchedState,
  mode: EsgRulesMode = "live",
): EsgValidationIssue[] {
  // Derive the template summary cells (L12/L46/L63/F13.., …) first so rules that
  // gate on them (headcount > 0, governance score > 0, months complete) evaluate
  // against the same values the scorer sees — otherwise a fully-filled manual
  // workbook is permanently blocked from submit.
  const derived = workbook ? deriveEsgSummaryCells(workbook) : workbook;
  return evaluateEsgRules(derived, touched ?? {}, mode).map(toIssue);
}

/**
 * Submit gate.
 *
 * Only `critical` rules block: the three computed pillar totals (E/S/G must
 * actually score something) plus the King V assessment. Everything else is a
 * warning — a real gap the panel surfaces, but not a reason to refuse a
 * submission. A partially-complete workbook is a legitimate ESG baseline; the
 * previous behaviour promoted every warning to a blocker on submit, so no
 * workbook in existence could be submitted.
 */
export function validateEsgWorkbookForSubmit(
  workbook: EsgWorkbookData | null,
  touched?: EsgTouchedState,
): EsgValidationAggregate {
  const issues = validateEsgWorkbook(workbook, touched, "submit");
  const failing = issues.filter((i) => !i.pass && !i.pending);
  const blockers = failing.filter((i) => i.severity === "critical");
  return {
    ok: blockers.length === 0,
    issues,
    blockers,
    warnings: failing.filter((i) => i.severity === "warning"),
  };
}

/** Actionable gaps for one input section (submit rules, excluding pending). */
export function missingIssuesForEsgSection(
  workbook: EsgWorkbookData | null,
  touched: EsgTouchedState | undefined,
  sectionId: string,
): EsgValidationIssue[] {
  return validateEsgWorkbook(workbook, touched, "submit").filter(
    (i) => i.sectionId === sectionId && !i.pass && !i.pending,
  );
}

export function esgSectionHasMissingRequired(
  workbook: EsgWorkbookData | null,
  touched: EsgTouchedState | undefined,
  sectionId: string,
): boolean {
  return missingIssuesForEsgSection(workbook, touched, sectionId).length > 0;
}
