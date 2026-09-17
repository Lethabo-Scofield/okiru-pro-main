import { ESG_SELECT, ESG_TABLE_CELL, ESG_TABLE_HEAD, ESG_TABLE_INPUT } from "./esgEditorChrome";

/** Points a Yes / Partial / No answer is worth. `No` and blank are always 0. */
export type MaturityYnPoints = { yes: number; partial: number };

/** The governance sheet's rule: `=IF(Bn="Yes",5,IF(Bn="Partial",2.5,0))`. */
export const DEFAULT_YN_POINTS: MaturityYnPoints = { yes: 5, partial: 2.5 };

export type MaturityRowDef = {
  cell: string;
  /**
   * The workbook's own score cell for this row, where one exists.
   *
   * It is DERIVED (`esgDeriveSummary.ts` writes it from the value cell and the
   * relevant threshold). This grid NEVER writes it — it only displays it when
   * the loaded workbook already carries a value, e.g. an imported workbook.
   * Omit it for rows the workbook has no score cell for.
   */
  scoreCell?: string;
  label: string;
  /**
   * `yn`      — Yes / Partial / No; this grid can score it locally.
   * `numeric` — a quantity or ratio scored against a threshold elsewhere; this
   *             grid cannot score it, so it shows the derived score or nothing.
   * `count`   — a countable assertion (e.g. penalties incurred). Same display
   *             rule as `numeric`; kept separate so the label can carry a unit
   *             and so the input is never mistaken for a 0–5 rating.
   */
  kind: "yn" | "numeric" | "count";
  options?: string[];
  /** Per-row Yes/Partial points where the sheet departs from the 5 / 2.5 rule. */
  ynPoints?: MaturityYnPoints;
  /** Unit rendered beside a numeric/count input (e.g. "people", "penalties"). */
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Plain-language explanation shown under the label. */
  helpText?: string;
};

export function maturityScoreFromYn(value: string, points: MaturityYnPoints = DEFAULT_YN_POINTS): number {
  const v = value.trim().toLowerCase();
  if (v === "yes") return points.yes;
  if (v === "partial") return points.partial;
  return 0;
}

function isAnswered(raw: unknown): boolean {
  return raw !== undefined && raw !== null && String(raw).trim() !== "";
}

function derivedScore(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "" || typeof raw === "boolean") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

type Props = {
  rows: MaturityRowDef[];
  values: Record<string, string | number | boolean | null>;
  onChange: (patch: Record<string, string | number | boolean | null>) => void;
  onTouch?: (fieldRef: string) => void;
  readOnly?: boolean;
};

/**
 * Board / employment-equity capture grid.
 *
 * HONESTY CONTRACT — this component displays, it does not persist derived
 * values. It used to caption its subtotal as though the figure were saved into
 * the governance sheet's total cell (`G_Data!F26`) while writing nothing at all,
 * and to divide every grid by a hardcoded 100. Both claims were false:
 *   • the governance total is `SUM` of the sheet's own score column, which
 *     `esgDeriveSummary.ts` computes from the value cells — writing this grid's
 *     approximation over it would corrupt a derived cell (the same defect class
 *     as typing into the derived banding floor);
 *   • the employment-equity sheet scores its rows on different weights
 *     (20 / 10 / 10 / 5 …), so 100 was never that grid's denominator.
 * The subtotal below therefore covers only the Yes / Partial / No rows this
 * grid can score itself, against the sum of THOSE rows' weights. Quantities are
 * shown with their derived score when the workbook carries one, and blank when
 * it does not — never with the raw value dressed up as a score.
 */
export function EsgMaturityGrid({ rows, values, onChange, onTouch, readOnly }: Props) {
  let ynScore = 0;
  let ynMax = 0;
  let answered = 0;

  for (const row of rows) {
    if (isAnswered(values[row.cell])) answered += 1;
    if (row.kind !== "yn") continue;
    const points = row.ynPoints ?? DEFAULT_YN_POINTS;
    ynMax += points.yes;
    ynScore += maturityScoreFromYn(String(values[row.cell] ?? ""), points);
  }

  const quantityRows = rows.filter((r) => r.kind !== "yn").length;

  return (
    <div className="space-y-3" data-testid="esg-maturity-grid">
      <table className="w-full border-collapse">
        <thead>
          <tr className={ESG_TABLE_HEAD}>
            <th className={ESG_TABLE_CELL}>Metric</th>
            <th className={ESG_TABLE_CELL}>Value</th>
            <th className={ESG_TABLE_CELL}>Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const raw = values[row.cell];
            const points = row.ynPoints ?? DEFAULT_YN_POINTS;
            const stored = row.scoreCell ? derivedScore(values[row.scoreCell]) : null;
            const score =
              row.kind === "yn"
                ? maturityScoreFromYn(String(raw ?? ""), points)
                : stored;
            return (
              <tr key={row.cell}>
                <td className={ESG_TABLE_CELL}>
                  {row.label}
                  {row.helpText ? (
                    <p className="text-[11px] text-[var(--esg-text2)] mt-0.5 leading-snug">
                      {row.helpText}
                    </p>
                  ) : null}
                </td>
                <td className={ESG_TABLE_CELL}>
                  {row.kind === "yn" ? (
                    <select
                      disabled={readOnly}
                      value={String(raw ?? "")}
                      onChange={(e) => {
                        onTouch?.(row.cell);
                        onChange({ [row.cell]: e.target.value });
                      }}
                      className={ESG_SELECT}
                    >
                      <option value="">—</option>
                      {(row.options ?? ["Yes", "Partial", "No", "N/A"]).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="inline-flex items-baseline gap-1.5">
                      <input
                        type="number"
                        min={row.min ?? 0}
                        max={row.max}
                        step={row.step}
                        disabled={readOnly}
                        value={raw ?? ""}
                        onChange={(e) => {
                          onTouch?.(row.cell);
                          onChange({
                            [row.cell]: e.target.value === "" ? "" : Number(e.target.value),
                          });
                        }}
                        className={ESG_TABLE_INPUT}
                      />
                      {row.unit ? (
                        <span className="text-[11px] text-[var(--esg-text3)]">{row.unit}</span>
                      ) : null}
                    </span>
                  )}
                </td>
                <td className={`${ESG_TABLE_CELL} text-[#8e8e93]`}>
                  {score == null ? "—" : score}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="space-y-0.5 text-[12px] text-[var(--esg-text2)]">
        <div>
          Answered: <span data-testid="maturity-answered">{answered}</span> of {rows.length}
        </div>
        {ynMax > 0 ? (
          <div>
            Yes / Partial / No subtotal: <span data-testid="maturity-total">{ynScore}</span> of{" "}
            <span data-testid="maturity-total-max">{ynMax}</span>
          </div>
        ) : null}
        {quantityRows > 0 ? (
          <p className="text-[11px] text-[#636366]">
            Quantities are scored against their targets when the scorecard is recalculated, so no
            score shows here until the workbook has been saved and recalculated.
          </p>
        ) : null}
      </div>
    </div>
  );
}
