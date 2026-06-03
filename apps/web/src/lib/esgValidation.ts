import { readEsgCell, type EsgWorkbookData } from "./esgWorkbookStorage";
import { countKing5Principles } from "./esgGridRows";

export type EsgValidationIssue = {
  id: string;
  label: string;
  severity: "critical" | "warning";
  pass: boolean;
  expected: string;
  actual: string;
};

export type EsgValidationAggregate = {
  ok: boolean;
  issues: EsgValidationIssue[];
  blockers: EsgValidationIssue[];
};

/** Critical rules from Validation sheet rows 5–11 (Phase 1 subset). */
export function validateEsgWorkbook(workbook: EsgWorkbookData | null): EsgValidationIssue[] {
  if (!workbook) {
    return [
      {
        id: "no-workbook",
        label: "Workbook data loaded",
        severity: "critical",
        pass: false,
        expected: "Saved sections",
        actual: "None",
      },
    ];
  }

  const dieselMonths = countPositiveMonths(workbook, "e-data", "C14", "K14");
  const electricityMonths = countPositiveMonths(workbook, "e-data", "C44", "K44");
  const waterMonths = countPositiveMonths(workbook, "e-data", "C61", "K61");
  const eeHeadcount = readEsgCell(workbook, "s-data", "L12") ?? 0;
  const eScore = readEsgCell(workbook, "e-data", "D30") ?? 0;
  const sScore = readEsgCell(workbook, "s-data", "D28") ?? 0;
  const gScore = readEsgCell(workbook, "g-data", "D26") ?? 0;
  const king5Filled = countKing5Principles(workbook);

  return [
    monthCheck("e-diesel", "E_Data: Fleet diesel months (9)", dieselMonths, 9),
    monthCheck("e-electricity", "E_Data: Electricity kWh months (9)", electricityMonths, 9),
    monthCheck("e-water", "E_Data: Water kL months (9)", waterMonths, 9),
    {
      id: "s-ee-headcount",
      label: "S_Data: EE headcount entered (>0)",
      severity: "critical",
      pass: eeHeadcount > 0,
      expected: "Yes",
      actual: eeHeadcount > 0 ? "Yes" : "No",
    },
    scoreCheck("e-score", "E_Scorecard: Total score >0", eScore),
    scoreCheck("s-score", "S_Scorecard: Total score >0", sScore),
    scoreCheck("g-score", "G_Scorecard: Total score >0", gScore),
    {
      id: "king5-principles",
      label: "King5: All 17 principles have status",
      severity: "critical",
      pass: king5Filled === 17,
      expected: "17",
      actual: String(king5Filled),
    },
  ];
}

/** Submit gate — Validation C12: COUNTA(King5!C4:C30) must equal 17. */
export function validateEsgWorkbookForSubmit(
  workbook: EsgWorkbookData | null,
): EsgValidationAggregate {
  const issues = validateEsgWorkbook(workbook);
  const blockers = issues.filter((i) => !i.pass && i.severity === "critical");
  return {
    ok: blockers.length === 0,
    issues,
    blockers,
  };
}

function monthCheck(
  id: string,
  label: string,
  actual: number,
  expected: number,
): EsgValidationIssue {
  return {
    id,
    label,
    severity: "critical",
    pass: actual === expected,
    expected: String(expected),
    actual: String(actual),
  };
}

function scoreCheck(id: string, label: string, score: number): EsgValidationIssue {
  return {
    id,
    label,
    severity: "critical",
    pass: score > 0,
    expected: "Yes",
    actual: score > 0 ? "Yes" : "No",
  };
}

/** Count month columns with value > 0 — stub reads individual month cells if present. */
function countPositiveMonths(
  workbook: EsgWorkbookData,
  sectionId: string,
  startCol: string,
  endCol: string,
): number {
  const cols = monthColumns(startCol, endCol);
  let count = 0;
  for (const col of cols) {
    const v = readEsgCell(workbook, sectionId, `${col}14`) ??
      readEsgCell(workbook, sectionId, `${col}44`) ??
      readEsgCell(workbook, sectionId, `${col}61`) ??
      readEsgCell(workbook, sectionId, `${col}`);
    if (v != null && v > 0) count++;
  }
  const stored = readEsgCell(workbook, sectionId, `_months_${startCol}_${endCol}`);
  if (stored != null) return stored;
  return count;
}

function monthColumns(start: string, end: string): string[] {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const si = letters.indexOf(start.replace(/\d/g, ""));
  const ei = letters.indexOf(end.replace(/\d/g, ""));
  if (si < 0 || ei < 0) return [];
  return letters.slice(si, ei + 1).split("");
}
