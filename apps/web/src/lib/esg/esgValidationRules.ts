import { readEsgCell, type EsgWorkbookData } from "./esgWorkbookStorage";
import { countKing5Principles } from "./esgGridRows";

export type EsgTouchedState = Record<string, Record<string, true>>;

export type EsgRuleSeverity = "warning" | "error";
export type EsgRuleScope = "field" | "section" | "workbook";
export type EsgRuleTrigger = "always" | "touched" | "submit";

export type EsgRule = {
  id: string;
  scope: EsgRuleScope;
  sectionId: string;
  fieldRef?: string;
  severity: EsgRuleSeverity;
  trigger: EsgRuleTrigger;
  message: string;
  evaluate: (workbook: EsgWorkbookData, touched: EsgTouchedState) => boolean;
};

export type EsgRuleEvaluation = {
  id: string;
  message: string;
  severity: EsgRuleSeverity;
  sectionId: string;
  fieldRef?: string;
  pass: boolean;
  pending: boolean;
  expected: string;
  actual: string;
};

export type EsgRulesMode = "live" | "submit" | "silent";

function isTouched(touched: EsgTouchedState, sectionId: string, fieldRef?: string): boolean {
  if (!fieldRef) return Boolean(touched[sectionId] && Object.keys(touched[sectionId]).length > 0);
  return Boolean(touched[sectionId]?.[fieldRef]);
}

function countPositiveMonths(workbook: EsgWorkbookData, sectionId: string): number {
  const stored = readEsgCell(workbook, sectionId, "_months_C_K");
  if (stored != null) return stored;
  const cols = "CDEFGHIJK".split("");
  let count = 0;
  for (const col of cols) {
    const v =
      readEsgCell(workbook, sectionId, `${col}14`) ??
      readEsgCell(workbook, sectionId, `${col}44`) ??
      readEsgCell(workbook, sectionId, `${col}61`);
    if (v != null && Number(v) > 0) count++;
  }
  return count;
}

