import type { EsgWorkbookData } from "./esgWorkbookStorage";
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
  blockers: EsgValidationIssue[];
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
  return evaluateEsgRules(workbook, touched ?? {}, mode).map(toIssue);
}

/** Submit gate — King5 + legacy critical checks. */
export function validateEsgWorkbookForSubmit(
  workbook: EsgWorkbookData | null,
  touched?: EsgTouchedState,
): EsgValidationAggregate {
  const issues = validateEsgWorkbook(workbook, touched, "submit");
  const blockers = issues.filter((i) => !i.pass && i.severity === "critical");
  return {
    ok: blockers.length === 0,
    issues,
    blockers,
  };
}
