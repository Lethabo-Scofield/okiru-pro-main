/**
 * Where a company's targets come from.
 *
 * THE RULING THIS IMPLEMENTS
 *
 * "For E the company needs to determine their own targets... For S we also
 * cannot follow the B-BBEE target because ESG does not have targets. This means
 * we either allow the client to set their own targets, which could be the
 * EE/B-BBEE targets, or they could want to track employees over time as opposed
 * to meeting targets."
 * — Z. Mnanzana, Q1/Q3/Q4, 14 September 2026.
 *
 * The toolkit graded every company against eight numbers nobody outside the
 * office had approved: a 10% annual emissions cut, 20% renewable electricity,
 * 75% waste diversion, 60% black employees, 40 training hours per employee, an
 * injury rate of 2.0, 1% of profit on community spend and 40% local
 * procurement. They were applied identically to a bank, a school and a
 * road-freight distributor, and several have no standing in ESG at all — they
 * are B-BBEE targets borrowed into a framework that does not set targets.
 *
 * So the basis is now the company's declaration:
 *
 *   own    — the company sets each target itself. A target it has not set
 *            cannot be scored, and that indicator leaves the total.
 *   bbbee  — the company elects to be measured against the B-BBEE / EE targets.
 *            This is a real choice a client can make, but it must be a CHOICE.
 *   trend  — the company tracks movement over time rather than meeting a
 *            target. Nothing target-based is scored; the figures still report.
 *
 * Undeclared is not a fourth option with a default. It means we have not asked
 * yet, and scoring against an invented target would be exactly the thing the
 * expert said we cannot do — so those indicators are excluded and named, and
 * the product has to go and ask.
 */
import { readEsgCell, readEsgText, type EsgWorkbookData } from "@/lib/esgWorkbookStorage";

export type EsgTargetBasis = "own" | "bbbee" | "trend" | "undeclared";

/** The dropdown the client picks from. */
export const ESG_TARGET_BASIS_OPTIONS = [
  "Company's own targets",
  "B-BBEE / Employment Equity targets",
  "Trend only — track movement, do not score against targets",
] as const;

export function readTargetBasis(workbook: EsgWorkbookData | null | undefined): EsgTargetBasis {
  const raw = readEsgText(workbook, "assumptions", "_targetBasis").trim().toLowerCase();
  if (!raw) return "undeclared";
  if (raw.startsWith("company")) return "own";
  if (raw.startsWith("b-bbee") || raw.startsWith("bbbee")) return "bbbee";
  if (raw.startsWith("trend")) return "trend";
  return "undeclared";
}

/** Why an indicator could not be scored, in words a report can print. */
export const TARGET_BASIS_REASON: Record<Exclude<EsgTargetBasis, "bbbee" | "own">, string> = {
  undeclared:
    "The company has not declared how its targets are set, so this indicator cannot be scored against one. ESG frameworks do not prescribe targets; the company chooses its own, elects the B-BBEE targets, or tracks the trend instead.",
  trend:
    "The company tracks this measure over time rather than against a target, so it is reported but not scored.",
};

export function targetNotSetReason(label: string): string {
  return `The company sets its own targets and has not set one for ${label}, so there is nothing to score against. The figure is still reported.`;
}

/**
 * Resolve the target for one indicator, or `null` when it cannot be scored.
 *
 * `bbbeeDefault` is only ever reached when the company has ELECTED the B-BBEE
 * basis. It is never a silent fallback — that was the defect.
 */
export function resolveTarget(
  workbook: EsgWorkbookData,
  cell: string,
  bbbeeDefault: number,
  basis: EsgTargetBasis,
): number | null {
  const stated = readEsgCell(workbook, "assumptions", cell);
  switch (basis) {
    case "bbbee":
      return stated ?? bbbeeDefault;
    case "own":
      return stated;
    case "trend":
    case "undeclared":
      return null;
  }
}