export const ESG_PHASE1_RULES: EsgRule[] = [
  {
    id: "company-reporting-setup.entity-required",
    scope: "field",
    sectionId: "company-reporting-setup",
    fieldRef: "entity",
    severity: "warning",
    trigger: "submit",
    message: "Entity name required",
    evaluate: (wb) =>
      Boolean(
        String(
          readEsgCell(wb, "company-reporting-setup", "entity") ??
            readEsgCell(wb, "cover", "entity") ??
            "",
        ).trim(),
      ),
  },
  {
    id: "company-reporting-setup.period-required",
    scope: "field",
    sectionId: "company-reporting-setup",
    fieldRef: "period",
    severity: "warning",
    trigger: "submit",
    message: "Reporting period required",
    evaluate: (wb) =>
      Boolean(
        String(
          readEsgCell(wb, "company-reporting-setup", "period") ??
            readEsgCell(wb, "cover", "period") ??
            "",
        ).trim(),
      ),
  },
  {
    id: "company-reporting-setup.baseline-year-valid",
    scope: "field",
    sectionId: "company-reporting-setup",
    fieldRef: "baselineYear",
    severity: "warning",
    trigger: "touched",
    message: "Baseline year should be between 2018 and 2030",
    evaluate: (wb) => {
      const y =
        readEsgCell(wb, "company-reporting-setup", "baselineYear") ??
        readEsgCell(wb, "cover", "baselineYear");
      if (y == null || y === "") return true;
      const n = Number(y);
      return Number.isFinite(n) && n >= 2018 && n <= 2030;
    },
  },
  {
    id: "assumptions.sector-required",
    scope: "field",
    sectionId: "assumptions",
    fieldRef: "B8",
    severity: "warning",
    trigger: "submit",
    message: "Pick a sector before submit",
    evaluate: (wb) => Boolean(String(readEsgCell(wb, "assumptions", "B8") ?? "").trim()),
  },
  {
    id: "assumptions.stance-required",
    scope: "field",
    sectionId: "assumptions",
    fieldRef: "B6",
    severity: "warning",
    trigger: "touched",
    message: 'Defaulted to "Standard"',
    evaluate: (wb) => {
      const v = readEsgCell(wb, "assumptions", "B6");
      return v == null || v === "" || String(v).trim() !== "";
    },
  },
  {
    id: "e-data.fleet.months-complete",
    scope: "section",
    sectionId: "e-data",
    fieldRef: "scope1A.months",
    severity: "warning",
    trigger: "submit",
    message: "Expected 9 months of fleet diesel data",
    evaluate: (wb) => countPositiveMonths(wb, "e-data") >= 9,
  },
  {
    id: "e-data.electricity.months-complete",
    scope: "section",
    sectionId: "e-data",
    fieldRef: "scope2.months",
    severity: "warning",
    trigger: "submit",
    message: "Expected 9 months electricity",
    evaluate: (wb) => {
      const n = readEsgCell(wb, "e-data", "L46");
      return n != null && Number(n) > 0;
    },
  },
  {
    id: "e-data.water.months-complete",
    scope: "section",
    sectionId: "e-data",
    fieldRef: "water.months",
    severity: "warning",
    trigger: "submit",
    message: "Expected 9 months water",
    evaluate: (wb) => {
      const n = readEsgCell(wb, "e-data", "L63");
      return n != null && Number(n) > 0;
    },
  },
  {
    id: "e-data.baseline-set",
    scope: "field",
    sectionId: "e-data",
    fieldRef: "B90",
    severity: "warning",
    trigger: "submit",
    message: "Net-Zero baseline (tCO₂e) not set",
    evaluate: (wb) => {
      const v = readEsgCell(wb, "e-data", "B90");
      return v != null && Number(v) > 0;
    },
  },
  {
    id: "s-data.headcount-positive",
    scope: "field",
    sectionId: "s-data",
    fieldRef: "L12",
    severity: "warning",
    trigger: "submit",
    message: "EE total headcount must be > 0",
    evaluate: (wb) => (readEsgCell(wb, "s-data", "L12") ?? 0) > 0,
  },
  {
    id: "s-data.ltifr-threshold",
    scope: "field",
    sectionId: "s-data",
    fieldRef: "G35",
    severity: "warning",
    trigger: "touched",
    message: "LTIFR exceeds Assumptions threshold",
    evaluate: (wb) => {
      const ltifr = readEsgCell(wb, "s-data", "G35") ?? 0;
      const threshold = readEsgCell(wb, "assumptions", "B55") ?? 2;
      return Number(ltifr) <= Number(threshold);
    },
  },
  {
    id: "s-data.wsp-submitted",
    scope: "field",
    sectionId: "s-data",
    fieldRef: "B45",
    severity: "warning",
    trigger: "submit",
    message: "WSP submission status unknown",
    evaluate: (wb) => Boolean(String(readEsgCell(wb, "s-data", "B45") ?? "").trim()),
  },
  {
    id: "g-data.code-of-ethics",
    scope: "field",
    sectionId: "g-data",
    fieldRef: "B15",
    severity: "warning",
    trigger: "submit",
    message: "Code of ethics flag not set",
    evaluate: (wb) => Boolean(String(readEsgCell(wb, "g-data", "B15") ?? "").trim()),
  },
  {
    id: "g-data.popia-io",
    scope: "field",
    sectionId: "g-data",
    fieldRef: "B17",
    severity: "warning",
    trigger: "submit",
    message: "POPIA Information Officer flag not set",
    evaluate: (wb) => Boolean(String(readEsgCell(wb, "g-data", "B17") ?? "").trim()),
  },
  {
    id: "g-data.score-positive",
    scope: "field",
    sectionId: "g-data",
    fieldRef: "F26",
    severity: "warning",
    trigger: "submit",
    message: "Governance total score is 0",
    evaluate: (wb) => {
      const total = readEsgCell(wb, "g-data", "F26");
      if (total != null && Number(total) > 0) return true;
      const sum =
        (readEsgCell(wb, "g-data", "F13") ?? 0) +
        (readEsgCell(wb, "g-data", "F14") ?? 0) +
        (readEsgCell(wb, "g-data", "F15") ?? 0);
      return Number(sum) > 0;
    },
  },
  {
    id: "ee.ee-plan",
    scope: "field",
    sectionId: "ee",
    fieldRef: "B9",
    severity: "warning",
    trigger: "submit",
    message: "EE plan submission status not set",
    evaluate: (wb) => Boolean(String(readEsgCell(wb, "ee", "B9") ?? "").trim()),
  },
  {
    id: "fleet.has-rows",
    scope: "section",
    sectionId: "fleet",
    fieldRef: "_rows",
    severity: "warning",
    trigger: "submit",
    message: "Fleet register is empty",
    evaluate: (wb) => {
      const rows = wb.sections?.fleet?.cells?._rows;
      return Array.isArray(rows) && rows.length > 0;
    },
  },
  {
    id: "king5-principles",
    scope: "section",
    sectionId: "king5",
    fieldRef: "_principles_filled",
    severity: "error",
    trigger: "submit",
    message: "King V requires all 17 principle statuses",
    evaluate: (wb) => countKing5Principles(wb) === 17,
  },
  {
    id: "ifrs.disclosures-started",
    scope: "section",
    sectionId: "ifrs",
    fieldRef: "_yes_count",
    severity: "warning",
    trigger: "submit",
    message: "No IFRS S1/S2 disclosures marked Disclosed",
    evaluate: (wb) => {
      const n = readEsgCell(wb, "ifrs", "_yes_count");
      return n != null && Number(n) > 0;
    },
  },
];

/** Legacy month/score checks kept for backward-compatible issue ids. */
const LEGACY_RULES: EsgRule[] = [
  {
    id: "e-diesel",
    scope: "section",
    sectionId: "e-data",
    severity: "error",
    trigger: "submit",
    message: "E_Data: Fleet diesel months (9)",
    evaluate: (wb) => countPositiveMonths(wb, "e-data") === 9,
  },
  {
    id: "e-electricity",
    scope: "section",
    sectionId: "e-data",
    severity: "error",
    trigger: "submit",
    message: "E_Data: Electricity kWh months (9)",
    evaluate: (wb) => countPositiveMonths(wb, "e-data") === 9,
  },
  {
    id: "e-water",
    scope: "section",
    sectionId: "e-data",
    severity: "error",
    trigger: "submit",
    message: "E_Data: Water kL months (9)",
    evaluate: (wb) => countPositiveMonths(wb, "e-data") === 9,
  },
  {
    id: "s-ee-headcount",
    scope: "field",
    sectionId: "s-data",
    severity: "error",
    trigger: "submit",
    message: "S_Data: EE headcount entered (>0)",
    evaluate: (wb) => (readEsgCell(wb, "s-data", "L12") ?? 0) > 0,
  },
  {
    id: "e-score",
    scope: "section",
    sectionId: "e-data",
    severity: "error",
    trigger: "submit",
    message: "E_Scorecard: Total score >0",
    evaluate: (wb) => (readEsgCell(wb, "e-data", "D30") ?? 0) > 0,
  },
  {
    id: "s-score",
    scope: "section",
    sectionId: "s-data",
    severity: "error",
    trigger: "submit",
    message: "S_Scorecard: Total score >0",
    evaluate: (wb) => (readEsgCell(wb, "s-data", "D28") ?? 0) > 0,
  },
  {
    id: "g-score",
    scope: "section",
    sectionId: "g-data",
    severity: "error",
    trigger: "submit",
    message: "G_Scorecard: Total score >0",
    evaluate: (wb) => (readEsgCell(wb, "g-data", "D26") ?? 0) > 0,
  },
];

export function evaluateEsgRules(
  workbook: EsgWorkbookData | null,
  touched: EsgTouchedState = {},
  mode: EsgRulesMode = "live",
): EsgRuleEvaluation[] {
  if (mode === "silent") {
    return [];
  }

  if (!workbook) {
    return [
      {
        id: "no-workbook",
        message: "Workbook data loaded",
        severity: "error",
        sectionId: "workbook",
        pass: false,
        pending: false,
        expected: "Saved sections",
        actual: "None",
      },
    ];
  }

  const rules = mode === "submit" ? [...ESG_PHASE1_RULES, ...LEGACY_RULES] : ESG_PHASE1_RULES;
  const seen = new Set<string>();

  return rules
    .filter((rule) => {
      if (seen.has(rule.id)) return false;
      seen.add(rule.id);
      return true;
    })
    .map((rule) => {
      const shouldRun =
        rule.trigger === "always" ||
        rule.trigger === "submit" && mode === "submit" ||
        rule.trigger === "touched" && isTouched(touched, rule.sectionId, rule.fieldRef);

      const pending = !shouldRun && mode === "live";
      const pass = shouldRun ? rule.evaluate(workbook, touched) : true;
      const severity = mode === "submit" && !pass && rule.severity === "warning" ? "error" : rule.severity;

      return {
        id: rule.id,
        message: rule.message,
        severity,
        sectionId: rule.sectionId,
        fieldRef: rule.fieldRef,
        pass,
        pending,
        expected: rule.trigger === "submit" ? "Pass on submit" : "Pass when touched",
        actual: pass ? "Yes" : pending ? "Pending" : "No",
      };
    });
}
